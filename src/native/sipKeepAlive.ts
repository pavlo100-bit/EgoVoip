import { NativeModules, Platform } from 'react-native';

/**
 * Phase 3a POC — see android/app/src/main/java/com/egovoip/SipKeepAliveService.kt
 * for the full explanation. This module never touches SIP/audio state; it
 * only starts/stops a foreground service + notification. The existing
 * SipEngine singleton remains the single SIP owner, completely unaffected by
 * anything in this file.
 *
 * Android only. Safe to call unconditionally: on iOS, or if the native
 * module isn't present yet (e.g. JS reloaded before a native rebuild), every
 * function here is a silent no-op rather than a crash.
 */
interface SipKeepAliveNativeModule {
  startKeepAlive(): void;
  stopKeepAlive(): void;
  updateNotification(text: string): void;
}

const nativeModule: SipKeepAliveNativeModule | undefined =
  Platform.OS === 'android' ? NativeModules.SipKeepAlive : undefined;

export function startKeepAlive(): void {
  console.log('[keepalive-diag] JS requesting startKeepAlive()');
  try {
    nativeModule?.startKeepAlive();
  } catch (e) {
    console.log('[keepalive-diag] startKeepAlive() threw:', e instanceof Error ? e.message : e);
  }
}

export function stopKeepAlive(): void {
  console.log('[keepalive-diag] JS requesting stopKeepAlive()');
  try {
    nativeModule?.stopKeepAlive();
  } catch (e) {
    console.log('[keepalive-diag] stopKeepAlive() threw:', e instanceof Error ? e.message : e);
  }
}

export function updateKeepAliveNotification(text: string): void {
  try {
    nativeModule?.updateNotification(text);
  } catch (e) {
    console.log('[keepalive-diag] updateNotification() threw:', e instanceof Error ? e.message : e);
  }
}
