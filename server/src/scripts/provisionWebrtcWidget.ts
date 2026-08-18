import 'dotenv/config';
import { signZadarmaRequest } from '../zadarma/sign';

/**
 * Full documented provisioning flow, in order:
 *   1. GET /v1/info/balance/          — baseline auth check; stop if not 200
 *   2. GET /v1/webrtc/                — check is_exists
 *   3. POST /v1/webrtc/create/        — only if is_exists is false; domain
 *      passed exactly as documented (bare hostname, no scheme — matches the
 *      spec's own example "test.domain.com")
 *   4. GET /v1/webrtc/                — re-check is_exists
 *   5. GET /v1/webrtc/get_key/?sip=<login>
 *   6. GET .../sys/webrtc/get_webphone_data.php (undocumented bridge)
 *
 * Stops immediately if any step fails.
 */

const BASE_URL = 'https://api.zadarma.com';
const WEBPHONE_DATA_ENDPOINT = 'https://api.zadarma.com/sys/webrtc/get_webphone_data.php';
const CALLBACK_NAME = 'egovoipPoc';

async function getWebrtcInfo(auth: { key: string; secret: string }) {
  const { url, headers } = signZadarmaRequest(BASE_URL, '/v1/webrtc/', {}, auth);
  const res = await fetch(url, { headers });
  const body = (await res.json()) as {
    status?: string;
    message?: string;
    is_exists?: boolean;
    domains?: string[];
  };
  return { httpStatus: res.status, body };
}

async function main() {
  const { ZADARMA_API_KEY, ZADARMA_API_SECRET, ZADARMA_SIP_LOGIN } = process.env;
  const sipLogin = process.argv[2] || ZADARMA_SIP_LOGIN;
  const domain = process.argv[3];

  if (!ZADARMA_API_KEY || !ZADARMA_API_SECRET) {
    console.error('Set ZADARMA_API_KEY / ZADARMA_API_SECRET in server/.env first.');
    process.exit(1);
  }
  if (!sipLogin) {
    console.error('No SIP login. Set ZADARMA_SIP_LOGIN in server/.env, or pass one as an argument.');
    process.exit(1);
  }
  if (!domain) {
    console.error('Usage: npm run provision:webrtc-widget -- <sipLogin> <domain>');
    process.exit(1);
  }
  const auth = { key: ZADARMA_API_KEY, secret: ZADARMA_API_SECRET };

  // --- Step 1: GET /v1/info/balance/ (baseline auth check) ---
  console.log('=== Step 1: GET /v1/info/balance/ ===');
  const { url: balanceUrl, headers: balanceHeaders } = signZadarmaRequest(
    BASE_URL,
    '/v1/info/balance/',
    {},
    auth,
  );
  const balanceRes = await fetch(balanceUrl, { headers: balanceHeaders });
  const balanceBody = (await balanceRes.json()) as { status?: string; message?: string };
  console.log(`HTTP status: ${balanceRes.status}, status field: ${balanceBody.status ?? '(none)'}, message: ${balanceBody.message ?? '(none)'}`);

  if (balanceRes.status !== 200 || balanceBody.status !== 'success') {
    console.log('\nStopping: balance check failed — not proceeding to webrtc endpoints.');
    process.exit(1);
  }

  // --- Step 2: GET /v1/webrtc/ ---
  console.log('\n=== Step 2: GET /v1/webrtc/ ===');
  let info = await getWebrtcInfo(auth);
  console.log(`HTTP status: ${info.httpStatus}, is_exists: ${info.body.is_exists}, domains: ${JSON.stringify(info.body.domains ?? [])}`);

  if (info.httpStatus !== 200 || info.body.status !== 'success') {
    console.log(`\nStopping: unexpected response — ${info.body.message ?? '(no message)'}`);
    process.exit(1);
  }

  // --- Step 3: POST /v1/webrtc/create/ (only if needed) ---
  if (info.body.is_exists === false) {
    console.log(`\n=== Step 3: POST /v1/webrtc/create/ (domain=${domain}) ===`);
    const { url, headers, body } = signZadarmaRequest(BASE_URL, '/v1/webrtc/create/', { domain }, auth, 'POST');
    const createRes = await fetch(url, { method: 'POST', headers, body });
    const createBody = (await createRes.json()) as { status?: string; message?: string };
    console.log(`HTTP status: ${createRes.status}, status field: ${createBody.status ?? '(none)'}, message: ${createBody.message ?? '(none)'}`);

    // 201 Created is the correct status for a successful creation, even
    // though the OpenAPI spec's example response happens to be under "200".
    if ((createRes.status !== 200 && createRes.status !== 201) || createBody.status !== 'success') {
      console.log('\nStopping: widget creation failed.');
      process.exit(1);
    }

    // --- Step 4: re-check ---
    console.log('\n=== Step 4: GET /v1/webrtc/ (re-check) ===');
    info = await getWebrtcInfo(auth);
    console.log(`HTTP status: ${info.httpStatus}, is_exists: ${info.body.is_exists}, domains: ${JSON.stringify(info.body.domains ?? [])}`);

    if (info.body.is_exists !== true) {
      console.log('\nStopping: widget still not showing as existing after creation.');
      process.exit(1);
    }
  } else {
    console.log('\nWidget already exists — skipping create.');
  }

  // --- Step 5: GET /v1/webrtc/get_key/ ---
  console.log(`\n=== Step 5: GET /v1/webrtc/get_key/?sip=${sipLogin} ===`);
  const { url: keyUrl, headers: keyHeaders } = signZadarmaRequest(
    BASE_URL,
    '/v1/webrtc/get_key/',
    { sip: sipLogin },
    auth,
  );
  const keyRes = await fetch(keyUrl, { headers: keyHeaders });
  const keyBody = (await keyRes.json()) as { status?: string; message?: string; key?: string };
  console.log(`HTTP status: ${keyRes.status}, status field: ${keyBody.status ?? '(none)'}, message: ${keyBody.message ?? '(none)'}`);

  if (keyRes.status !== 200 || keyBody.status !== 'success' || !keyBody.key) {
    console.log('\nStopping: get_key failed.');
    process.exit(1);
  }
  const webrtcKey = keyBody.key;

  // --- Step 5: get_webphone_data.php bridge ---
  console.log('\n=== Step 6: GET .../sys/webrtc/get_webphone_data.php ===');
  const bridgeUrl = new URL(WEBPHONE_DATA_ENDPOINT);
  bridgeUrl.searchParams.set('jsonpCallback', CALLBACK_NAME);
  bridgeUrl.searchParams.set('key', webrtcKey);
  bridgeUrl.searchParams.set('sipId', sipLogin);
  bridgeUrl.searchParams.set('integrationType', 'site');

  const bridgeRes = await fetch(bridgeUrl.toString());
  const bridgeText = await bridgeRes.text();
  console.log(`HTTP status: ${bridgeRes.status}`);

  const prefix = `${CALLBACK_NAME}(`;
  const start = bridgeText.indexOf(prefix);
  const end = bridgeText.lastIndexOf(')');
  if (bridgeRes.status !== 200 || start === -1 || end === -1 || end <= start) {
    console.log('\nStopping: unexpected response shape from get_webphone_data.php.');
    process.exit(1);
  }

  let parsed: { domain?: string; username?: string; pass?: string; error?: unknown };
  try {
    parsed = JSON.parse(bridgeText.slice(start + prefix.length, end));
  } catch {
    console.log('\nStopping: response body was not valid JSON.');
    process.exit(1);
  }

  if (parsed.error) {
    console.log(`\nStopping: Zadarma rejected the key — ${JSON.stringify(parsed.error)}`);
    process.exit(1);
  }
  if (!parsed.domain || !parsed.username || !parsed.pass) {
    console.log('\nStopping: response is missing required fields.');
    process.exit(1);
  }

  console.log('\n=== Resolved credentials ===');
  console.log(`wsUri: wss://${parsed.domain}:4443`);
  console.log(`domain: ${parsed.domain}`);
  console.log(`username: ${parsed.username}`);
  console.log(`password length: ${parsed.pass.length} chars (value withheld)`);
}

main().catch(err => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
