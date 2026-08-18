import 'dotenv/config';
import { signZadarmaRequest } from '../zadarma/sign';

/**
 * Isolates whether a Zadarma API failure is in our request signing / auth, or
 * specific to the WebRTC endpoints. Calls two things in order:
 *
 *   1. GET /v1/info/balance/  — the simplest possible authenticated call.
 *      If this fails "Not authorized", the problem is the signature, the key/
 *      secret, or how they're loaded — not WebRTC/get_key.
 *
 *   2. GET /v1/webrtc/get_key/?sip=<ZADARMA_SIP_LOGIN>  — only attempted if
 *      step 1 succeeds, so a get_key failure at that point is known to be
 *      specific to that endpoint (wrong SIP login, WebRTC not enabled on the
 *      account, etc.) rather than a general auth problem.
 *
 * Both calls reuse signZadarmaRequest from zadarma/sign.ts unmodified — this
 * script tests that implementation, it does not reimplement signing.
 *
 *   cd server
 *   npm run diagnose:zadarma
 */

const BASE_URL = 'https://api.zadarma.com';

interface ZadarmaResponse {
  status?: string;
  message?: string;
  balance?: string;
  currency?: string;
  key?: string;
  [k: string]: unknown;
}

async function call(method: string, params: Record<string, string>, auth: { key: string; secret: string }) {
  const { url, headers } = signZadarmaRequest(BASE_URL, method, params, auth);
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body: ZadarmaResponse;
  try {
    body = JSON.parse(text);
  } catch {
    body = { status: 'error', message: `Non-JSON response: ${text.slice(0, 200)}` };
  }
  return { httpStatus: res.status, body };
}

function isAuthFailure(httpStatus: number, body: ZadarmaResponse): boolean {
  const msg = (body.message ?? '').toLowerCase();
  return (
    httpStatus === 401 ||
    httpStatus === 403 ||
    msg.includes('not authorized') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid signature') ||
    msg.includes('invalid key')
  );
}

async function main() {
  const { ZADARMA_API_KEY, ZADARMA_API_SECRET, ZADARMA_SIP_LOGIN } = process.env;
  const sipLogin = process.argv[2] || ZADARMA_SIP_LOGIN;

  if (!ZADARMA_API_KEY || !ZADARMA_API_SECRET) {
    console.error('Set ZADARMA_API_KEY / ZADARMA_API_SECRET in server/.env first.');
    process.exit(1);
  }
  const auth = { key: ZADARMA_API_KEY, secret: ZADARMA_API_SECRET };

  console.log('=== Step 1: GET /v1/info/balance/ ===');
  const balance = await call('/v1/info/balance/', {}, auth);
  console.log(`HTTP status: ${balance.httpStatus}`);
  console.log(`Response status field: ${balance.body.status ?? '(none)'}`);
  console.log(`Response message: ${balance.body.message ?? '(none)'}`);

  const balanceAuthOk = balance.httpStatus === 200 && balance.body.status !== 'error';

  if (!balanceAuthOk) {
    console.log('\nResult: AUTH FAILURE on the simplest possible authenticated call.');
    console.log(
      isAuthFailure(balance.httpStatus, balance.body)
        ? 'This points at signing/key/secret/env-loading, not WebRTC — stopping here as instructed.'
        : 'Status was not 200/success but does not look like a classic auth rejection — inspect the message above before assuming it is signing-related.',
    );
    process.exit(1);
  }

  console.log(`Balance: ${balance.body.balance ?? '(not returned)'} ${balance.body.currency ?? ''}`.trim());
  console.log('\nResult: AUTHENTICATION SUCCEEDED. Signing, key, secret, and env loading are all correct.');

  if (!sipLogin) {
    console.log('\nNo SIP login — set ZADARMA_SIP_LOGIN in server/.env, or pass one as an argument — skipping step 2.');
    return;
  }

  console.log(`\n=== Step 2: GET /v1/webrtc/get_key/?sip=${sipLogin} ===`);
  const webrtc = await call('/v1/webrtc/get_key/', { sip: sipLogin }, auth);
  console.log(`HTTP status: ${webrtc.httpStatus}`);
  console.log(`Response status field: ${webrtc.body.status ?? '(none)'}`);
  console.log(`Response message: ${webrtc.body.message ?? '(none)'}`);

  const webrtcOk = webrtc.httpStatus === 200 && webrtc.body.status !== 'error' && !!webrtc.body.key;

  if (webrtcOk) {
    console.log(`Key returned: yes (${webrtc.body.key!.length} chars, value withheld)`);
    console.log('\nResult: get_key SUCCEEDED. The full chain to a temporary WebRTC key works.');
    return;
  }

  console.log('Key returned: no');
  if (isAuthFailure(webrtc.httpStatus, webrtc.body)) {
    console.log(
      '\nResult: UNEXPECTED — step 1 authenticated fine but step 2 looks like an auth failure. ' +
        'That would point at something specific to this method (e.g. the key lacks WebRTC scope) ' +
        'rather than the signature itself, since the same signing code and credentials just worked.',
    );
  } else {
    console.log(
      '\nResult: get_key-SPECIFIC FAILURE, not an authentication problem — general API auth is proven ' +
        'working by step 1. Likely causes: SIP login ' +
        `"${sipLogin}" doesn't exist or has no WebRTC access on this account, ` +
        'or WebRTC isn\'t enabled for this account/tariff.',
    );
  }
}

main().catch(err => {
  console.error('\nDiagnostic failed to run:', err instanceof Error ? err.message : err);
  process.exit(1);
});
