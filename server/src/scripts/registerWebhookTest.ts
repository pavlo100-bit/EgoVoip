import 'dotenv/config';
import { signZadarmaRequest } from '../zadarma/sign';

/**
 * TEMPORARY, TEST-ONLY. Registers the deployed webhook receiver
 * (zadarmaWebhookTest.ts, live at <RAILWAY_URL>/test/zadarma-webhook) with
 * Zadarma and enables NOTIFY_START / NOTIFY_ANSWER / NOTIFY_END so we can
 * see exactly when Zadarma's PBX call-info events fire relative to the SIP
 * INVITE reaching (or not reaching) the device.
 *
 *   cd server
 *   npx tsx src/scripts/registerWebhookTest.ts https://egovoip-production.up.railway.app/test/zadarma-webhook
 */
const BASE_URL = 'https://api.zadarma.com';

async function main() {
  const webhookUrl = process.argv[2];
  if (!webhookUrl) {
    console.error('Usage: npx tsx src/scripts/registerWebhookTest.ts <webhook-url>');
    process.exit(1);
  }

  const { ZADARMA_API_KEY, ZADARMA_API_SECRET } = process.env;
  if (!ZADARMA_API_KEY || !ZADARMA_API_SECRET) {
    console.error('Set ZADARMA_API_KEY / ZADARMA_API_SECRET in server/.env first.');
    process.exit(1);
  }
  const auth = { key: ZADARMA_API_KEY, secret: ZADARMA_API_SECRET };

  console.log(`=== POST /v1/pbx/callinfo/url (url=${webhookUrl}) ===`);
  const { url: urlEndpoint, headers: urlHeaders, body: urlBody } = signZadarmaRequest(
    BASE_URL,
    '/v1/pbx/callinfo/url/',
    { url: webhookUrl },
    auth,
    'POST',
  );
  const urlRes = await fetch(urlEndpoint, { method: 'POST', headers: urlHeaders, body: urlBody });
  const urlJson = await urlRes.json();
  console.log('status:', urlRes.status, JSON.stringify(urlJson));

  console.log('\n=== POST /v1/pbx/callinfo/notifications (start+answer+end=true) ===');
  const { url: notifEndpoint, headers: notifHeaders, body: notifBody } = signZadarmaRequest(
    BASE_URL,
    '/v1/pbx/callinfo/notifications/',
    { notify_start: 'true', notify_answer: 'true', notify_end: 'true' },
    auth,
    'POST',
  );
  const notifRes = await fetch(notifEndpoint, { method: 'POST', headers: notifHeaders, body: notifBody });
  const notifJson = await notifRes.json();
  console.log('status:', notifRes.status, JSON.stringify(notifJson));

  console.log('\n=== GET /v1/pbx/callinfo (confirm) ===');
  const { url: getEndpoint, headers: getHeaders } = signZadarmaRequest(BASE_URL, '/v1/pbx/callinfo/', {}, auth);
  const getRes = await fetch(getEndpoint, { headers: getHeaders });
  const getJson = await getRes.json();
  console.log('status:', getRes.status, JSON.stringify(getJson, null, 2));
}

main();
