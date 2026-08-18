/**
 * Everything the app needs to bring up a JsSIP UA. Deliberately identical in
 * shape to the mobile app's `SipCredentials` type (src/types/index.ts) — the
 * app never knows which provider produced these values.
 */
export interface ProvisionedSipCredentials {
  username: string;
  password: string;
  domain: string;
  /** Full wss:// endpoint, e.g. "wss://185.45.10.20:4443" */
  wsUri: string;
  displayName?: string;
  /** SIP registration lifetime this provider recommends, seconds. */
  registerExpires: number;
  /** Set only when the provider supports server-side conferencing. */
  conferenceBridge?: string;
}

/**
 * Port for "however we currently get SIP credentials for a given account
 * login". Route handlers depend on this interface, never on a concrete
 * carrier. Swapping carriers, or moving from the Zadarma POC bridge to an
 * officially-sanctioned provisioning method, means writing one new class and
 * changing one line in routes/auth.ts — nothing else in the backend or the
 * mobile app changes.
 */
export interface SipCredentialProvider {
  /**
   * @param accountLogin whatever identifies the caller to this provider —
   *   today that's the Zadarma SIP login itself, since EgoVoip has no
   *   separate user database yet (see routes/auth.ts).
   */
  provision(accountLogin: string): Promise<ProvisionedSipCredentials>;
}
