/**
 * Runtime configuration. Nothing SIP-related lives here — SIP credentials are
 * fetched from the backend at login time and never bundled into the APK.
 */
export const ENV = {
  /**
   * Your backend that issues the auth token and the SIP credentials.
   * Phase 1 / local dev: `cd server && npm run dev`, then on the device run
   * `adb reverse tcp:4000 tcp:4000` — that forwards the device's own
   * 127.0.0.1:4000 to your machine's :4000 over the USB connection, so this
   * works over USB regardless of which Wi-Fi/cellular network the phone is
   * on. (If you'd rather use the LAN instead of USB, swap this for your
   * machine's LAN IP, e.g. "http://192.168.1.50:4000" — but note the phone
   * and the backend then both need to be on the same network.)
   */
  API_BASE_URL: 'http://127.0.0.1:4000',

  /** ICE servers. Replace with your own TURN — without TURN, calls fail on
   *  symmetric-NAT mobile networks (a large share of carrier NATs). */
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    // {
    //   urls: ['turn:turn.example.com:3478?transport=udp',
    //          'turn:turn.example.com:3478?transport=tcp',
    //          'turns:turn.example.com:5349?transport=tcp'],
    //   username: 'user',
    //   credential: 'pass',
    // },
  ] as RTCIceServer[],

  /**
   * SIP registration lifetime, seconds. 580 matches what Zadarma's own
   * webphone widget registers with — the backend also sends
   * `registerExpires` per-credential-set, but this is the fallback if that's
   * ever absent.
   */
  REGISTER_EXPIRES: 580,

  /** Max entries kept in the local call log. */
  CALL_LOG_LIMIT: 500,
} as const;

type RTCIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};
