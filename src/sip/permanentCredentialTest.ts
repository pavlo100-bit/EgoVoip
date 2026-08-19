/**
 * TEMPORARY — permanent-SIP-credential REGISTER test, bypassing the backend
 * and the ephemeral WebRTC-issued credential entirely. See
 * src/config/permanentSipTest.example.ts for setup. Remove this file (and
 * PermanentCredentialTestScreen.tsx, and the two permanentSipTest.*.ts
 * config files) once the investigation is resolved.
 *
 * Goal: determine whether the account's permanent SIP password can REGISTER
 * over the same WSS transport the ephemeral credential failed on. Success
 * would prove WSS transport, JsSIP, and permanent credentials all work, and
 * isolate the ephemeral WebRTC-issued credential as the incompatible piece.
 */
import { PERMANENT_SIP_TEST } from '../config/permanentSipTest.local';
import { sipEngine } from './SipEngine';
import { ENV } from '../config/env';
import type { SipCredentials } from '../types';

export const permanentCredentialTestEnabled = PERMANENT_SIP_TEST.password.length > 0;

/**
 * Builds the exact SipCredentials shape SipEngine.start() expects. No
 * `conferenceBridge`, no `iceServers` override, no `displayName` — nothing
 * beyond what's needed to prove or disprove REGISTER with this credential.
 * `realm` is deliberately never set here (SipEngine/JsSIP never sets it
 * either) — the registrar's challenge supplies it, as normal SIP digest auth
 * requires.
 */
export function startPermanentCredentialTest(): void {
  if (!permanentCredentialTestEnabled) return;

  // Exact, greppable marker so it's unambiguous which flow is running —
  // this line only ever appears when the ephemeral-credential/backend flow
  // has been bypassed entirely.
  console.log('[sip-diag] PERMANENT SIP TEST MODE');

  const credentials: SipCredentials = {
    username: PERMANENT_SIP_TEST.username,
    password: PERMANENT_SIP_TEST.password,
    domain: PERMANENT_SIP_TEST.domain,
    wsUri: PERMANENT_SIP_TEST.wsUri,
  };

  // SipEngine.start() always registers with ENV.REGISTER_EXPIRES — not
  // per-call configurable. 580 is already the "current safe value" (it's
  // what Zadarma's own widget uses), so this test uses that rather than
  // restructuring SipEngine.ts for a one-off 300s override.
  console.log(
    '[sip-diag][permanent-cred-test] starting REGISTER test —',
    'uri: sip:' + credentials.username + '@' + credentials.domain,
    '| wsUri:', credentials.wsUri,
    '| register_expires:', ENV.REGISTER_EXPIRES, '(SipEngine default, not the suggested 300)',
    '| password length:', credentials.password.length,
  );

  sipEngine.start(credentials).catch(err => {
    console.log('[sip-diag][permanent-cred-test] start() threw:', err instanceof Error ? err.message : err);
  });
}
