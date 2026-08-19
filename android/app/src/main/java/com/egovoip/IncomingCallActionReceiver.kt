package com.egovoip

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.Arguments

/**
 * Handles the "Decline" action tapped directly from the incoming-call
 * notification (IncomingCallNotifier), which — unlike "Answer"/tapping the
 * notification body — must work without bringing the app to the foreground,
 * matching standard Android dialer UX (quick-decline from the lock screen).
 *
 * Rejecting a SIP session is JS/JsSIP-only (SipEngine.reject() operates on a
 * live JsSIP RTCSession object that only exists in the JS runtime), so this
 * forwards to the already-running React Native instance via
 * ReactContext.emitDeviceEvent (confirmed present on this exact installed
 * react-native version: ReactContext.java's emitDeviceEvent(String, Object)
 * calls RCTDeviceEventEmitter.emit under the hood). Relying on the JS
 * instance already being alive is safe specifically because Phase 3a's
 * SipKeepAliveService foreground service is what keeps this process running
 * in the background in the first place — if that has failed for some reason
 * (a distinct failure mode outside Phase 3a/3b's scope), the notification is
 * still cancelled directly below so the user is never left with a dead-end
 * button, even though the SIP session itself cannot be rejected from here —
 * no native module owns the SIP session object.
 */
class IncomingCallActionReceiver : BroadcastReceiver() {

  companion object {
    private const val TAG = "IncomingCallActionReceiver"
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != IncomingCallNotifier.ACTION_DECLINE) return
    val callId = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_ID)
    Log.d(TAG, "[sip-incoming-diag] decline notification action received | callId: $callId")

    // Cancel immediately so the notification responds even if the JS
    // round-trip below is slow, or the ReactContext turns out to be null.
    IncomingCallNotifier.hide(context)

    val app = context.applicationContext as? MainApplication
    val reactContext = app?.reactHost?.currentReactContext
    if (reactContext == null) {
      Log.w(TAG, "[sip-incoming-diag] decline: no live ReactContext — cannot forward to SipEngine.reject()")
      return
    }
    val params = Arguments.createMap()
    params.putString("callId", callId)
    reactContext.emitDeviceEvent("EgoIncomingCallDecline", params)
    Log.d(TAG, "[sip-incoming-diag] decline forwarded to JS via emitDeviceEvent")
  }
}
