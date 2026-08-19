package com.egovoip

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.util.Log
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
 * itself (effectively immediate).
 *
 * TEMPORARY — diagnostics for the "no sound at all" investigation. Every
 * line here is [dtmf-diag], safe to grep and safe to remove once the real
 * cause is confirmed and fixed. Nothing sensitive is logged.
 */
class DtmfToneModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "DtmfToneModule"
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
      val tg = ToneGenerator(AudioManager.STREAM_DTMF, TONE_VOLUME_PERCENT)
      Log.d(TAG, "[dtmf-diag] ToneGenerator constructed OK | stream: STREAM_DTMF (${AudioManager.STREAM_DTMF}) | volume: $TONE_VOLUME_PERCENT")
      tg
    } catch (e: RuntimeException) {
      // Some devices/emulators can fail to allocate the audio resource —
      // keypad tone feedback is a nice-to-have, never worth crashing over.
      Log.e(TAG, "[dtmf-diag] ToneGenerator construction FAILED: ${e.message}")
      null
    }
  }

  override fun getName(): String = "DtmfTone"

  private fun toneName(key: String): String = when (key) {
    "0" -> "TONE_DTMF_0"
    "1" -> "TONE_DTMF_1"
    "2" -> "TONE_DTMF_2"
    "3" -> "TONE_DTMF_3"
    "4" -> "TONE_DTMF_4"
    "5" -> "TONE_DTMF_5"
    "6" -> "TONE_DTMF_6"
    "7" -> "TONE_DTMF_7"
    "8" -> "TONE_DTMF_8"
    "9" -> "TONE_DTMF_9"
    "*" -> "TONE_DTMF_S"
    "#" -> "TONE_DTMF_P"
    else -> "UNKNOWN"
  }

  private fun toneConstant(key: String): Int? = when (key) {
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
    else -> null
  }

  private fun ringerModeName(mode: Int): String = when (mode) {
    AudioManager.RINGER_MODE_NORMAL -> "NORMAL"
    AudioManager.RINGER_MODE_VIBRATE -> "VIBRATE"
    AudioManager.RINGER_MODE_SILENT -> "SILENT"
    else -> "UNKNOWN($mode)"
  }

  /**
   * @param key one of "0".."9", "*", "#" — anything else is silently ignored.
   */
  @ReactMethod
  fun playTone(key: String) {
    Log.d(TAG, "[dtmf-diag] playTone() ENTERED | requested digit: \"$key\"")

    val tone = toneConstant(key)
    if (tone == null) {
      Log.w(TAG, "[dtmf-diag] no tone mapping for \"$key\" — ignored")
      return
    }
    Log.d(TAG, "[dtmf-diag] mapped constant: ${toneName(key)} ($tone)")

    val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    if (audioManager != null) {
      val streamVol = audioManager.getStreamVolume(AudioManager.STREAM_DTMF)
      val streamMaxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_DTMF)
      val ringerMode = ringerModeName(audioManager.ringerMode)
      Log.d(
          TAG,
          "[dtmf-diag] STREAM_DTMF volume: $streamVol / $streamMaxVol | ringer mode: $ringerMode | audioMode: ${audioManager.mode}",
      )
      if (streamVol == 0) {
        Log.w(TAG, "[dtmf-diag] STREAM_DTMF volume is 0 — tone will be constructed and \"started\" but INAUDIBLE regardless of ToneGenerator success")
      }
    } else {
      Log.w(TAG, "[dtmf-diag] could not obtain AudioManager — cannot read stream volume")
    }

    val tg = toneGenerator
    if (tg == null) {
      Log.e(TAG, "[dtmf-diag] toneGenerator is null (construction failed earlier) — cannot play")
      return
    }

    val started = tg.startTone(tone, TONE_DURATION_MS)
    Log.d(TAG, "[dtmf-diag] startTone() returned: $started | duration: ${TONE_DURATION_MS}ms")
  }
}
