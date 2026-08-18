import { Platform } from 'react-native';
import {
  check,
  request,
  requestMultiple,
  requestNotifications,
  RESULTS,
  PERMISSIONS,
  type Permission,
  type PermissionStatus,
} from 'react-native-permissions';

const androidApi = Platform.OS === 'android' ? Number(Platform.Version) : 0;

/** Permissions required before the SIP stack may open the microphone. */
export function callPermissions(): Permission[] {
  if (Platform.OS === 'ios') return [PERMISSIONS.IOS.MICROPHONE];

  const list: Permission[] = [PERMISSIONS.ANDROID.RECORD_AUDIO];
  // Android 12+ requires runtime consent for Bluetooth headset routing.
  if (androidApi >= 31) list.push(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
  return list;
}

export function contactsPermission(): Permission {
  return Platform.OS === 'ios'
    ? PERMISSIONS.IOS.CONTACTS
    : PERMISSIONS.ANDROID.READ_CONTACTS;
}

const granted = (s: PermissionStatus) =>
  s === RESULTS.GRANTED || s === RESULTS.LIMITED;

/**
 * RECORD_AUDIO is the only hard blocker — without it getUserMedia rejects and
 * the INVITE never carries an SDP offer. Bluetooth and notifications degrade
 * gracefully, so their outcome does not gate the call.
 */
export async function ensureCallPermissions(): Promise<{
  ok: boolean;
  blocked: boolean;
}> {
  const perms = callPermissions();
  const mic = perms[0];

  const current = await check(mic);
  if (current === RESULTS.BLOCKED) return { ok: false, blocked: true };

  const results = await requestMultiple(perms);
  const micResult = results[mic];

  return {
    ok: granted(micResult),
    blocked: micResult === RESULTS.BLOCKED,
  };
}

/**
 * POST_NOTIFICATIONS is not a plain runtime permission in this library — it has
 * its own API. Needed on Android 13+ for the ongoing-call notification and the
 * full-screen incoming-call intent.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && androidApi < 33) return true;
  try {
    const { status } = await requestNotifications(['alert', 'sound']);
    return granted(status);
  } catch {
    return false;
  }
}

export async function ensureContactsPermission(): Promise<boolean> {
  const perm = contactsPermission();
  const current = await check(perm);
  if (granted(current)) return true;
  if (current === RESULTS.BLOCKED || current === RESULTS.UNAVAILABLE) return false;
  return granted(await request(perm));
}
