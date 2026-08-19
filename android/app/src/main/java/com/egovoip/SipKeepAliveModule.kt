package com.egovoip

import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Phase 3a POC control surface for SipKeepAliveService — see that class for
 * the full explanation. This module does not touch SIP/audio in any way; it
 * only starts/stops the foreground service and updates its notification
 * text. The existing JS SipEngine remains the single SIP owner.
 */
class SipKeepAliveModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "SipKeepAliveModule"
  }

  override fun getName(): String = "SipKeepAlive"

  @ReactMethod
  fun startKeepAlive() {
    Log.d(TAG, "[keepalive-diag] service start requested")
    val intent = Intent(reactContext, SipKeepAliveService::class.java)
    ContextCompat.startForegroundService(reactContext, intent)
  }

  @ReactMethod
  fun stopKeepAlive() {
    Log.d(TAG, "[keepalive-diag] service stop requested")
    reactContext.stopService(Intent(reactContext, SipKeepAliveService::class.java))
  }

  @ReactMethod
  fun updateNotification(text: String) {
    SipKeepAliveService.updateNotificationText(reactContext, "E-GO שיחות", text)
  }
}
