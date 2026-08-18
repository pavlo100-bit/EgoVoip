import { ENV } from '../config/env';
import type { AuthSession, SipCredentials } from '../types';

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENV.API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const body = await res.text();
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) message = parsed.message;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new ApiError(message, res.status);
  }
  return body ? (JSON.parse(body) as T) : ({} as T);
}

function assertCredentials(sip: Partial<SipCredentials> | undefined): SipCredentials {
  const missing = (['username', 'password', 'domain', 'wsUri'] as const).filter(
    k => !sip?.[k],
  );
  if (!sip || missing.length) {
    throw new Error(
      `Backend did not return valid SIP credentials (missing: ${missing.join(', ')})`,
    );
  }
  if (!/^wss:\/\//i.test(sip.wsUri!)) {
    // ws:// would send SIP credentials in cleartext and is blocked by
    // Android's default network security config anyway.
    throw new Error('SIP wsUri must use wss://');
  }
  return sip as SipCredentials;
}

/**
 * Expected response shape:
 * {
 *   "token": "...",
 *   "sip": {
 *     "username": "1001",
 *     "password": "s3cret",
 *     "domain": "pbx.example.com",
 *     "wsUri": "wss://pbx.example.com:7443",
 *     "displayName": "Avi",
 *     "conferenceBridge": "*8000"
 *   }
 * }
 */
export async function login(
  username: string,
  password: string,
): Promise<AuthSession> {
  const data = await request<{ token: string; sip: SipCredentials }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ username, password }) },
  );
  return { token: data.token, sip: assertCredentials(data.sip) };
}

/**
 * Re-fetch SIP credentials for an existing token. Call this on app resume and
 * whenever registration fails with 401/403 — PBX passwords get rotated and a
 * stale cached credential is the most common "it stopped registering" cause.
 */
export async function refreshSipCredentials(token: string): Promise<SipCredentials> {
  const data = await request<{ sip: SipCredentials }>('/sip/credentials', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return assertCredentials(data.sip);
}

export { ApiError };
