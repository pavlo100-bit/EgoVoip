import { signZadarmaRequest, type ZadarmaAuth } from './sign';

const PROD_URL = 'https://api.zadarma.com';
const SANDBOX_URL = 'https://api-sandbox.zadarma.com';

export class ZadarmaApiError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
    this.name = 'ZadarmaApiError';
  }
}

/**
 * Thin client for Zadarma's **documented** REST API
 * (https://zadarma.com/en/support/api/). Everything in this file is the
 * officially supported surface — nothing here should be treated as fragile.
 */
export class ZadarmaClient {
  private readonly baseUrl: string;

  constructor(private readonly auth: ZadarmaAuth, sandbox = false) {
    this.baseUrl = sandbox ? SANDBOX_URL : PROD_URL;
  }

  /**
   * GET /v1/webrtc/get_key/ — documented endpoint. Returns a temporary key
   * (72h lifetime per Zadarma's docs) scoped to one SIP login, intended for
   * their embeddable browser widget.
   */
  async getWebrtcKey(sipLogin: string): Promise<string> {
    const { url, headers } = signZadarmaRequest(
      this.baseUrl,
      '/v1/webrtc/get_key/',
      { sip: sipLogin },
      this.auth,
    );

    const res = await fetch(url, { headers });
    const body = (await res.json()) as { status?: string; message?: string; key?: string };

    if (!res.ok || body.status === 'error' || !body.key) {
      throw new ZadarmaApiError(body.message ?? 'Zadarma get_key failed', res.status);
    }
    return body.key;
  }
}
