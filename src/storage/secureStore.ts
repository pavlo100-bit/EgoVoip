import * as Keychain from 'react-native-keychain';
import type { AuthSession } from '../types';

const SERVICE = 'com.egovoip.session';

/**
 * SIP credentials include a plaintext password that can place billable calls,
 * so they go in the Keystore/Keychain — never AsyncStorage.
 */
export async function saveSession(session: AuthSession): Promise<void> {
  await Keychain.setGenericPassword('session', JSON.stringify(session), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
  });
}

export async function loadSession(): Promise<AuthSession | null> {
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    if (!creds) return null;
    return JSON.parse(creds.password) as AuthSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
