package com.egovoip

import android.media.AudioManager
import android.media.ToneGenerator
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Local keypad-press feedback only — this is NOT SIP DTMF. It plays the
 * standard short dial-pad tone on-device when the user taps a digit, the same
 * way the native Android Phone app gives audible feedback while dialing.
 * Actual DTMF-over-SIP (RFC 2833) is unrelated and lives entirely in
 * SipEngine.sendDTMF() — this module never touches that path.
 *
 * Uses android.media.ToneGenerator, the platform's built-in DTMF/dial-tone
 * synthesizer — no bundled audio asset, so latency is just the native call
 * itself (effectively immediate), and STREAM_DTMF is the dedicated Android
 * audio stream for exactly this purpose, separate from STREAM_VOICE_CALL
 * (used for ringback/call audio) so it doesn't interfere with call routing.
 */
class DtmfToneModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  companion object {
    // A short, standard dial-pad tone length. Long enough to be clearly
    // audible, short enough to never feel like a delay or overlap a fast
    // tapper's next press.
    private const val TONE_DURATION_MS = 120
    private const val TONE_VOLUME_PERCENT = 80
  }

  // Reused for the app's lifetime — ToneGenerator.startTone() automatically
  // cuts off any tone already playing on this instance before starting the
  // next one, so no manual stop/release bookkeeping is needed between
  // keypresses.
  private val toneGenerator: ToneGenerator? by lazy {
    try {
      ToneGenerator(AudioManager.STREAM_DTMF, TONE_VOLUME_PERCENT)
    } catch (e: RuntimeException) {
      // Some devices/emulators can fail to allocate the audio resource —
      // keypad tone feedback is a nice-to-have, never worth crashing over.
      null
    }
  }

  override fun getName(): String = "DtmfTone"

  /**
   * @param key one of "0".."9", "*", "#" — anything else is silently ignored.
   */
  @ReactMethod
  fun playTone(key: String) {
    val tone = when (key) {
      "0" -> ToneGenerator.TONE_DTMF_0
      "1" -> ToneGenerator.TONE_DTMF_1
      "2" -> ToneGenerator.TONE_DTMF_2
      "3" -> ToneGenerator.TONE_DTMF_3
      "4" -> ToneGenerator.TONE_DTMF_4
      "5" -> ToneGenerator.TONE_DTMF_5
      "6" -> ToneGenerator.TONE_DTMF_6
      "7" -> ToneGenerator.TONE_DTMF_7
      "8" -> ToneGenerator.TONE_DTMF_8
      "9" -> ToneGenerator.TONE_DTMF_9
      "*" -> ToneGenerator.TONE_DTMF_S
      "#" -> ToneGenerator.TONE_DTMF_P
      else -> return
    }
    toneGenerator?.startTone(tone, TONE_DURATION_MS)
  }
}
