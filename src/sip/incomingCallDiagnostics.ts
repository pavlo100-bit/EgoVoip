/**
 * Safe, non-sensitive diagnostics for the foreground-incoming-call
 * investigation. Logs only event names, sanitized caller numbers (bare SIP
 * user part — never a full URI, header, or anything auth-related), and SIP
 * cause/status text. Never logs credentials, Authorization headers, SDP,
 * ICE candidates, or any secret.
 */
export function logIncoming(event: string, extra?: string): void {
  console.log(`[sip-incoming-diag] ${event}` + (extra ? ` | ${extra}` : ''));
}
