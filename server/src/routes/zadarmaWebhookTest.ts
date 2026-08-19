import { createHmac } from 'node:crypto';
import { Router } from 'express';

/**
 * TEMPORARY, TEST-ONLY — for the "how long does Zadarma keep an unanswered
 * incoming call alive" timing investigation. Not part of any production
 * flow, never called by the app, never called by anything except Zadarma's
 * own PBX call-info webhook once it's registered (see
 * server/src/scripts/registerWebhookTest.ts). Remove once the timing
 * question is answered and Phase 2a either proceeds or doesn't.
 *
 * Receives Zadarma's PBX call-info webhook (NOTIFY_START / NOTIFY_ANSWER /
 * NOTIFY_END — whichever are enabled) and logs, with a high-resolution
 * server timestamp, exactly when each one arrives. That's the one thing we
 * currently have zero visibility into: whether the webhook fires before, at
 * the same time as, or after Zadarma's SIP INVITE reaches the device.
 *
 * Verifies the Signature header using the same HMAC scheme already proven
 * correct for the rest of the Zadarma integration this session (hex digest,
 * then base64 of the hex string — see server/src/zadarma/sign.ts) so noise
 * / spoofed requests are clearly marked as such rather than silently
 * trusted.
 */

function verifySignature(signatureString: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const hmacHex = createHmac('sha1', secret).update(signatureString).digest('hex');
  const expected = Buffer.from(hmacHex, 'utf8').toString('base64');
  return expected === signature;
}

/** Per NotifyStart/NotifyAnswer/NotifyEnd's own getSignatureString() in the official PHP SDK. */
function signatureStringFor(event: string, body: Record<string, string>): string {
  switch (event) {
    case 'NOTIFY_START':
      return `${body.caller_id ?? ''}${body.called_did ?? ''}${body.call_start ?? ''}`;
    case 'NOTIFY_ANSWER':
      return `${body.caller_id ?? ''}${body.destination ?? ''}${body.call_start ?? ''}`;
    case 'NOTIFY_END':
      // NotifyEnd's exact signature string wasn't fetched — log unverified
      // rather than guess at the field order.
      return '';
    default:
      return '';
  }
}

export function createZadarmaWebhookTestRouter(secret: string): Router {
  const router = Router();

  router.post('/test/zadarma-webhook', (req, res) => {
    const receivedAt = new Date().toISOString();
    const body = req.body as Record<string, string>;
    const event = body.event ?? '(no event field)';
    const signature = req.header('signature') ?? req.header('Signature');

    const sigString = signatureStringFor(event, body);
    const sigValid = sigString ? verifySignature(sigString, signature, secret) : null;

    console.log(
      `[zadarma-webhook-test] ${receivedAt} | event: ${event} | ` +
        `caller_id: ${body.caller_id ?? '-'} | called_did: ${body.called_did ?? '-'} | ` +
        `call_start: ${body.call_start ?? '-'} | pbx_call_id: ${body.pbx_call_id ?? '-'} | ` +
        `internal: ${body.internal ?? '-'} | ` +
        `signature valid: ${sigValid === null ? 'not checked (unknown sig string for this event)' : sigValid}`,
    );

    // Ack fast — don't let our own processing time skew the timing we're
    // trying to measure, and don't give Zadarma a reason to retry.
    res.status(200).send('OK');
  });

  return router;
}
