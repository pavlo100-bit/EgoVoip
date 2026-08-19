import JsSIP from 'jssip';
import InCallManager from 'react-native-incall-manager';
import { ENV } from '../config/env';
import { Emitter } from './emitter';
import type {
  CallDirection,
  CallStatus,
  CallView,
  RegistrationStatus,
  SipCredentials,
  SipSnapshot,
} from '../types';

/** Internal record: pairs the JsSIP session with the state the UI needs. */
interface CallRecord {
  id: string;
  session: any; // JsSIP.RTCSession
  direction: CallDirection;
  remoteNumber: string;
  remoteName: string;
  status: CallStatus;
  muted: boolean;
  createdAt: number;
  answeredAt: number | null;
}

export interface CallEndedInfo {
  number: string;
  name: string;
  direction: CallDirection;
  startedAt: number;
  durationSec: number;
  /** Inbound call that was never answered. */
  missed: boolean;
}

/** Two legs max — enough for add-call + merge, and all a mobile CPU wants. */
const MAX_CALLS = 2;

/**
 * Owns every piece of SIP/WebRTC state. Deliberately a plain singleton rather
 * than React state: the UA must survive screen unmounts and navigation, and an
 * incoming INVITE can arrive while no component is mounted.
 */
class SipEngine extends Emitter {
  private ua: any = null;
  private credentials: SipCredentials | null = null;
  private calls = new Map<string, CallRecord>();

  private registration: RegistrationStatus = 'unregistered';
  private registrationError: string | null = null;
  private activeCallId: string | null = null;
  private conference = false;
  /** Room to dial once both REFERed legs have torn down. */
  private pendingConferenceRoom: string | null = null;
  private conferenceTimer: ReturnType<typeof setTimeout> | null = null;
  private speakerOn = false;
  private audioSessionOpen = false;

  private snapshot: SipSnapshot = {
    registration: 'unregistered',
    registrationError: null,
    calls: [],
    activeCallId: null,
    conference: false,
    conferenceSupported: false,
    speakerOn: false,
  };

  /** Set by the app so ended calls land in the local call log. */
  onCallEnded: ((info: CallEndedInfo) => void) | null = null;

  // ---------------------------------------------------------------- snapshot

  getSnapshot = (): SipSnapshot => this.snapshot;

  private publish(): void {
    this.snapshot = {
      registration: this.registration,
      registrationError: this.registrationError,
      calls: [...this.calls.values()].map(toView),
      activeCallId: this.activeCallId,
      conference: this.conference,
      conferenceSupported: !!this.credentials?.conferenceBridge,
      speakerOn: this.speakerOn,
    };
    this.emit();
  }

  // ------------------------------------------------------------ registration

  async start(credentials: SipCredentials): Promise<void> {
    if (this.ua) await this.stop();

    this.credentials = credentials;
    this.registration = 'connecting';
    this.registrationError = null;
    this.publish();

    const socket = new JsSIP.WebSocketInterface(credentials.wsUri);

    this.ua = new JsSIP.UA({
      uri: `sip:${credentials.username}@${credentials.domain}`,
      password: credentials.password,
      display_name: credentials.displayName ?? credentials.username,
      sockets: [socket],
      register: true,
      register_expires: ENV.REGISTER_EXPIRES,
      session_timers: true,
      user_agent: 'EgoVoip/1.0',
    });

    this.ua.on('connecting', () => {
      console.log('[sip-diag] WebSocket connecting to', credentials.wsUri);
      this.registration = 'connecting';
      this.publish();
    });

    // Fires once the WebSocket transport itself opens — before any SIP
    // REGISTER is sent. Distinct from 'registered', which only fires after a
    // 200 OK to that REGISTER.
    this.ua.on('connected', () => {
      console.log('[sip-diag] WebSocket connected — sending REGISTER next');
    });

    this.ua.on('disconnected', (e: any) => {
      console.log(
        '[sip-diag] WebSocket disconnected. error:', !!e?.error,
        'code:', e?.code, 'reason:', e?.reason ?? '(none)',
      );
      this.registration = 'failed';
      this.registrationError = e?.error
        ? `Transport error: ${e.reason ?? 'websocket closed'}`
        : 'Disconnected';
      this.publish();
    });

    this.ua.on('registered', (e: any) => {
      const resp = e?.response;
      console.log(
        '[sip-diag] REGISTER succeeded. status:', resp?.status_code,
        resp?.reason_phrase, '| Expires:', resp?.getHeader?.('Expires') ?? '(none)',
      );
      this.registration = 'registered';
      this.registrationError = null;
      this.publish();
    });

    this.ua.on('unregistered', (e: any) => {
      console.log('[sip-diag] UA unregistered. cause:', e?.cause ?? '(none)');
      this.registration = 'unregistered';
      this.publish();
    });

    this.ua.on('registrationFailed', (e: any) => {
      const resp = e?.response;
      console.log(
        '[sip-diag] REGISTER failed. cause:', e?.cause,
        '| status:', resp?.status_code ?? '(no response)', resp?.reason_phrase ?? '',
      );
      this.registration = 'failed';
      this.registrationError = describeCause(e?.cause) ?? 'Registration failed';
      this.publish();
    });

    this.ua.on('newRTCSession', this.handleNewSession);

    this.ua.start();
  }

  async stop(): Promise<void> {
    for (const record of this.calls.values()) {
      try {
        record.session.terminate();
      } catch {
        /* session may already be dead */
      }
    }
    this.calls.clear();
    this.activeCallId = null;
    this.conference = false;
    this.pendingConferenceRoom = null;
    this.clearConferenceTimer();
    this.closeAudioSession();

    if (this.ua) {
      // TEMPORARY — stop() strips listeners before ua.stop(), so a
      // disconnect caused by OUR code calling stop() would otherwise never
      // reach the [sip-diag] event listeners at all. This line is the only
      // way to see it happened.
      console.log('[sip-diag] SipEngine.stop() tearing down an active UA');
      this.ua.removeAllListeners();
      this.ua.stop();
      this.ua = null;
    }
    this.credentials = null;
    this.registration = 'unregistered';
    this.registrationError = null;
    this.publish();
  }

  get isRegistered(): boolean {
    return this.registration === 'registered';
  }

  // ---------------------------------------------------------------- outbound

  /**
   * @param target bare number or full SIP URI. Bare numbers are qualified with
   *               the registered domain.
   * @returns the call id, for navigating straight to the in-call screen.
   */
  call(target: string): string | null {
    if (!this.ua || !this.credentials) throw new Error('SIP is not connected');
    if (this.calls.size >= MAX_CALLS) throw new Error('Too many active calls');

    const uri = toSipUri(target, this.credentials.domain);
    if (!uri) throw new Error('Enter a number to call');

    // Any existing call must go on hold before a second leg opens the mic.
    for (const record of this.calls.values()) {
      if (record.status === 'active') this.hold(record.id);
    }

    const session = this.ua.call(uri, {
      mediaConstraints: { audio: true, video: false },
      pcConfig: { iceServers: this.iceServers() },
      sessionTimersExpires: 120,
    });

    // JsSIP fires 'newRTCSession' synchronously inside ua.call(), so the record
    // already exists by the time we get here.
    const id = session?.id ?? null;
    if (id) this.activeCallId = id;
    this.publish();
    return id;
  }

  // ----------------------------------------------------------------- inbound

  private handleNewSession = (e: any): void => {
    const session = e.session;
    const direction: CallDirection =
      e.originator === 'remote' ? 'inbound' : 'outbound';

    // Busy: one leg in reserve is fine, two is not.
    if (direction === 'inbound' && this.calls.size >= MAX_CALLS) {
      session.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
      return;
    }

    const record: CallRecord = {
      id: session.id,
      session,
      direction,
      remoteNumber: session.remote_identity?.uri?.user ?? 'unknown',
      remoteName:
        session.remote_identity?.display_name ||
        session.remote_identity?.uri?.user ||
        'Unknown',
      status: direction === 'inbound' ? 'ringing' : 'connecting',
      muted: false,
      createdAt: Date.now(),
      answeredAt: null,
    };

    this.calls.set(record.id, record);
    if (!this.activeCallId) this.activeCallId = record.id;

    this.attachSessionHandlers(record);

    // Only ring when nothing else is on the line; a second inbound call while
    // talking should beep, not blast the ringtone.
    if (direction === 'inbound' && this.calls.size === 1) {
      startRingtone();
    }

    this.publish();
  };

  private attachSessionHandlers(record: CallRecord): void {
    const { session, id } = record;

    session.on('progress', () => {
      const r = this.calls.get(id);
      if (!r || r.direction !== 'outbound') return;
      r.status = 'ringing';
      this.openAudioSession();
      InCallManager.startRingback('_BUNDLE_');
      this.publish();
    });

    session.on('accepted', () => {
      InCallManager.stopRingback();
      InCallManager.stopRingtone();
    });

    session.on('confirmed', () => {
      const r = this.calls.get(id);
      if (!r) return;
      r.status = 'active';
      r.answeredAt = r.answeredAt ?? Date.now();
      this.activeCallId = id;
      InCallManager.stopRingback();
      InCallManager.stopRingtone();
      this.openAudioSession();
      this.publish();
    });

    session.on('hold', () => {
      const r = this.calls.get(id);
      if (!r) return;
      r.status = 'held';
      this.publish();
    });

    session.on('unhold', () => {
      const r = this.calls.get(id);
      if (!r) return;
      r.status = 'active';
      this.activeCallId = id;
      this.publish();
    });

    const finish = (e: any) => this.finalize(id, e?.cause);
    session.on('ended', finish);
    session.on('failed', finish);
  }

  answer(callId: string): void {
    const record = this.calls.get(callId);
    if (!record || record.direction !== 'inbound') return;

    // Answering with another call up: hold the other leg first.
    for (const other of this.calls.values()) {
      if (other.id !== callId && other.status === 'active') this.hold(other.id);
    }

    InCallManager.stopRingtone();
    record.session.answer({
      mediaConstraints: { audio: true, video: false },
      pcConfig: { iceServers: this.iceServers() },
    });
    this.activeCallId = callId;
    this.publish();
  }

  reject(callId: string): void {
    const record = this.calls.get(callId);
    if (!record) return;
    InCallManager.stopRingtone();
    try {
      record.session.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
    } catch {
      this.finalize(callId, 'Rejected');
    }
  }

  hangup(callId?: string): void {
    const id = callId ?? this.activeCallId;
    if (!id) return;
    const record = this.calls.get(id);
    if (!record) return;
    try {
      record.session.terminate();
    } catch {
      this.finalize(id, 'Terminated');
    }
  }

  hangupAll(): void {
    for (const id of [...this.calls.keys()]) this.hangup(id);
  }

  // ------------------------------------------------------------- in-call ops

  setMuted(callId: string, muted: boolean): void {
    const record = this.calls.get(callId);
    if (!record) return;
    if (muted) record.session.mute({ audio: true });
    else record.session.unmute({ audio: true });
    record.muted = muted;
    this.publish();
  }

  toggleMute(callId?: string): void {
    const id = callId ?? this.activeCallId;
    if (!id) return;
    const record = this.calls.get(id);
    if (record) this.setMuted(id, !record.muted);
  }

  /**
   * Speaker routing is a device-level concern, not a per-call one — it applies
   * to whichever leg currently owns the audio session.
   */
  setSpeaker(on: boolean): void {
    InCallManager.setForceSpeakerphoneOn(on);
    this.speakerOn = on;
    this.publish();
  }

  toggleSpeaker(): void {
    this.setSpeaker(!this.speakerOn);
  }

  hold(callId?: string): void {
    const id = callId ?? this.activeCallId;
    if (!id) return;
    this.calls.get(id)?.session.hold();
  }

  unhold(callId?: string): void {
    const id = callId ?? this.activeCallId;
    if (!id) return;
    const record = this.calls.get(id);
    if (!record) return;
    // Only one leg may hold the mic.
    for (const other of this.calls.values()) {
      if (other.id !== id && other.status === 'active') other.session.hold();
    }
    record.session.unhold();
  }

  /** Swap: park the live leg and bring the held one forward. */
  swap(): void {
    const active = [...this.calls.values()].find(c => c.status === 'active');
    const held = [...this.calls.values()].find(c => c.status === 'held');
    if (!held) return;
    if (active) active.session.hold();
    held.session.unhold();
    this.activeCallId = held.id;
    this.publish();
  }

  sendDTMF(tone: string, callId?: string): void {
    const id = callId ?? this.activeCallId;
    if (!id) return;
    // RFC 2833 out-of-band; JsSIP falls back to INFO if that is what the PBX
    // negotiated.
    this.calls.get(id)?.session.sendDTMF(tone, { transportType: 'RFC2833' });
  }

  /**
   * Merge both legs into a three-way call.
   *
   * WebRTC on mobile cannot mix two remote audio streams locally — there is no
   * usable WebAudio graph in react-native-webrtc. So the merge is done by the
   * PBX: we REFER both parties into a conference room and follow them in. This
   * requires `conferenceBridge` in the credentials payload and a matching room
   * on the PBX (Asterisk ConfBridge, FreeSWITCH mod_conference, ...).
   */
  merge(): void {
    if (!this.credentials) return;
    const bridge = this.credentials.conferenceBridge;
    if (!bridge) {
      throw new Error('Conferencing is not enabled for this account');
    }
    const legs = [...this.calls.values()];
    if (legs.length !== 2) throw new Error('Need exactly two calls to merge');

    const room = `${bridge}${this.credentials.username}`;
    const roomUri = toSipUri(room, this.credentials.domain)!;

    // We cannot dial the room yet — both legs still occupy the MAX_CALLS
    // budget. REFER teardown is asynchronous, so finalize() places the call
    // once the last leg is gone.
    this.conference = true;
    this.pendingConferenceRoom = room;

    for (const leg of legs) {
      // Blind REFER: the PBX re-INVITEs the far end into the room and tears
      // down our leg, which surfaces here as a normal 'ended' event.
      leg.session.refer(roomUri);
    }

    // If the PBX rejects the REFERs the legs stay up and we would sit in a
    // conference state forever. Bail out after a few seconds.
    this.conferenceTimer = setTimeout(() => {
      if (this.pendingConferenceRoom) {
        this.pendingConferenceRoom = null;
        this.conference = false;
        this.publish();
      }
    }, 8000);

    this.publish();
  }

  private clearConferenceTimer(): void {
    if (this.conferenceTimer) {
      clearTimeout(this.conferenceTimer);
      this.conferenceTimer = null;
    }
  }

  // ------------------------------------------------------------------ private

  private iceServers() {
    return this.credentials?.iceServers?.length
      ? this.credentials.iceServers
      : ENV.ICE_SERVERS;
  }

  private openAudioSession(): void {
    if (this.audioSessionOpen) return;
    // auto:false — we drive ringback/ringtone explicitly above.
    InCallManager.start({ media: 'audio', auto: false });
    InCallManager.setForceSpeakerphoneOn(this.speakerOn);
    this.audioSessionOpen = true;
  }

  private closeAudioSession(): void {
    if (!this.audioSessionOpen) return;
    InCallManager.stopRingback();
    InCallManager.stopRingtone();
    InCallManager.stop();
    this.audioSessionOpen = false;
    this.speakerOn = false;
  }

  private finalize(callId: string, cause?: string): void {
    const record = this.calls.get(callId);
    if (!record) return;

    this.calls.delete(callId);

    const durationSec = record.answeredAt
      ? Math.max(0, Math.round((Date.now() - record.answeredAt) / 1000))
      : 0;

    this.onCallEnded?.({
      number: record.remoteNumber,
      name: record.remoteName,
      direction: record.direction,
      startedAt: record.createdAt,
      durationSec,
      missed: record.direction === 'inbound' && record.answeredAt === null,
    });

    if (this.activeCallId === callId) {
      const survivor = [...this.calls.values()][0];
      this.activeCallId = survivor?.id ?? null;
      // Bringing the survivor back is the expected behaviour once the other
      // leg of a two-call session goes away.
      if (survivor && survivor.status === 'held' && !this.conference) {
        survivor.session.unhold();
      }
    }

    if (this.calls.size === 0) {
      const room = this.pendingConferenceRoom;
      if (room) {
        // Both legs have been REFERed into the bridge; follow them in. Keep the
        // audio session open so the earpiece/speaker choice carries over.
        this.pendingConferenceRoom = null;
        this.clearConferenceTimer();
        if (cause) console.log(`[sip] call ${callId} ended: ${cause}`);
        this.publish();
        try {
          this.call(room);
        } catch (e) {
          console.warn('[sip] could not join conference room', e);
          this.conference = false;
          this.closeAudioSession();
          this.publish();
        }
        return;
      }
      this.conference = false;
      this.clearConferenceTimer();
      this.closeAudioSession();
    }

    if (cause) console.log(`[sip] call ${callId} ended: ${cause}`);
    this.publish();
  }
}

// -------------------------------------------------------------------- helpers

/**
 * InCallManager.startRingtone takes (ringtone, vibratePattern, iosCategory,
 * seconds). '_BUNDLE_' plays incallmanager_ringtone.mp3 from the app bundle and
 * falls back to the system ringtone when that asset is missing. 30s matches the
 * usual PBX ring timeout.
 */
function startRingtone(): void {
  InCallManager.startRingtone('_BUNDLE_', [0, 1000, 800], 'playback', 30);
}

function toView(record: CallRecord): CallView {
  return {
    id: record.id,
    direction: record.direction,
    remoteNumber: record.remoteNumber,
    remoteName: record.remoteName,
    status: record.status,
    muted: record.muted,
    createdAt: record.createdAt,
    answeredAt: record.answeredAt,
  };
}

/** "0501234567" -> "sip:0501234567@domain"; passes full URIs through. */
export function toSipUri(target: string, domain: string): string | null {
  const raw = target.trim();
  if (!raw) return null;
  if (raw.startsWith('sip:') || raw.startsWith('sips:')) return raw;
  if (raw.includes('@')) return `sip:${raw}`;
  // Keep +, * and # — all valid in a SIP user part and all carry meaning
  // (E.164 prefix, feature codes, IVR input).
  const user = raw.replace(/[^0-9*#+]/g, '');
  return user ? `sip:${user}@${domain}` : null;
}

function describeCause(cause?: string): string | null {
  const causes = (JsSIP as any).C?.causes ?? {};
  switch (cause) {
    case 'Unauthorized':
    case causes.AUTHENTICATION_ERROR:
      return 'Wrong SIP username or password';
    case causes.CONNECTION_ERROR:
      return 'Cannot reach the SIP server';
    case causes.REQUEST_TIMEOUT:
      return 'SIP server did not respond';
    default:
      return cause ?? null;
  }
}

export const sipEngine = new SipEngine();

// TEMPORARY diagnostic — part of the "why does REGISTER drop after ~7s"
// investigation. Fires exactly once per JS module evaluation. If this line
// prints a SECOND time during a single test run, the JS context was torn
// down and rebuilt (Metro full reload / Fast Refresh remounting the module
// tree) — not something our own application code did, since sipEngine is a
// singleton that would otherwise persist for the life of the JS context.
// Remove alongside the other REGISTER-401 diagnostics once resolved.
console.log('[sip-diag] SipEngine module evaluated at', Date.now());
