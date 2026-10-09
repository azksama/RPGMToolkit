package fr.azk.rpgmtoolkit

import android.os.Bundle
import android.graphics.Color
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  fun requestWolfNotifications() {
    if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 190)
  }
  override fun onResume() {
    super.onResume()
    if (WolfSession.awaitingPermission && android.provider.Settings.canDrawOverlays(this) && WolfSession.root != null) {
      WolfSession.awaitingPermission=false
      requestWolfNotifications()
      startForegroundService(android.content.Intent(this,WolfOverlayService::class.java))
    }
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT), navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT))
    super.onCreate(savedInstanceState)
    window.decorView.setBackgroundColor(Color.rgb(16, 25, 29))
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
      (view.layoutParams as? ViewGroup.MarginLayoutParams)?.let { params ->
        if (params.leftMargin != bars.left || params.topMargin != bars.top || params.rightMargin != bars.right || params.bottomMargin != bars.bottom) {
          params.setMargins(bars.left, bars.top, bars.right, bars.bottom)
          view.layoutParams = params
        }
      }
      WindowInsetsCompat.CONSUMED
    }
  }
}
