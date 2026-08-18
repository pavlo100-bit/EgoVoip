import { createHash, createHmac } from 'node:crypto';

/**
 * Zadarma's request-signing scheme, confirmed working against the live API by
 * Zadarma support directly (verified via server/src/scripts/
 * verifyOfficialSigningExample.ts — GET /v1/info/balance/ returned 200 with
 * this exact algorithm). Two things the earlier version, ported from reading
 * zadarma/user-api-v1's PHP source, got wrong:
 *
 *   1. Do not inject `format=json` into every request. Some calls (like plain
 *      info/balance) take no parameters at all, and params_str must then be
 *      exactly "" — not "format=json".
 *   2. The signature is base64(hex(HMAC-SHA1(...))) — base64 of the LOWERCASE
 *      HEX STRING of the digest, not base64 of the raw digest bytes. This
 *      reads as equivalent to PHP's `base64_encode(hash_hmac(...))` only
 *      because PHP's hash_hmac() defaults to raw_output=false, which already
 *      returns a hex string — so PHP was always doing the hex step
 *      implicitly. Node's `.digest('base64')` skips it and encodes raw bytes
 *      directly, producing a different signature that looks superficially
 *      like the same formula.
 *
 *   paramsString = RFC1738 query-encode(sort_by_key(params))   // "" if empty
 *   md5Hex       = md5(paramsString)                            // hex string
 *   stringToSign = method + paramsString + md5Hex
 *   hmacHex      = hmac_sha1(stringToSign, secret)               // hex string
 *   signature    = base64(hmacHex)                              // base64 of the ASCII hex string
 *   Authorization: "<key>:<signature>"
 */

/** PHP's http_build_query(..., PHP_QUERY_RFC1738) encodes spaces as "+". */
function rfc1738Query(params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  return keys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
}

export interface ZadarmaAuth {
  key: string;
  secret: string;
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * @param method API path including version, e.g. "/v1/webrtc/get_key/"
 *   (leading and trailing slash — Zadarma's signature covers the exact path
 *   string, so both must match what is actually requested).
 * @param params Only the parameters this specific call actually needs. Do
 *   not add `format` — it is not required, and adding it when the working
 *   example doesn't changes params_str and therefore the signature.
 */
export function signZadarmaRequest(
  baseUrl: string,
  method: string,
  params: Record<string, string>,
  auth: ZadarmaAuth,
): SignedRequest {
  const paramsString = rfc1738Query(params);
  const md5Hex = createHash('md5').update(paramsString).digest('hex');
  const stringToSign = method + paramsString + md5Hex;
  const hmacHex = createHmac('sha1', auth.secret).update(stringToSign).digest('hex');
  const signature = Buffer.from(hmacHex, 'utf8').toString('base64');

  return {
    url: paramsString ? `${baseUrl}${method}?${paramsString}` : `${baseUrl}${method}`,
    headers: { Authorization: `${auth.key}:${signature}` },
  };
}
