export type CallDirection = 'inbound' | 'outbound';

export type CallStatus =
  | 'connecting'   // outbound: INVITE sent, no response yet
  | 'ringing'      // outbound: 180/183 received | inbound: INVITE received
  | 'active'       // media flowing
  | 'held'         // locally put on hold
  | 'ended';

/** UI-facing projection of a live SIP session. Never holds the JsSIP object. */
export interface CallView {
  id: string;
  direction: CallDirection;
  /** Bare user part, e.g. "0501234567" */
  remoteNumber: string;
  /** SIP display name if the PBX sent one, else the number. */
  remoteName: string;
  status: CallStatus;
  muted: boolean;
  /** epoch ms when the call object was created */
  createdAt: number;
  /** epoch ms when media was established; null until answered */
  answeredAt: number | null;
}

export type RegistrationStatus =
  | 'unregistered'
  | 'connecting'
  | 'registered'
  | 'failed';

export interface SipSnapshot {
  registration: RegistrationStatus;
  registrationError: string | null;
  calls: CallView[];
  /** Call currently rendered in the in-call UI. */
  activeCallId: string | null;
  /** True while two legs exist and have been merged server-side. */
  conference: boolean;
  /** True only when the current account's credentials include a conferenceBridge. */
  conferenceSupported: boolean;
  speakerOn: boolean;
}

/** Exactly what your backend must return from POST /auth/login. */
export interface SipCredentials {
  /** SIP auth user, e.g. "1001" */
  username: string;
  password: string;
  /** SIP domain / realm, e.g. "pbx.example.com" */
  domain: string;
  /** Secure WebSocket endpoint, e.g. "wss://pbx.example.com:7443" */
  wsUri: string;
  /** Optional caller-ID shown to the callee. */
  displayName?: string;
  /** Optional per-tenant TURN, overrides ENV.ICE_SERVERS when present. */
  iceServers?: { urls: string | string[]; username?: string; credential?: string }[];
  /** Optional: number to dial to reach the tenant's conference bridge. */
  conferenceBridge?: string;
}

export interface AuthSession {
  token: string;
  sip: SipCredentials;
}

export type CallLogOutcome = 'incoming' | 'outgoing' | 'missed';

export interface CallLogEntry {
  id: string;
  number: string;
  name: string;
  outcome: CallLogOutcome;
  /** epoch ms */
  startedAt: number;
  /** talk time in seconds; 0 for missed/unanswered */
  durationSec: number;
}

export interface DeviceContact {
  id: string;
  name: string;
  numbers: { label: string; number: string }[];
}
