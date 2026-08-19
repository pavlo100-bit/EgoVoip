package com.egovoip

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Phase 3b (minimal) — presents an incoming SIP call as an Android
 * CallStyle notification (androidx.core.app.NotificationCompat.CallStyle;
 * confirmed via androidx.core:core 1.17.0's compiled class, which this
 * project resolves — API 31+ renders the real system incoming-call
 * notification, older versions get the compat-shimmed layout automatically,
 * no separate fallback path needed).
 *
 * Deliberately notification-only: no ConnectionService, no Core-Telecom, no
 * phoneCall foreground-service type. "Answer" and tapping the notification
 * body both just bring MainActivity to the foreground (FLAG_ACTIVITY_NEW_TASK
 * + REORDER_TO_FRONT into the existing singleTask activity, which already
 * has showWhenLocked/turnScreenOn set) — RootNavigator already renders
 * IncomingCallScreen for any 'ringing' call in SipEngine's snapshot
 * regardless of how the app was brought forward, confirmed by the Phase 3a
 * Scenario A test (manually reopening the app during an incoming call
 * already showed the correct screen with zero notification code). No extra
 * native->JS plumbing is needed for that path. "Decline" is the one action
 * that must work WITHOUT opening the app — see IncomingCallActionReceiver.
 */
class IncomingCallNotifier(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "IncomingCallNotifier"
    const val NOTIFICATION_ID = 1002
    private const val CHANNEL_ID = "incoming_call"
    const val ACTION_DECLINE = "com.egovoip.INCOMING_CALL_DECLINE"
    const val EXTRA_CALL_ID = "callId"

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      val channel = NotificationChannel(CHANNEL_ID, "שיחות נכנסות", NotificationManager.IMPORTANCE_HIGH)
      channel.description = "התראת שיחה נכנסת"
      // The app's own ringtone (InCallManager, started/stopped in lockstep
      // with this notification from SipEngine.stopRingtone()) is the single
      // source of audio — silence the channel so the two never play at once.
      channel.setSound(null, null)
      manager.createNotificationChannel(channel)
    }

    /** Bring the app forward — used for both the full-screen intent and "Answer". */
    private fun contentPendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
      }
      return PendingIntent.getActivity(
          context,
          0,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun declinePendingIntent(context: Context, callId: String): PendingIntent {
      val intent = Intent(context, IncomingCallActionReceiver::class.java).apply {
        action = ACTION_DECLINE
        putExtra(EXTRA_CALL_ID, callId)
      }
      return PendingIntent.getBroadcast(
          context,
          callId.hashCode(),
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    fun show(context: Context, callId: String, callerName: String, callerNumber: String) {
      Log.d(TAG, "[sip-incoming-diag] showIncomingCallNotification requested | callId: $callId")
      try {
        ensureChannel(context)

        val displayName = if (callerName.isNotBlank()) callerName else callerNumber
        val person = Person.Builder().setName(displayName).setImportant(true).build()
        val bringToFront = contentPendingIntent(context)

        val callStyle = NotificationCompat.CallStyle.forIncomingCall(
            person,
            declinePendingIntent(context, callId),
            bringToFront,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(displayName)
            .setContentText(callerNumber)
            .setStyle(callStyle)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(bringToFront)
            .setFullScreenIntent(bringToFront, true)
            .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        Log.d(TAG, "[sip-incoming-diag] showIncomingCallNotification posted | callId: $callId")
      } catch (e: SecurityException) {
        // POST_NOTIFICATIONS not granted (Android 13+) — the ringtone and the
        // RTCSession itself are unaffected, only the OS-level notification
        // is skipped.
        Log.e(TAG, "[sip-incoming-diag] showIncomingCallNotification SecurityException: ${e.message}")
      }
    }

    fun hide(context: Context) {
      Log.d(TAG, "[sip-incoming-diag] hideIncomingCallNotification requested")
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
      Log.d(TAG, "[sip-incoming-diag] hideIncomingCallNotification completed")
    }
  }

  override fun getName(): String = "IncomingCallNotifier"

  @ReactMethod
  fun showIncomingCall(callId: String, callerName: String, callerNumber: String) {
    show(reactContext, callId, callerName, callerNumber)
  }

  @ReactMethod
  fun hideIncomingCall() {
    hide(reactContext)
  }
}
