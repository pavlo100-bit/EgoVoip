# EgoVoip — architecture

A standalone SIP softphone. No SIP account is compiled into the app: credentials
are issued by your backend at sign-in and held in the OS keystore.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| SIP signalling | **JsSIP 3.x** over WSS | Pure JS, no native SIP stack to maintain. SIP-over-WebSocket is the only transport WebRTC media pairs with cleanly, and it traverses corporate firewalls on 443. |
| Media | **react-native-webrtc** | The only maintained WebRTC binding for RN. Supplies `RTCPeerConnection`/`getUserMedia` that JsSIP drives. |
| Audio routing | **react-native-incall-manager** | Earpiece/speaker switching, proximity blanking, ringtone/ringback, audio focus. |
| Permissions | **react-native-permissions** | One API across both platforms, and correct handling of Android's per-API-level split. |
| Credential storage | **react-native-keychain** | The SIP password can place billable calls — Keystore/Keychain, not AsyncStorage. |
| Call log | **AsyncStorage** | App-local. Writing to the system call log needs `WRITE_CALL_LOG` and default-dialer status; not worth the Play Store review. |
| Navigation | **@react-navigation/bottom-tabs** | Standard three-tab dialer shape. |

JsSIP over SIP.js: SIP.js is the more flexible library, but JsSIP's `RTCSession`
already implements hold/unhold/DTMF/REFER as one-line calls, which is most of
what a softphone needs. Choose SIP.js only if you need to hand-roll SDP.

## Layout

```
src/
  api/backend.ts          POST /auth/login -> { token, sip }; credential refresh
  config/env.ts           API base URL, ICE servers, register expiry
  sip/
    polyfills.ts          registerGlobals() — imported first from index.js
    emitter.ts            tiny subscribe/emit store primitive
    SipEngine.ts          the whole SIP/WebRTC state machine (singleton)
  context/AuthContext.tsx sign-in, session restore, foreground re-registration
  hooks/useSip.ts         useSyncExternalStore bridge to SipEngine
  storage/
    secureStore.ts        Keychain-backed session
    callHistory.ts        local call log
  permissions/            mic / bluetooth / notifications / contacts
  screens/                Login, Dialer, Contacts, History, ActiveCall, IncomingCall
  navigation/             tabs + full-screen call overlay
```

**The engine is a singleton, not React state.** An INVITE can arrive while no
component is mounted, and the UA has to survive navigation. React subscribes to
an immutable snapshot through `useSyncExternalStore`; it never touches a JsSIP
object directly.

## Backend contract

Implemented in `server/` — Express, TypeScript. See [ZADARMA.md](ZADARMA.md) for
exactly how it resolves a SIP login into WSS credentials, and why that
resolution is isolated behind `SipCredentialProvider`.

`POST /auth/login` → 200:

```json
{
  "token": "…",
  "sip": {
    "username": "1001x9f2a",
    "password": "…",
    "domain": "185.45.10.20",
    "wsUri": "wss://185.45.10.20:4443",
    "displayName": "1001"
  }
}
```

`GET /sip/credentials` (Bearer token) returns the same `sip` object. The app
calls it on every foreground transition where registration is down, so a
rotated or expired temporary key does not permanently strand an installed
client — it just re-runs the provisioning chain.

`wsUri` must be `wss://` — `ws://` is rejected client-side and blocked by
Android's default network security config anyway.

**Phase 1 auth is intentionally thin — do not mistake it for real
authentication.** `username` in the login request is the Zadarma SIP login
itself; `password` is not checked against anything, because there is no user
database yet. Anyone who knows (or guesses) a valid SIP login can currently
have credentials issued for it. This is fine for a single-account proof of
concept run against your own backend; it is not fine to expose publicly or
hand to more than one trusted user before real account/password checking is
added in front of `SipCredentialProvider.provision()`.

## Call flow

Outbound: `sipEngine.call()` → JsSIP `INVITE` → `progress` starts ringback →
`confirmed` opens the audio session → UI switches to `ActiveCallScreen`.

Inbound: `newRTCSession(originator: 'remote')` → ringtone → full-screen
`IncomingCallScreen` → `answer()` requests the mic before sending 200 OK.

Two legs max. Placing or answering a second call automatically holds the first.

## Conferencing — not built in Phase 1

There is no local audio mixing. react-native-webrtc has no usable WebAudio
graph, so two remote streams cannot be summed on the handset — every real mobile
softphone merges server-side, and so would this one, if built.

`SipEngine.merge()` exists and sends a blind `REFER` for both legs to
`sip:<conferenceBridge><extension>@<domain>`, then dials the same room — but
whether Zadarma's PBX supports this through the WebRTC-key path is unconfirmed
and out of scope until the single-call and second-call milestones are proven
live (see ZADARMA.md, "Conferencing"). The backend never sets
`conferenceBridge`, so `SipSnapshot.conferenceSupported` is `false` and the
Merge button in `ActiveCallScreen` stays visibly disabled — not hidden, not a
button that throws when tapped.

`swap()` (hold A, resume B) needs no server support and works once
second-call/Add-call is exercised.

## Known gaps before production

0. **Credential provisioning rides an undocumented Zadarma endpoint.** See
   ZADARMA.md in full. `/v1/webrtc/get_key/` is official; the call that turns
   that key into WSS domain/username/password is not. Isolated behind
   `SipCredentialProvider` specifically so this can be swapped without
   touching the app.
1. **Background calls.** A registration held open by a WebSocket dies in Doze.
   The production answer is push: a foreground service with
   `FOREGROUND_SERVICE_MICROPHONE` for the duration of a call, plus FCM
   high-priority data messages from the PBX to wake the app for an incoming
   call. Long-lived registration alone will drop calls on real devices.
2. **Native call UI.** `react-native-callkeep` gives you CallKit and the Android
   `ConnectionService` incoming-call screen over the lock screen. Note it was
   last published in Nov 2024 — verify it against RN 0.84's New Architecture
   before committing, or budget for a fork.
3. **TURN.** `ENV.ICE_SERVERS` ships with a public STUN server only. Carrier NAT
   will break calls without TURN; run coturn or take TURN creds per-tenant from
   the login response.
4. **Codec/DTMF negotiation** is left to the PBX defaults. Force Opus and check
   the PBX actually negotiated RFC 2833 if IVR digits misbehave.
5. **Dialer UI cleanup pass — not started, deliberately deferred.** Reported
   on a real Android device: the keypad layout renders visually wrong/reversed,
   not matching a standard phone dialer. Not blocking the current SIP/ICE
   timing work, so intentionally left alone rather than mixed into that fix.
   Scope for the pass, once outbound call latency is confirmed fixed and a
   real call is stable:
   - Standard keypad layout (1 2 3 / 4 5 6 / 7 8 9 / 0), corrected from
     whatever's producing the reversed layout now
   - Correct RTL/LTR handling — the keypad itself must never mirror under
     Hebrew locale/RTL layout direction (likely needs explicit
     `writingDirection`/`I18nManager` handling in `Keypad.tsx`, since RN's
     default RTL flip applies to Flexbox layout order and would reverse a
     numeric grid that must stay LTR regardless of locale)
   - `+` support for international dialing (already present in
     `toSipUri()`/long-press-0 in `DialerScreen.tsx` — confirm the UI affordance
     for entering it is discoverable, not just functional)
   - Backspace/delete (already implemented — confirm it survives the layout
     fix)
   - Large, touch-friendly call button
   - Consistent spacing/alignment across the keypad grid
   - Number display above the keypad (already present — revisit as part of
     the same pass for consistency)
   - Recents/Dialer/Contacts tabs polished for normal end-user use, not just
     functional correctness
   Touches `src/components/Keypad.tsx`, `src/screens/DialerScreen.tsx`, and
   likely `src/screens/ContactsScreen.tsx`/`src/screens/HistoryScreen.tsx` for
   the tab-polish scope. No code changed yet — documentation only.

## Build

Backend (needed before the app can register — see ZADARMA.md for the
credential chain it runs):

```bash
cd server
cp .env.example .env   # fill in ZADARMA_API_KEY / ZADARMA_API_SECRET
npm install
npm run verify:zadarma -- <your-sip-login>   # confirms the chain before touching the app
npm run dev                                   # starts the server on :4000
```

Then set `src/config/env.ts`'s `API_BASE_URL` to your machine's LAN IP (not
`localhost` — an Android device can't reach your machine's loopback address)
before building the app.

App:

```bash
npm install
```

Android:

```bash
npm run android
```

Release APK:

```bash
cd android && ./gradlew assembleRelease
```

iOS (macOS only) — `react-native-webrtc` needs a real device for audio:

```bash
cd ios && pod install && cd .. && npm run ios --device
```
