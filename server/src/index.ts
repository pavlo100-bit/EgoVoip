import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { ZadarmaKeyBridgeProvider } from './sip-providers/ZadarmaKeyBridgeProvider';
import { createAuthRouter } from './routes/auth';
// TEMPORARY, TEST-ONLY — Zadarma incoming-call timing investigation. See
// server/src/routes/zadarmaWebhookTest.ts. Remove once the timing question
// is answered.
import { createZadarmaWebhookTestRouter } from './routes/zadarmaWebhookTest';

const { ZADARMA_API_KEY, ZADARMA_API_SECRET, PORT } = process.env;

if (!ZADARMA_API_KEY || !ZADARMA_API_SECRET) {
  console.error(
    'Missing ZADARMA_API_KEY / ZADARMA_API_SECRET. Copy server/.env.example to server/.env and fill them in.',
  );
  process.exit(1);
}

// Swap this one line for a different SipCredentialProvider implementation —
// nothing else in this file, or in the mobile app, needs to know.
const provider = new ZadarmaKeyBridgeProvider({
  key: ZADARMA_API_KEY,
  secret: ZADARMA_API_SECRET,
});

const app = express();
app.use(cors());
app.use(express.json());
// Zadarma's PBX webhooks POST form-encoded bodies (PHP $_POST convention),
// not JSON — needed for the test webhook route below.
app.use(express.urlencoded({ extended: true }));
app.use(createAuthRouter(provider));
app.use(createZadarmaWebhookTestRouter(ZADARMA_API_SECRET));

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = Number(PORT) || 4000;
app.listen(port, () => {
  console.log(`EgoVoip backend listening on :${port}`);
});
