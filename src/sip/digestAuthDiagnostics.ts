/**
 * TEMPORARY diagnostic instrumentation for the "REGISTER fails with 401"
 * investigation — remove once registration succeeds.
 *
 * Wraps DigestAuthentication.prototype.authenticate() so we can see exactly
 * what challenge Zadarma's registrar sends and whether JsSIP successfully
 * built an Authorization header for it, without ever touching or logging the
 * nonce, computed digest response, password, or Authorization header itself.
 *
 * This settles two things the plain [sip-diag] registration-event logging
 * can't:
 *   1. Whether REGISTER #1 (the initial, credential-less attempt that
 *      *should* get a 401 challenge — that's normal SIP digest auth, not a
 *      failure) is what's surfacing as our 'registrationFailed' event, or
 *      whether JsSIP actually sent a second, credentialed REGISTER that got
 *      rejected again.
 *   2. Whether the challenge itself is something our JsSIP can even respond
 *      to — DigestAuthentication.authenticate() hard-aborts (returns false,
 *      no Authorization ever generated) if the challenge's algorithm isn't
 *      exactly "MD5", or if realm/nonce/qop are missing or unsupported. If
 *      Zadarma challenges with SHA-256 (RFC 8760) that abort fires on
 *      attempt #1 and every subsequent registration attempt fails the same
 *      way, indistinguishable from a wrong-password rejection.
 *
 * Import this once, before jssip is used — see src/sip/polyfills.ts.
 */
const DigestAuthentication = require('jssip/lib/DigestAuthentication');

let attemptCount = 0;

const originalAuthenticate = DigestAuthentication.prototype.authenticate;

DigestAuthentication.prototype.authenticate = function patchedAuthenticate(
  request: unknown,
  challenge: {
    algorithm?: string;
    realm?: string;
    qop?: string | string[];
    stale?: boolean;
  },
  ...rest: unknown[]
) {
  attemptCount += 1;
  const result = originalAuthenticate.call(this, request, challenge, ...rest);

  console.log(
    '[sip-diag][digest-auth] attempt:', attemptCount,
    '| algorithm:', challenge?.algorithm ?? '(none — defaults to MD5)',
    '| realm:', challenge?.realm ?? '(none)',
    '| qop:', challenge?.qop ?? '(none)',
    '| stale:', challenge?.stale ?? false,
    '| authorizationGenerated:', result,
  );

  return result;
};

export {};
