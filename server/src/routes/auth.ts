import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { SipCredentialProvider } from '../sip-providers/SipCredentialProvider';

/**
 * Phase 1 has no user database: the "account" a caller authenticates as is
 * literally their Zadarma SIP login, and the "password" is checked by asking
 * the provider to provision credentials for it — if Zadarma issues a WebRTC
 * key for that login, the login is real. A session token is minted so the
 * mobile app doesn't have to hold the SIP login/password pair itself.
 *
 * This is intentionally thin. Swap in real user accounts (and store the
 * mapping from account -> sipLogin) whenever there's more than one caller
 * per Zadarma tenant; nothing about SipCredentialProvider needs to change.
 */

interface SessionRecord {
  sipLogin: string;
  createdAt: number;
}

const sessions = new Map<string, SessionRecord>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function issueToken(sipLogin: string): string {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, { sipLogin, createdAt: Date.now() });
  return token;
}

export function resolveSession(token: string | undefined): string | null {
  if (!token) return null;
  const record = sessions.get(token);
  if (!record) return null;
  if (Date.now() - record.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return record.sipLogin;
}

export function createAuthRouter(provider: SipCredentialProvider): Router {
  const router = Router();

  router.post('/auth/login', async (req, res) => {
    const { username } = req.body ?? {};
    if (typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ message: 'username (Zadarma SIP login) is required' });
      return;
    }

    try {
      const sip = await provider.provision(username.trim());
      const token = issueToken(username.trim());
      res.json({
        token,
        sip: {
          username: sip.username,
          password: sip.password,
          domain: sip.domain,
          wsUri: sip.wsUri,
          displayName: sip.displayName ?? username.trim(),
          conferenceBridge: sip.conferenceBridge,
        },
      });
    } catch (err) {
      // Never forward the raw provider error to the client — it may carry
      // Zadarma-internal detail we don't want to leak, and it is logged
      // server-side instead.
      console.error('[auth] provisioning failed for', username.trim(), '-', err);
      res.status(502).json({ message: 'Could not provision SIP credentials' });
    }
  });

  router.get('/sip/credentials', async (req, res) => {
    const authHeader = req.header('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const sipLogin = resolveSession(token);
    if (!sipLogin) {
      res.status(401).json({ message: 'Invalid or expired session' });
      return;
    }

    try {
      const sip = await provider.provision(sipLogin);
      res.json({
        sip: {
          username: sip.username,
          password: sip.password,
          domain: sip.domain,
          wsUri: sip.wsUri,
          displayName: sip.displayName ?? sipLogin,
          conferenceBridge: sip.conferenceBridge,
        },
      });
    } catch (err) {
      console.error('[sip] credential refresh failed for', sipLogin, '-', err);
      res.status(502).json({ message: 'Could not refresh SIP credentials' });
    }
  });

  return router;
}
