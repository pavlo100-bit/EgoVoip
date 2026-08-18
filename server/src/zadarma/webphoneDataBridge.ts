/**
 * ============================================================================
 * PROOF-OF-CONCEPT ONLY — NOT AN OFFICIAL ZADARMA API.
 * ============================================================================
 *
 * `GET https://api.zadarma.com/sys/webrtc/get_webphone_data.php` does not
 * appear anywhere in Zadarma's published API documentation
 * (https://zadarma.com/en/support/api/). It was found by reading the minified
 * JS of Zadarma's own embeddable web-phone widget
 * (my.zadarma.com/webphoneWebRTCWidget/v8/js/widget-api.min.js), which calls
 * exactly this endpoint to turn a temporary `/v1/webrtc/get_key/` key into
 * real WSS SIP credentials.
 *
 * What we know, empirically, from reading that script:
 *   - Called as a JSONP request: `?jsonpCallback=<name>&key=<key>&sipId=<sip
 *     login>&integrationType=<string, widget defaults to "CRM">`
 *   - Response body is JS: `<name>({ ...json... })`
 *   - On success the object has: domain, username, pass, datacenter
 *   - On failure it has a truthy `error` field (exact shape unconfirmed —
 *     the widget doesn't destructure it beyond a boolean check)
 *
 * Risk: Zadarma has made no compatibility promise for this endpoint. It could
 * change shape, start requiring a Referer/Origin check that blocks
 * non-browser callers, or be removed outright. Do not call this from the
 * mobile app or treat it as a stable dependency — it exists only behind the
 * SipCredentialProvider interface so it can be deleted in one place the
 * moment Zadarma provides (or confirms) an official provisioning method for
 * third-party native clients. Track that request separately; this file
 * should not outlive it.
 * ============================================================================
 */

export class WebphoneDataBridgeError extends Error {
  constructor(message: string, readonly raw?: unknown) {
    super(message);
    this.name = 'WebphoneDataBridgeError';
  }
}

export interface WebphoneData {
  domain: string;
  username: string;
  pass: string;
  datacenter: string;
}

const ENDPOINT = 'https://api.zadarma.com/sys/webrtc/get_webphone_data.php';
const CALLBACK_NAME = 'egovoipPoc';

function parseJsonp(body: string, callbackName: string): unknown {
  // The endpoint is designed for a <script> tag, so the body is
  // "<callbackName>({...})" — no eval, just isolate the object literal.
  const prefix = `${callbackName}(`;
  const start = body.indexOf(prefix);
  const end = body.lastIndexOf(')');
  if (start === -1 || end === -1 || end <= start) {
    throw new WebphoneDataBridgeError('Unexpected response shape from get_webphone_data.php');
  }
  const jsonSlice = body.slice(start + prefix.length, end);
  try {
    return JSON.parse(jsonSlice);
  } catch {
    throw new WebphoneDataBridgeError('Could not parse get_webphone_data.php payload as JSON');
  }
}

/**
 * @param webrtcKey the temporary key from ZadarmaClient.getWebrtcKey()
 * @param sipLogin the SIP login the key was issued for
 */
export async function resolveWebphoneData(
  webrtcKey: string,
  sipLogin: string,
): Promise<WebphoneData> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('jsonpCallback', CALLBACK_NAME);
  url.searchParams.set('key', webrtcKey);
  url.searchParams.set('sipId', sipLogin);
  url.searchParams.set('integrationType', 'CRM');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new WebphoneDataBridgeError(`get_webphone_data.php returned HTTP ${res.status}`);
  }

  const body = await res.text();
  const parsed = parseJsonp(body, CALLBACK_NAME) as Partial<WebphoneData> & {
    error?: unknown;
  };

  if (parsed.error) {
    // Never log `webrtcKey` or any field from `parsed` here — err on the side
    // of treating the whole payload as sensitive until proven otherwise.
    throw new WebphoneDataBridgeError('Zadarma rejected the webrtc key', parsed.error);
  }
  if (!parsed.domain || !parsed.username || !parsed.pass) {
    throw new WebphoneDataBridgeError('get_webphone_data.php response is missing required fields');
  }

  return {
    domain: parsed.domain,
    username: parsed.username,
    pass: parsed.pass,
    datacenter: parsed.datacenter ?? 'unknown',
  };
}
