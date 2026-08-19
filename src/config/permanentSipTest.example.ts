/**
 * TEMPORARY test fixture — not imported by any app code directly.
 *
 * To run the permanent-SIP-credential REGISTER test (bypassing the backend
 * and the ephemeral WebRTC-issued credential entirely):
 *
 *   cp src/config/permanentSipTest.example.ts src/config/permanentSipTest.local.ts
 *
 * Then edit permanentSipTest.local.ts (gitignored — *.local.ts — never
 * commit it) and fill in your real SIP password from the Zadarma dashboard,
 * Settings -> SIP Connection. Nothing here is read from chat or committed to
 * source control.
 *
 * Once set, PERMANENT_SIP_TEST.enabled becomes true and App.tsx renders the
 * dedicated test screen instead of the normal login/dialer flow — the
 * regular app is completely unaffected when this file doesn't exist, which
 * is the default for every build that hasn't opted into this test.
 *
 * Remove src/config/permanentSipTest.local.ts, src/config/
 * permanentSipTest.example.ts, src/sip/permanentCredentialTest.ts, and
 * src/screens/PermanentCredentialTestScreen.tsx once this investigation is
 * resolved — none of this is meant to ship.
 */
export const PERMANENT_SIP_TEST = {
  username: '45089',
  password: '', // fill in locally — the actual SIP account password, never committed
  domain: 'sip.zadarma.com',
  wsUri: 'wss://sipfr.zadarma.com:4443',
  registerExpires: 300,
};
