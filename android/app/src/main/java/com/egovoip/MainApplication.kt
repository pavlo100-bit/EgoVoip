package com.egovoip

import android.app.Application
import android.os.Process
import android.os.SystemClock
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(DtmfTonePackage())
          add(SipKeepAlivePackage())
          add(IncomingCallNotifierPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // TEMPORARY — Scenario C (swipe-away) diagnostic investigation.
    // Application.onCreate() runs exactly once per OS process, regardless of
    // which component (Activity, Service, BroadcastReceiver) triggered the
    // process to start — so a NEW occurrence of this log line after a
    // swipe-away test is direct proof the whole process was killed and
    // recreated (as opposed to only some in-process state, like the
    // WebSocket, dying while the process itself survived). Compare this
    // pid/elapsedRealtime against SipKeepAliveService's own logs (same
    // process => same pid) and against the JS-side "SipEngine module
    // evaluated" / "root mounted" timestamps to see how much time passed
    // before SipEngine.start() could possibly run again.
    Log.d(
      "MainApplication",
      "[keepalive-diag] process started | pid=${Process.myPid()} | elapsedRealtime=${SystemClock.elapsedRealtime()}",
    )
    loadReactNative(this)
  }
}
