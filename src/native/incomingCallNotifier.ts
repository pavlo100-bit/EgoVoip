import { NativeModules, Platform } from 'react-native';

/**
 * Phase 3b (minimal) — see
 * android/app/src/main/java/com/egovoip/IncomingCallNotifier.kt. Shows/hides
 * the Android CallStyle incoming-call notification. Never touches SIP/audio
 * state itself — SipEngine calls this alongside startRingtone()/
 * stopRingtone() so the notification's lifecycle can never drift from the
 * ringtone's.
 *
 * Android only. Safe to call unconditionally: on iOS, or if the native
 * module isn't present yet (e.g. JS reloaded before a native rebuild), every
 * function here is a silent no-op rather than a crash.
 */
interface IncomingCallNotifierNativeModule {
  showIncomingCall(callId: string, callerName: string, callerNumber: string): void;
  hideIncomingCall(): void;
}

const nativeModule: IncomingCallNotifierNativeModule | undefined =
  Platform.OS === 'android' ? NativeModules.IncomingCallNotifier : undefined;

export function showIncomingCallNotification(
  callId: string,
  callerName: string,
  callerNumber: string,
): void {
  try {
    nativeModule?.showIncomingCall(callId, callerName, callerNumber);
  } catch (e) {
    console.log(
      '[sip-incoming-diag] showIncomingCallNotification threw:',
      e instanceof Error ? e.message : e,
    );
  }
}

export function hideIncomingCallNotification(): void {
  try {
    nativeModule?.hideIncomingCall();
  } catch (e) {
    console.log(
      '[sip-incoming-diag] hideIncomingCallNotification threw:',
      e instanceof Error ? e.message : e,
    );
  }
}
