import { ZadarmaClient } from '../zadarma/client';
import { resolveWebphoneData } from '../zadarma/webphoneDataBridge';
import type { ZadarmaAuth } from '../zadarma/sign';
import type { ProvisionedSipCredentials, SipCredentialProvider } from './SipCredentialProvider';

/**
 * Zadarma-specific implementation of SipCredentialProvider, POC-labeled: it
 * chains the documented `/v1/webrtc/get_key/` call with the undocumented
 * `get_webphone_data.php` bridge (see zadarma/webphoneDataBridge.ts for the
 * full risk writeup). Nothing outside this class and routes/auth.ts knows
 * that either of those calls happened — replace this class alone if Zadarma
 * ships an official provisioning method.
 *
 * 580s matches the register_expires Zadarma's own widget uses; there's no
 * documented reason to deviate from a value they've already proven works
 * against their infrastructure.
 */
const WSS_PORT = '4443';
const REGISTER_EXPIRES = 580;

export class ZadarmaKeyBridgeProvider implements SipCredentialProvider {
  constructor(private readonly auth: ZadarmaAuth) {}

  async provision(sipLogin: string): Promise<ProvisionedSipCredentials> {
    const client = new ZadarmaClient(this.auth);
    const webrtcKey = await client.getWebrtcKey(sipLogin);
    const data = await resolveWebphoneData(webrtcKey, sipLogin);

    return {
      username: data.username,
      password: data.pass,
      domain: data.domain,
      wsUri: `wss://${data.domain}:${WSS_PORT}`,
      registerExpires: REGISTER_EXPIRES,
      // Zadarma's PBX conferencing is not confirmed reachable through this
      // WebRTC-key path — leave unset so the mobile app keeps Merge disabled
      // until that's verified (see ZADARMA.md, "Conferencing").
      conferenceBridge: undefined,
    };
  }
}
