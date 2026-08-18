# Zadarma transport — findings, contract, and risk

This documents exactly what was verified about Zadarma's WebRTC transport
before wiring EgoVoip's backend to it, per the Phase 1 investigation. Read this
before touching `server/src/zadarma/` or `server/src/sip-providers/`.

## What's documented vs. reverse-engineered

| Piece | Status | Source |
| --- | --- | --- |
| Request signing (HMAC-SHA1) | **Documented, official** | Zadarma's own PHP SDK, [`zadarma/user-api-v1`](https://github.com/zadarma/user-api-v1), `lib/Client.php` |
| `GET /v1/webrtc/get_key/` | **Documented, official** | https://zadarma.com/en/support/api/ |
| `GET .../sys/webrtc/get_webphone_data.php` | **Undocumented** | Found by reading `my.zadarma.com/webphoneWebRTCWidget/v8/js/widget-api.min.js` — this is what Zadarma's own browser widget calls internally |
| `sip.zadarma.com` classic SIP (UDP/TCP, plain password) | **Documented, official** | Zoiper/Linphone setup guides on zadarma.com — but this is a different transport than JsSIP/WSS and would need a native PJSIP binding, not this app's stack |

**Bottom line:** JsSIP-over-WSS is provably the transport Zadarma's own product
uses — this isn't a guess. But turning the officially-issued temporary key into
actual WSS credentials currently goes through an endpoint Zadarma has never
published or promised to keep stable.

## The request-signing algorithm (confirmed against the live API)

Implemented in `server/src/zadarma/sign.ts`. The version below is what's
actually in code now — an earlier reading of the PHP SDK (`zadarma/user-api-v1`,
`lib/Client.php`) got two details wrong, both since fixed and pinned by a
regression test (`server/src/zadarma/sign.test.ts`):

```
paramsString = RFC1738-encode(sort_by_key(params))     // "" if params is empty — do not inject format=json
md5Hex       = md5(paramsString)                        // hex string
stringToSign = method + paramsString + md5Hex
hmacHex      = hmac_sha1(stringToSign, apiSecret)        // hex string
signature    = base64(hmacHex)                          // base64 of the ASCII hex string, not raw digest bytes
Authorization: "<apiKey>:<signature>"
```

**What was wrong before, and how it was caught:** the original port added
`format: "json"` to every request's params, and computed
`base64(rawBytes(HMAC-SHA1(...)))` instead of `base64(hex(HMAC-SHA1(...)))`.
Both looked like faithful reads of the PHP source — PHP's `hash_hmac()`
defaults to `raw_output=false`, which already returns a hex *string*, so
`base64_encode(hash_hmac(...))` in PHP was always base64-encoding a hex
string, not raw bytes; that intermediate step wasn't obvious from the code
alone. `GET /v1/info/balance/` returned `401 Not authorized` under the
original version with a real, freshly-generated key/secret — signing math
verified byte-for-byte correct against the PHP SDK's own documented formula,
env-var loading verified clean, sandbox vs. production ruled out — before
Zadarma support supplied a known-good worked example that surfaced both
discrepancies. Re-tested against the live API afterward:
`GET /v1/info/balance/` → `200 {"status":"success","balance":...}`, then
`GET /v1/webrtc/get_key/?sip=...` → `200 {"status":"success","key":"..."}`.

## `get_key` → `get_webphone_data` chain (implemented in `server/src/sip-providers/ZadarmaKeyBridgeProvider.ts`)

1. `GET https://api.zadarma.com/v1/webrtc/get_key/?sip=<sipLogin>` (signed, documented)
   → `{ "status": "success", "key": "<temporary key, ~72h>" }`

2. `GET https://api.zadarma.com/sys/webrtc/get_webphone_data.php?key=<key>&sipId=<sipLogin>&integrationType=CRM&jsonpCallback=<name>` (**unsigned, undocumented, JSONP**)
   → body is JS: `<name>({ "domain": "...", "username": "...", "pass": "...", "datacenter": "..." })`
   - `domain` + `username` + `pass` are required; `datacenter` is informational
   - On failure the object carries a truthy `error` field — the widget only
     checks truthiness, so the exact error shape (string? object? code?) is
     unconfirmed. Treat any non-empty `error` as fatal.
   - `integrationType` defaults to `"CRM"` in Zadarma's own widget when no
     override is passed in; there's no evidence other values behave
     differently, but this hasn't been tested.

3. Build the JsSIP config exactly as the widget does:
   - `sockets: [new JsSIP.WebSocketInterface("wss://" + domain + ":4443")]`
   - `uri: "sip:" + username + "@" + domain`
   - `authorization_user: username`, `password: pass`
   - `register_expires: 580`

That mapping is what `ZadarmaKeyBridgeProvider.provision()` returns, in the
shape `SipCredentialProvider` declares — the app never sees any of the above,
it only sees `{username, password, domain, wsUri, registerExpires}`.

## Why this is isolated behind an interface

`server/src/sip-providers/SipCredentialProvider.ts` is the only thing
`routes/auth.ts` depends on. `ZadarmaKeyBridgeProvider` is one implementation
of it, clearly labeled as a POC. If Zadarma:

- ships an official mobile-client provisioning method, or
- confirms in writing that `get_webphone_data.php` is intended for
  third-party use and won't change without notice, or
- turns out to gate the endpoint on Referer/Origin/CORS in a way that blocks
  server-to-server calls (untested — the widget only ever calls it
  browser-side)

...the fix is a new class implementing the same interface and a one-line swap
in `server/src/index.ts`. Nothing in `SipEngine.ts` or any screen changes.

## Verifying the chain without a device

```bash
cd server
cp .env.example .env   # fill in ZADARMA_API_KEY / ZADARMA_API_SECRET
npm install
npm run verify:zadarma -- <your-sip-login>
```

This proves steps 1–3 above resolve to real WSS credentials. It does not place
a call and costs nothing — it's the fast way to confirm the chain before
touching the Android app.

## Conferencing (Phase 1: intentionally not built)

`ZadarmaKeyBridgeProvider` never sets `conferenceBridge`, so
`SipSnapshot.conferenceSupported` is always `false` and the mobile app's Merge
button stays visibly disabled — see `src/screens/ActiveCallScreen.tsx`. Whether
Zadarma's PBX exposes a REFER-to-room conferencing flow reachable through the
WebRTC-key path is unconfirmed; investigate only after the single-call and
second-call milestones are proven live.

## Known unknowns going into the live test

- Does `get_webphone_data.php` work identically when called from a backend
  process (no browser context, no Referer) as it does from
  `my.zadarma.com` itself? Untested until `npm run verify:zadarma` is run
  against a real account.
- Does the resolved `domain` route correctly for the account's actual
  datacenter, or is there a case where the wrong datacenter is picked and
  registration silently fails or routes calls oddly?
- Is 580s a safe register interval on real carrier NAT, or does it need to be
  shorter to survive more aggressive connection tracking timeouts?

These get answered by the live test, not by further reading.
