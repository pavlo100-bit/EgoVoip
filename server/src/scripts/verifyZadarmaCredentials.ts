import 'dotenv/config';
import { signZadarmaRequest } from '../zadarma/sign';

/**
 * Standalone check: proves the get_key -> get_webphone_data chain resolves to
 * real WSS credentials, without starting the HTTP server, touching the mobile
 * app, or placing any call. Safe to run repeatedly — it costs nothing and
 * dials nobody.
 *
 * Deliberately does its own fetches here (reusing signZadarmaRequest, but not
 * ZadarmaClient/resolveWebphoneData) so it can report the HTTP status of each
 * call on the success path — those production helpers only surface status on
 * failure, and changing their return shape for a diagnostic script isn't
 * worth touching code the real server depends on.
 *
 * All three secrets come from server/.env (gitignored) so nothing sensitive
 * ever has to be typed into a chat session or committed to source control:
 *
 *   cd server
 *   cp .env.example .env   # fill in ZADARMA_API_KEY / ZADARMA_API_SECRET / ZADARMA_SIP_LOGIN
 *   npm run verify:zadarma
 *
 * A SIP login isn't itself a secret (it's a routable phone extension, not a
 * credential), but it's still read from .env by default so it never has to
 * be passed as a CLI argument either. An explicit argument overrides it, for
 * testing a second login without editing .env:
 *
 *   npm run verify:zadarma -- <otherSipLogin>
 */

const WEBPHONE_DATA_ENDPOINT = 'https://api.zadarma.com/sys/webrtc/get_webphone_data.php';
const CALLBACK_NAME = 'egovoipPoc';

async function main() {
  const { ZADARMA_API_KEY, ZADARMA_API_SECRET, ZADARMA_SIP_LOGIN } = process.env;
  const sipLogin = process.argv[2] || ZADARMA_SIP_LOGIN;

  if (!sipLogin) {
    console.error(
      'No SIP login. Set ZADARMA_SIP_LOGIN in server/.env, or pass one: npm run verify:zadarma -- <sipLogin>',
    );
    process.exit(1);
  }
  if (!ZADARMA_API_KEY || !ZADARMA_API_SECRET) {
    console.error('Set ZADARMA_API_KEY / ZADARMA_API_SECRET in server/.env first.');
    process.exit(1);
  }
  const auth = { key: ZADARMA_API_KEY, secret: ZADARMA_API_SECRET };

  // --- Step 1: GET /v1/webrtc/get_key/ ---
  const { url: keyUrl, headers: keyHeaders } = signZadarmaRequest(
    'https://api.zadarma.com',
    '/v1/webrtc/get_key/',
    { sip: sipLogin },
    auth,
  );
  const keyRes = await fetch(keyUrl, { headers: keyHeaders });
  const keyBody = (await keyRes.json()) as { status?: string; message?: string; key?: string };

  console.log(`get_key HTTP status: ${keyRes.status}`);

  if (keyRes.status !== 200 || keyBody.status !== 'success' || !keyBody.key) {
    console.log(`get_key failed: ${keyBody.message ?? '(no message)'}`);
    process.exit(1);
  }
  const webrtcKey = keyBody.key;

  // --- Step 2: GET .../sys/webrtc/get_webphone_data.php (undocumented bridge) ---
  const bridgeUrl = new URL(WEBPHONE_DATA_ENDPOINT);
  bridgeUrl.searchParams.set('jsonpCallback', CALLBACK_NAME);
  bridgeUrl.searchParams.set('key', webrtcKey);
  bridgeUrl.searchParams.set('sipId', sipLogin);
  bridgeUrl.searchParams.set('integrationType', 'CRM');

  const bridgeRes = await fetch(bridgeUrl.toString());
  const bridgeText = await bridgeRes.text();

  console.log(`get_webphone_data HTTP status: ${bridgeRes.status}`);

  const prefix = `${CALLBACK_NAME}(`;
  const start = bridgeText.indexOf(prefix);
  const end = bridgeText.lastIndexOf(')');
  if (bridgeRes.status !== 200 || start === -1 || end === -1 || end <= start) {
    console.log('get_webphone_data failed: unexpected response shape');
    process.exit(1);
  }

  let parsed: { domain?: string; username?: string; pass?: string; datacenter?: string; error?: unknown };
  try {
    parsed = JSON.parse(bridgeText.slice(start + prefix.length, end));
  } catch {
    console.log('get_webphone_data failed: response body was not valid JSON');
    process.exit(1);
  }

  if (parsed.error || !parsed.domain || !parsed.username || !parsed.pass) {
    console.log('get_webphone_data failed: missing required fields, or Zadarma rejected the key');
    process.exit(1);
  }

  const wsUri = `wss://${parsed.domain}:4443`;
  const sufficientForJsSip = !!(parsed.domain && parsed.username && parsed.pass);

  console.log(`\nResolved wsUri: ${wsUri}`);
  console.log(`Resolved domain: ${parsed.domain}`);
  console.log(`Resolved username: ${parsed.username}`);
  console.log(`Password length: ${parsed.pass.length} chars (value withheld)`);
  console.log(`Sufficient for JsSIP registration: ${sufficientForJsSip} (domain + username + password all present)`);
}

main().catch(err => {
  console.error('\nVerification failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
