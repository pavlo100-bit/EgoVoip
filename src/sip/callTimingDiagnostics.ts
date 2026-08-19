/**
 * TEMPORARY — outbound call setup timing investigation (~60s delay before
 * the remote phone rings). Remove once resolved.
 *
 * Patches two JsSIP internals, both scoped to method === 'INVITE' only, so
 * REGISTER's existing [sip-diag][digest-auth] instrumentation
 * (src/sip/digestAuthDiagnostics.ts) is completely untouched:
 *
 *   - RequestSender.prototype._receiveResponse — sees EVERY response to the
 *     INVITE before any 401/407 auto-handling happens, so this one hook
 *     covers "first response", 100 Trying, 401/407 challenge, 180 Ringing,
 *     183 Session Progress, and 200 OK — whichever actually arrive, in order,
 *     with real status codes.
 *   - RequestSender.prototype.send — called exactly once for the initial
 *     INVITE and exactly once more if a 401/407 challenge is answered
 *     (confirmed by reading RequestSender.js: SIP retransmission is handled
 *     by the transaction layer, not by calling send() again) — so a
 *     per-instance call counter cleanly distinguishes "INVITE sent" from
 *     "authenticated INVITE (re)sent" with no guessing.
 *
 * Only logs elapsed-ms-since-call-press, the event name, SIP status/reason,
 * and originator where relevant — never credentials, Authorization, SDP,
 * ICE candidates, nonce, or full SIP messages.
 */
const RequestSender = require('jssip/lib/RequestSender');

let callStartAt: number | null = null;
let callDestination: string | null = null;

function elapsed(): number {
  return callStartAt === null ? -1 : Date.now() - callStartAt;
}

export function markCallStart(destination: string): void {
  callStartAt = Date.now();
  callDestination = destination;
  console.log(`[sip-call-diag] 0ms | Call button pressed | destination: ${destination}`);
}

export function logCallEvent(event: string, extra?: string): void {
  if (callStartAt === null) return; // no call being timed
  console.log(
    `[sip-call-diag] ${elapsed()}ms | ${event}` + (extra ? ` | ${extra}` : ''),
    callDestination ? `| destination: ${callDestination}` : '',
  );
}

// --- RequestSender.send: detects "INVITE sent" vs "authenticated INVITE resent" ---
const originalSend = RequestSender.prototype.send;
RequestSender.prototype.send = function patchedSend(...args: unknown[]) {
  if (this._method === 'INVITE') {
    this._sipCallDiagSendCount = (this._sipCallDiagSendCount ?? 0) + 1;
    if (this._sipCallDiagSendCount === 1) {
      logCallEvent('INVITE sent (initial)');
    } else {
      logCallEvent('authenticated INVITE (re)sent', `attempt ${this._sipCallDiagSendCount}`);
    }
  }
  return originalSend.apply(this, args);
};

// --- RequestSender._receiveResponse: sees every response before auth auto-handling ---
const originalReceiveResponse = RequestSender.prototype._receiveResponse;
RequestSender.prototype._receiveResponse = function patchedReceiveResponse(
  response: { status_code: number; reason_phrase?: string },
  ...args: unknown[]
) {
  if (this._method === 'INVITE') {
    const label = `status: ${response.status_code} ${response.reason_phrase ?? ''}`.trim();
    if (!this._sipCallDiagFirstResponseSeen) {
      this._sipCallDiagFirstResponseSeen = true;
      logCallEvent('first SIP response received', label);
    }
    switch (response.status_code) {
      case 100:
        logCallEvent('100 Trying', label);
        break;
      case 180:
        logCallEvent('180 Ringing', label);
        break;
      case 183:
        logCallEvent('183 Session Progress', label);
        break;
      case 200:
        logCallEvent('200 OK', label);
        break;
      case 401:
      case 407:
        logCallEvent('auth challenge on INVITE', label);
        break;
      default:
        if (response.status_code >= 300) {
          logCallEvent('non-2xx final response', label);
        }
    }
  }
  return originalReceiveResponse.apply(this, [response, ...args]);
};

export {};
