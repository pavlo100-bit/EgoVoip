import { AppState, DeviceEventEmitter } from 'react-native';
import JsSIP from 'jssip';
import InCallManager from 'react-native-incall-manager';
import { ENV } from '../config/env';
import { Emitter } from './emitter';
// TEMPORARY — outbound call setup timing investigation. Remove alongside
// src/sip/callTimingDiagnostics.ts once resolved.
import { logCallEvent } from './callTimingDiagnostics';
// TEMPORARY — foreground incoming-call investigation. Remove alongside
// src/sip/incomingCallDiagnostics.ts once resolved.
import { logIncoming } from './incomingCallDiagnostics';
// Phase 3b (minimal) — background incoming-call presentation. See
// android/app/src/main/java/com/egovoip/IncomingCallNotifier.kt.
import {
  hideIncomingCallNotification,
  showIncomingCallNotification,
} from '../native/incomingCallNotifier';
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

  /** 'connecting' or 'registered' — a UA that is currently doing something useful. */
  get isActive(): boolean {
    return this.registration === 'connecting' || this.registration === 'registered';
  }

  /** Would start(credentials) be reusing the exact same SIP account currently loaded? */
  hasSameIdentity(credentials: SipCredentials): boolean {
    return sameCredentials(this.credentials, credentials);
  }

  // ------------------------------------------------------------ registration

  /**
   * Idempotency guard — SipEngine is the single owner of the SIP/WebRTC
   * lifecycle, and every caller (cold-start restore, sign-in, the foreground
   * re-registration effect, or a React provider simply remounting because a
   * new Activity/ReactRootView was created — e.g. by the incoming-call
   * notification's full-screen intent bringing MainActivity forward) may
   * call start() at any time, including while a call is ringing. Without
   * this guard, start() unconditionally called stop() first, which
   * terminates every live call — this is exactly what tore down a
   * just-arrived incoming RTCSession the instant the notification remounted
   * the root provider (confirmed by real-device logs: 'session failed |
   * originator: local, cause: Rejected' fired ~8ms after the provider's
   * mount effect re-ran with unchanged credentials).
   *
   * The check lives here, in start() itself, rather than in each caller —
   * a caller-side check is only as strong as the least careful caller (and
   * there is no way to audit every future call site); centralizing it here
   * gives every current and future caller the same protection automatically.
   */
  async start(credentials: SipCredentials): Promise<void> {
    if (this.ua) {
      const same = sameCredentials(this.credentials, credentials);
      if (same && this.isActive) {
        console.log('[keepalive-diag] SipEngine.start skipped — already active with same identity');
        return;
      }
      console.log(
        same
          ? '[keepalive-diag] SipEngine.start reconnecting — existing UA present but not active (same identity)'
          : '[keepalive-diag] actual account change — restarting SipEngine',
      );
      await this.stop();
    }

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
      console.log('[keepalive-diag] WebSocket connected');
    });

    this.ua.on('disconnected', (e: any) => {
      console.log(
        '[sip-diag] WebSocket disconnected. error:', !!e?.error,
        'code:', e?.code, 'reason:', e?.reason ?? '(none)',
      );
      console.log('[keepalive-diag] WebSocket disconnected. error:', !!e?.error, 'reason:', e?.reason ?? '(none)');
      this.registration = 'failed';
      this.registrationError = e?.error
        ? `Transport error: ${e.reason ?? 'websocket closed'}`
        : 'Disconnected';
      // A ringing inbound session has no way to ever receive a CANCEL/BYE
      // now that the transport is gone — without this, the ringtone/
      // notification would play forever since the terminal JsSIP event
      // ('ended'/'failed') this normally relies on will never arrive.
      for (const record of [...this.calls.values()]) {
        if (record.status === 'ringing') {
          logIncoming('finalizing ringing call — transport lost', `callId: ${record.id}`);
          stopRingtone('WebSocket disconnected while ringing');
          this.finalize(record.id, 'Transport lost while ringing');
        }
      }
      this.publish();
    });

    this.ua.on('registered', (e: any) => {
      const resp = e?.response;
      console.log(
        '[sip-diag] REGISTER succeeded. status:', resp?.status_code,
        resp?.reason_phrase, '| Expires:', resp?.getHeader?.('Expires') ?? '(none)',
      );
      console.log('[keepalive-diag] REGISTER succeeded (status', resp?.status_code, ')');
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
    // Safety net: stop() clears `this.calls` directly below rather than
    // routing each record through finalize(), so it's the one teardown path
    // that would otherwise bypass every other stopRingtone() call site.
    stopRingtone('SipEngine.stop()');
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
    logCallEvent('destination normalized', `uri: ${uri}`);

    // Any existing call must go on hold before a second leg opens the mic.
    for (const record of this.calls.values()) {
      if (record.status === 'active') this.hold(record.id);
    }

    logCallEvent('calling ua.call()');
    const session = this.ua.call(uri, {
      mediaConstraints: { audio: true, video: false },
      pcConfig: { iceServers: this.iceServers() },
      sessionTimersExpires: 120,
      eventHandlers: buildIceGatheringEventHandlers(),
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

    if (direction === 'outbound') logCallEvent('RTCSession created', 'originator: local');
    if (direction === 'inbound') {
      logIncoming(
        'incoming RTCSession received',
        `from: ${session.remote_identity?.uri?.user ?? 'unknown'}`,
      );
    }

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
      showIncomingCallNotification(record.id, record.remoteName, record.remoteNumber);
    }

    this.publish();
  };

  private attachSessionHandlers(record: CallRecord): void {
    const { session, id } = record;

    if (record.direction === 'outbound') {
      // TEMPORARY — fires right before request_sender.send(), i.e. the exact
      // moment the INVITE hands off to the transport. Cross-checks the
      // RequestSender-level "INVITE sent (initial)" log in
      // callTimingDiagnostics.ts — they should land within ~0ms of each other.
      session.on('sending', () => logCallEvent('RTCSession "sending" (INVITE handed to transport)'));
    }

    session.on('progress', ({ response }: { response?: { status_code?: number; reason_phrase?: string } }) => {
      const r = this.calls.get(id);
      if (!r || r.direction !== 'outbound') return;
      logCallEvent(
        'RTCSession "progress" (status set to ringing)',
        response ? `status: ${response.status_code} ${response.reason_phrase ?? ''}`.trim() : undefined,
      );
      r.status = 'ringing';
      this.openAudioSession();
      InCallManager.startRingback('_BUNDLE_');
      this.publish();
    });

    session.on('accepted', () => {
      if (record.direction === 'outbound') logCallEvent('RTCSession "accepted"');
      if (record.direction === 'inbound') logIncoming('session accepted');
      InCallManager.stopRingback();
      stopRingtone('session accepted');
    });

    session.on('confirmed', () => {
      if (record.direction === 'outbound') logCallEvent('RTCSession "confirmed" (call fully established)');
      if (record.direction === 'inbound') logIncoming('session confirmed (call fully established)');
      const r = this.calls.get(id);
      if (!r) return;
      r.status = 'active';
      r.answeredAt = r.answeredAt ?? Date.now();
      this.activeCallId = id;
      InCallManager.stopRingback();
      stopRingtone('session confirmed');
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

    const finish = (jssipEvent: 'ended' | 'failed') => (e: any) => {
      if (record.direction === 'outbound') logCallEvent('call ended/failed', `cause: ${e?.cause ?? '(none)'}`);
      if (record.direction === 'inbound') {
        logIncoming(
          `session ${jssipEvent}`,
          `originator: ${e?.originator ?? 'unknown'}, cause: ${e?.cause ?? '(none)'}`,
        );
        if (e?.originator === 'remote') logIncoming('remote hangup');
      }
      // Unconditional: covers every JsSIP-reported termination cause for a
      // ringing inbound session — remote cancel, remote reject, session
      // failure/timeout — without needing to special-case which cause maps
      // to "was ringing". Redundant/no-op for outbound calls and for
      // already-answered inbound calls, which is fine (see stopRingtone).
      stopRingtone(`session ${jssipEvent} (${e?.cause ?? 'no cause'})`);
      this.finalize(id, e?.cause);
    };
    session.on('ended', finish('ended'));
    session.on('failed', finish('failed'));
  }

  answer(callId: string): void {
    const record = this.calls.get(callId);
    if (!record || record.direction !== 'inbound') return;
    logIncoming('Answer pressed', `callId: ${callId}`);

    // Answering with another call up: hold the other leg first.
    for (const other of this.calls.values()) {
      if (other.id !== callId && other.status === 'active') this.hold(other.id);
    }

    // Same fix as outbound calls (see buildIceGatheringEventHandlers' own
    // comment for the full explanation): _createLocalDescription() is the
    // same function for both the offer (outbound) and answer (inbound) SDP,
    // so answering would otherwise wait for full ICE gathering — up to ~40s —
    // before the 200 OK (SDP answer) is even sent, leaving the caller
    // hearing nothing after the user already tapped Answer. answer() itself
    // doesn't read an `eventHandlers` option the way connect() does, so the
    // handlers are attached directly via .on() instead — identical effect.
    const iceHandlers = buildIceGatheringEventHandlers();
    record.session.on('peerconnection', iceHandlers.peerconnection);
    record.session.on('icecandidate', iceHandlers.icecandidate);

    stopRingtone('local answer');
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
    logIncoming('Reject pressed', `callId: ${callId}`);
    stopRingtone('local reject');
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
    // TEMPORARY — speaker-routing investigation. react-native-incall-manager
    // has no JS API to read back the native AudioManager route, so this logs
    // our *requested* state only, clearly labeled as such — not confirmation
    // the native side actually applied it.
    console.log(
      '[sip-call-diag][speaker] button pressed | requested route:',
      on ? 'SPEAKER' : 'EARPIECE',
      '| InCallManager.setForceSpeakerphoneOn(', on, ')',
    );
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
    // MUST be auto:true. Confirmed by reading InCallManagerModule.java: `auto`
    // maps directly to `automatic`, which gates updateAudioRoute() into a
    // no-op when false — meaning updateAudioDeviceState() (the function that
    // populates the native `audioDevices` set) never runs. Every future
    // selectAudioDevice() call — including our own setForceSpeakerphoneOn()
    // whenever the user presses Speaker — then silently fails its
    // `audioDevices.contains(device)` guard and returns without changing the
    // route, logged only as a native Log.e the JS side never sees. This is
    // NOT about ringback/ringtone (that's the fully separate `ringback`
    // start() option, unused here since we call startRingback()/startRingtone()
    // ourselves) — auto:false was a reasonable-sounding but incorrect guess at
    // what this option does.
    //
    // auto:true does not fight explicit route choices: getPreferredAudioDevice()
    // in the native module gives absolute priority to `userSelectedAudioDevice`
    // (set by selectAudioDevice(), i.e. every setForceSpeakerphoneOn() call)
    // over any automatic Bluetooth/headset heuristic, so this only fixes the
    // device-list population — it doesn't add unwanted auto-switching.
    console.log('[sip-call-diag][speaker] InCallManager.start({ media: "audio", auto: true })');
    logIncoming('audio session started');
    InCallManager.start({ media: 'audio', auto: true });
    InCallManager.setForceSpeakerphoneOn(this.speakerOn);
    this.audioSessionOpen = true;
  }

  private closeAudioSession(): void {
    if (!this.audioSessionOpen) return;
    logIncoming('audio session stopped');
    InCallManager.stopRingback();
    stopRingtone('closeAudioSession');
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
 *
 * Wrapped defensively: this is called synchronously from handleNewSession,
 * the very first thing that runs for an incoming call, before this.publish()
 * ever fires — an uncaught throw here (e.g. a missing VIBRATE permission,
 * confirmed as the cause of an incoming-call crash on a real device; fixed
 * in AndroidManifest.xml, but this is insurance against the same class of
 * failure recurring for any other reason) would silently prevent the
 * incoming-call UI from ever appearing at all. Ringtone/vibration is
 * call-setup feedback, never worth losing the whole incoming call over.
 */
function startRingtone(): void {
  try {
    InCallManager.startRingtone('_BUNDLE_', [0, 1000, 800], 'playback', 30);
  } catch (e) {
    logIncoming('startRingtone() failed (non-fatal)', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Single choke point for silencing the incoming-call ringtone AND dismissing
 * the incoming-call notification (IncomingCallNotifier) together — the two
 * must never drift apart, which is exactly the bug class behind a runaway
 * ringtone. Wired into every terminal/transition path a ringing inbound
 * session can take: local answer, local reject, remote cancel/hangup and
 * session failure (both surface as JsSIP 'ended'/'failed', any cause),
 * transport loss while still ringing, and full SipEngine teardown —
 * SipEngine/session lifecycle owns this end to end, independent of whether
 * any React component is mounted to react to it.
 *
 * Both InCallManager.stopRingtone() and hideIncomingCallNotification() are
 * no-ops when nothing is currently ringing/shown, so calling this
 * redundantly from multiple handlers for the same call (e.g. both
 * 'confirmed' and a later 'ended') is intentional and safe, not a bug.
 */
function stopRingtone(reason: string): void {
  logIncoming('stopRingtone requested', `reason: ${reason}`);
  try {
    InCallManager.stopRingtone();
  } catch (e) {
    logIncoming('stopRingtone() threw (non-fatal)', e instanceof Error ? e.message : String(e));
  }
  hideIncomingCallNotification();
  logIncoming('stopRingtone completed');
}

/**
 * Without this, JsSIP waits for connection.iceGatheringState === 'complete'
 * before finalizing the SDP offer and sending the INVITE at all (confirmed by
 * reading RTCSession.js's _createLocalDescription) — measured on a real
 * device at ~40 seconds with only a public STUN server configured, almost
 * certainly STUN requests being dropped/retried repeatedly over a cellular
 * network before gathering ever reaches 'complete'.
 *
 * JsSIP exposes exactly this escape hatch itself: the 'icecandidate' event
 * carries a `ready` callback that finalizes the SDP with whatever candidates
 * have been found so far — the same code path JsSIP uses internally when
 * gathering completes naturally (RTCSession.js's `ready()`, idempotent via
 * an internal `finished` guard, so calling it early is always safe even if
 * natural completion fires around the same time).
 *
 * 2000ms was chosen, not "shortened blindly": a normal STUN round trip
 * typically resolves in well under a second, so this leaves 2-4x margin over
 * the successful case while capping the pathological one far below the
 * observed 40s. Host candidates (no network round trip) are always available
 * immediately regardless, so a forced-early SDP is never candidate-less.
 *
 * A real TURN server remains the actual long-term fix — this only bounds the
 * wait, it doesn't address *why* STUN is slow/unreachable on this network.
 * No TURN credentials are available to add one right now (see ENV.ICE_SERVERS
 * in src/config/env.ts).
 */
const ICE_GATHERING_TIMEOUT_MS = 2000;

function buildIceGatheringEventHandlers() {
  let readyFn: (() => void) | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  return {
    peerconnection: (e: { peerconnection: RTCPeerConnectionLike }) => {
      const pc = e.peerconnection;
      logCallEvent('ICE gatheringstate', pc.iceGatheringState);
      pc.addEventListener('icegatheringstatechange', () => {
        logCallEvent('ICE gatheringstate', pc.iceGatheringState);
        if (pc.iceGatheringState === 'complete' && timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      });
    },
    icecandidate: (e: { candidate?: { type?: string }; ready: () => void }) => {
      if (e.candidate) {
        // Type only (host/srflx/relay) — never the IP or full candidate string.
        logCallEvent('ICE candidate found', `type: ${e.candidate.type ?? 'unknown'}`);
      }
      if (!readyFn) {
        readyFn = e.ready;
        timeoutHandle = setTimeout(() => {
          logCallEvent(
            `ICE gathering timeout (${ICE_GATHERING_TIMEOUT_MS}ms) — proceeding with available candidates`,
          );
          readyFn?.();
        }, ICE_GATHERING_TIMEOUT_MS);
      }
    },
  };
}

interface RTCPeerConnectionLike {
  iceGatheringState: string;
  addEventListener(event: 'icegatheringstatechange', listener: () => void): void;
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

/**
 * "Same SIP account, currently authenticated the same way" — deliberately
 * compares every field (not just username/domain) so that a genuine
 * credential change (e.g. a rotated password from
 * api.refreshSipCredentials(), or a real account switch) is never mistaken
 * for a harmless remount. Field-by-field rather than JSON.stringify for the
 * scalar fields (key-order-proof); iceServers is compared via
 * JSON.stringify since both sides originate from the same JSON-shaped
 * credential payload in practice.
 */
function sameCredentials(a: SipCredentials | null, b: SipCredentials): boolean {
  if (!a) return false;
  return (
    a.username === b.username &&
    a.password === b.password &&
    a.domain === b.domain &&
    a.wsUri === b.wsUri &&
    a.displayName === b.displayName &&
    a.conferenceBridge === b.conferenceBridge &&
    JSON.stringify(a.iceServers ?? null) === JSON.stringify(b.iceServers ?? null)
  );
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

// TEMPORARY — Phase 3a foreground-keep-alive-service investigation. Module-
// level so it's active regardless of which auth provider (real backend flow
// or the permanent-credential dev/test flow) is running, without needing to
// duplicate this listener in both. Remove alongside SipKeepAliveService once
// Phase 3a's result is known.
AppState.addEventListener('change', (state) => {
  console.log('[keepalive-diag] JS AppState changed to', state);
});

// Phase 3b (minimal) — the incoming-call notification's "Decline" action
// must work without bringing the app to the foreground (Answer/tapping the
// notification body both just do that, and RootNavigator already shows
// IncomingCallScreen for any ringing call once foregrounded — no plumbing
// needed there). Rejecting a SIP session is JS/JsSIP-only, so
// IncomingCallActionReceiver (native) forwards here via
// ReactContext.emitDeviceEvent — see that file for why this is safe to rely
// on specifically because Phase 3a's keep-alive service keeps this JS
// instance alive in the background in the first place.
DeviceEventEmitter.addListener('EgoIncomingCallDecline', (e: { callId?: string }) => {
  logIncoming('decline notification action received in JS', `callId: ${e?.callId ?? '(none)'}`);
  if (e?.callId) sipEngine.reject(e.callId);
});
