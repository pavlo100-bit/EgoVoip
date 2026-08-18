import 'dotenv/config';
import { signZadarmaRequest } from '../zadarma/sign';

/**
 * Checks whether a WebRTC widget integration already exists on this account,
 * using only documented Zadarma endpoints (zadarma/openapi, spec/v1/openapi.json):
 *
 *   GET /v1/webrtc/  — operationId get.webrtc. Params: only optional user_id
 *   (resellers only — not used here). Response: { status, is_exists, domains,
 *   settings }.
 *
 * Does not call POST /v1/webrtc/create/ — that requires `domain` (marked
 * required: true in the spec) and no domain has been provided.
 */

const BASE_URL = 'https://api.zadarma.com';

async function main() {
  const { ZADARMA_API_KEY, ZADARMA_API_SECRET } = process.env;
  if (!ZADARMA_API_KEY || !ZADARMA_API_SECRET) {
    console.error('Set ZADARMA_API_KEY / ZADARMA_API_SECRET in server/.env first.');
    process.exit(1);
  }
  const auth = { key: ZADARMA_API_KEY, secret: ZADARMA_API_SECRET };

  const { url, headers } = signZadarmaRequest(BASE_URL, '/v1/webrtc/', {}, auth);
  const res = await fetch(url, { headers });
  const body = (await res.json()) as {
    status?: string;
    message?: string;
    is_exists?: boolean;
    domains?: string[];
    settings?: unknown;
  };

  console.log('HTTP status:', res.status);
  console.log('status field:', body.status ?? '(none)');
  console.log('message:', body.message ?? '(none)');
  console.log('is_exists:', body.is_exists ?? '(not returned)');
  console.log('domains:', JSON.stringify(body.domains ?? []));
  console.log('settings:', JSON.stringify(body.settings ?? {}));

  if (res.status === 200 && body.status === 'success' && body.is_exists === true) {
    console.log('\nWidget integration already exists — no creation needed.');
  } else if (res.status === 200 && body.status === 'success' && body.is_exists === false) {
    console.log(
      '\nWidget integration does not exist. Creating one requires POST /v1/webrtc/create/ with a ' +
        'required "domain" parameter — not provided, not guessed. Stopping here.',
    );
  } else {
    console.log('\nUnexpected response — see status/message above.');
  }
}

main();
