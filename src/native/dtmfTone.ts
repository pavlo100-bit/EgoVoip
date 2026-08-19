import { NativeModules, Platform } from 'react-native';

/**
 * Local keypad-press feedback only — the short dial-pad tone a phone plays
 * when you tap a digit. NOT SIP DTMF (RFC 2833) — that's entirely separate,
 * unaffected code in SipEngine.sendDTMF().
 *
 * Backed by android/app/src/main/java/com/egovoip/DtmfToneModule.kt, a thin
 * wrapper around android.media.ToneGenerator (the platform's built-in
 * DTMF/dial-tone synthesizer — no bundled audio asset).
 *
 * Android only for now. Safe to call unconditionally: on iOS, or if the
 * native module isn't present yet (e.g. JS reloaded before a native
 * rebuild), this is a silent no-op rather than a crash — keypad tone
 * feedback is UX polish, never worth breaking dialing over.
 */
interface DtmfToneNativeModule {
  playTone(key: string): void;
}

const nativeModule: DtmfToneNativeModule | undefined =
  Platform.OS === 'android' ? NativeModules.DtmfTone : undefined;

export function playKeypadTone(key: string): void {
  try {
    nativeModule?.playTone(key);
  } catch {
    // Never let local tone feedback take down a real keypress.
  }
}
