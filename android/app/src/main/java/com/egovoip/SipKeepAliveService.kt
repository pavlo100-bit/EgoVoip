package com.egovoip

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.Process
import android.os.SystemClock
import android.util.Log

/**
 * Phase 3a POC — empirically testing whether a correctly-typed foreground
 * service keeps the app's process (and therefore the existing JsSIP
 * WebSocket + REGISTER, which live entirely in the JS engine running in this
 * same process) alive through background, screen-lock, and swipe-away from
 * Recents. NOT the final production architecture — no Core-Telecom, no
 * CallStyle, no full-screen intent yet (see ARCHITECTURE.md).
 *
 * This service does not touch SIP/audio/JsSIP in any way. It has exactly one
 * job: hold the OS-level foreground flag + a low-priority notification, so
 * Android has a documented reason not to kill this process. The existing
 * SipEngine singleton remains the single SIP owner, untouched.
 */
class SipKeepAliveService : Service() {

  companion object {
    private const val TAG = "SipKeepAliveService"
    private const val CHANNEL_ID = "sip_keep_alive"
    private const val NOTIFICATION_ID = 1001

    @Volatile
    var isRunning: Boolean = false
      private set

    /**
     * Updates the persistent notification's text in place. Static/companion
     * rather than routed through a bound-service instance reference — Android's
     * own NotificationManager.notify() with the same notification ID already
     * updates whatever's currently displayed, so no direct instance handle is
     * needed, and this stays callable regardless of exact service lifecycle
     * timing.
     */
    fun updateNotificationText(context: Context, title: String, text: String) {
      Log.d(TAG, "[keepalive-diag] updateNotification requested")
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(NOTIFICATION_ID, buildNotification(context, title, text))
    }

    private fun buildNotification(context: Context, title: String, text: String): Notification {
      ensureChannel(context)
      return Notification.Builder(context, CHANNEL_ID)
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(context.applicationInfo.icon)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .build()
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      // IMPORTANCE_LOW: no sound, minimal visual weight — this is the idle
      // "ready to receive calls" state, not an active-call notification.
      val channel = NotificationChannel(CHANNEL_ID, "E-GO שיחות", NotificationManager.IMPORTANCE_LOW)
      channel.description = "שירות רקע לשמירת רישום SIP"
      manager.createNotificationChannel(channel)
    }
  }

  // TEMPORARY — Scenario C (swipe-away) diagnostic investigation. Distinct
  // from process death itself: the OS's Low Memory Killer SIGKILLs a
  // process with no callback of any kind, so onDestroy below is NOT proof
  // the process survived a swipe — it only proves the *service object* was
  // torn down cleanly (e.g. our own stop()) BEFORE any kill. The only real
  // evidence of "did the whole process die and get recreated" is comparing
  // this PID (and the elapsedRealtime, which resets to 0 on device reboot
  // but keeps counting through app/process kills, unlike wall-clock time)
  // across log lines from before and after a swipe-away test.
  private fun pidTag(): String =
    "pid=${Process.myPid()} | elapsedRealtime=${SystemClock.elapsedRealtime()}"

  override fun onCreate() {
    super.onCreate()
    Log.d(TAG, "[keepalive-diag] service actually created | ${pidTag()}")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // A null intent here (with isRunning already false) is the specific
    // signature of an OS-triggered START_STICKY restart after a process
    // kill — as opposed to intent != null, which is always our own explicit
    // startKeepAlive() call from JS (see SipKeepAliveModule.startKeepAlive).
    Log.d(
      TAG,
      "[keepalive-diag] onStartCommand entered | intent==null: ${intent == null} | " +
        "wasAlreadyRunning: $isRunning | ${pidTag()}",
    )
    if (isRunning) {
      Log.d(TAG, "[keepalive-diag] onStartCommand called while already running — no duplicate instance, same service reused")
    }
    val notification = buildNotification(this, "E-GO שיחות", "מוכן לקבלת שיחות")
    startForeground(NOTIFICATION_ID, notification)
    isRunning = true
    Log.d(TAG, "[keepalive-diag] startForeground completed | ${pidTag()}")

    // START_STICKY: if the OS kills this process under memory pressure, ask
    // it to recreate the service (onStartCommand called again with a null
    // intent — handled fine above since we don't depend on intent extras).
    // Deliberately NOT START_REDELIVER_INTENT — there's no meaningful work
    // tied to the original start Intent to redeliver, restarting into the
    // same idle keep-alive state is already the correct recovery. This is a
    // best-effort recovery for memory-pressure kills only — it does not, and
    // cannot, survive the user force-stopping the app (Android's "stopped"
    // app state explicitly cancels all such restarts) or the OS refusing to
    // schedule a restart at all under sustained pressure.
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    Log.d(
      TAG,
      "[keepalive-diag] onTaskRemoved (app swiped away from Recents) — " +
        "service continues intentionally, not calling stopSelf() | ${pidTag()}",
    )
  }

  override fun onDestroy() {
    isRunning = false
    // If this line is MISSING between a swipe-away and the next
    // onStartCommand's "wasAlreadyRunning: false", the service (and
    // therefore the whole process, since nothing else would restart it)
    // was SIGKILLed directly — onDestroy is only called on a clean stop,
    // never on an OS low-memory kill.
    Log.d(TAG, "[keepalive-diag] service destroyed (clean stop, not a kill) | ${pidTag()}")
    super.onDestroy()
  }
}
