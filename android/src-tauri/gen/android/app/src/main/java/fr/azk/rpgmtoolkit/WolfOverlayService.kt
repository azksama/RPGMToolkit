package fr.azk.rpgmtoolkit

import android.app.*
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.view.*
import android.webkit.*
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

class WolfOverlayService : Service() {
    companion object {
        @Volatile var running=false
            private set
        private var active: WolfOverlayService?=null
        fun fileResult(uri: Uri?) { active?.let { service -> service.handler.post { service.fileCallback?.onReceiveValue(uri?.let {arrayOf(it)});service.fileCallback=null;service.expand() } } }
    }
    private val handler=Handler(Looper.getMainLooper())
    private val io=Executors.newSingleThreadExecutor()
    private lateinit var windows: WindowManager
    private lateinit var web: WebView
    private lateinit var panel: FrameLayout
    private lateinit var bubble: TextView
    private lateinit var buttonParams: WindowManager.LayoutParams
    private lateinit var webParams: WindowManager.LayoutParams
    private lateinit var storage: WolfStorage
    private lateinit var transport: WolfTransport
    private lateinit var gameFiles: androidx.documentfile.provider.DocumentFile
    private var bootstrap="{}"
    private var ready=false
    private var expanded=false
    private var keyboardVisible=false
    private var showButton=true
    private var positionX=0.0
    private var positionY=0.0
    private var fileCallback: ValueCallback<Array<Uri>>?=null
    override fun onBind(intent: Intent?)=null
    override fun onCreate() {
        super.onCreate();active=this
        val channel=NotificationChannel("wolf-toolkit","WOLF Toolkit",NotificationManager.IMPORTANCE_LOW)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        fun action(name: String, code: Int)=PendingIntent.getService(this,code,Intent(this,WolfOverlayService::class.java).setAction(name),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification=NotificationCompat.Builder(this,"wolf-toolkit").setSmallIcon(android.R.drawable.ic_menu_edit).setContentTitle("WOLF Toolkit").setContentText("Éditeur flottant · Winlator").setOngoing(true).setContentIntent(action("show",1)).addAction(0,"Ouvrir",action("show",1)).addAction(0,"Arrêter",action("stop",2)).build()
        startForeground(190,notification)
        if(!Settings.canDrawOverlays(this) || WolfSession.root==null) { stopSelf();return }
        try { initialize();running=true }catch(e: Exception) { android.widget.Toast.makeText(this,e.message ?: "Menu WOLF indisponible.",android.widget.Toast.LENGTH_LONG).show();stopSelf() }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if(intent?.action=="stop")stopSelf()
        else if(intent?.action=="show" && ready)expand()
        return START_NOT_STICKY
    }
    private fun initialize() {
        val root=WolfSession.root ?: error("Dossier WOLF absent.")
        storage=WolfStorage(this)
        val own=storage.data(root).toolkitChild("RPGMToolkit") ?: error("Installez le mod WOLF avant d’ouvrir le menu.")
        gameFiles=own
        val marker=JSONObject(storage.read(own.toolkitChild("meta.json") ?: error("Mod WOLF incomplet."),1048576).toString(Charsets.UTF_8))
        val catalogText=storage.read(own.toolkitChild("catalog.json") ?: error("Catalogue WOLF absent."),8*1024*1024).toString(Charsets.UTF_8)
        fun hash(value: String)=MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
        require(hash(catalogText)==marker.getString("catalogSha256")) { "Catalogue WOLF modifié." }
        val catalog=JSONArray(catalogText);require(catalog.length() in 1..20000)
        transport=WolfTransport(storage,own,catalog)
        bootstrap=JSONObject().put("project",hash(root.uri.toString())).put("title",root.name).put("catalog",catalog).put("version",marker.getString("version")).toString()
        windows=getSystemService(WindowManager::class.java)
        bubble=TextView(this).apply {
            text="Toolbox";textSize=12f;gravity=Gravity.CENTER;setTextColor(Color.rgb(229,235,244));setPadding(dp(12),0,dp(12),0)
            contentDescription="Ouvrir WOLF Toolkit";background=GradientDrawable().apply {setColor(Color.rgb(39,48,64));cornerRadius=dp(8).toFloat();setStroke(dp(1),Color.rgb(104,133,176))}
        }
        buttonParams=WindowManager.LayoutParams(dp(88),dp(34),WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,android.graphics.PixelFormat.TRANSLUCENT).apply {gravity=Gravity.TOP or Gravity.LEFT;x=dp(8);y=dp(16)}
        windows.addView(bubble,buttonParams)
        var downX=0f;var downY=0f;var initialX=0;var initialY=0;var moved=false
        bubble.setOnTouchListener { _,event ->
            when(event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {downX=event.rawX;downY=event.rawY;initialX=buttonParams.x;initialY=buttonParams.y;moved=false}
                MotionEvent.ACTION_MOVE -> {
                    if(kotlin.math.abs(event.rawX-downX)+kotlin.math.abs(event.rawY-downY)>dp(8))moved=true
                    if(moved) {buttonParams.x=(initialX+event.rawX-downX).toInt().coerceIn(0,maxX());buttonParams.y=(initialY+event.rawY-downY).toInt().coerceIn(0,maxY());windows.updateViewLayout(bubble,buttonParams)}
                }
                MotionEvent.ACTION_UP -> {
                    if(moved) {positionX=100.0*buttonParams.x/maxX().coerceAtLeast(1);positionY=100.0*buttonParams.y/maxY().coerceAtLeast(1);javascript("window.ToolkitHost.position($positionX,$positionY)")}
                    else expand()
                }
            };true
        }
        val assets=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).addPathHandler("/icons/",WebViewAssetLoader.PathHandler { path ->
            if(!Regex("[0-9]{1,4}\\.png").matches(path))null
            else {
                val number=path.substringBefore('.').toInt();val name="icon"+number.toString().padStart(3,'0')+".png"
                val file=storage.data(root).toolkitChild("BasicData")?.toolkitChild(name)
                try { file?.let { WebResourceResponse("image/png",null,ByteArrayInputStream(storage.read(it,2*1024*1024))) } }catch(_: Exception){null}
            }
        }).build()
        web=object: WebView(this) {
            private var dismissKeyboard=false
            override fun onKeyPreIme(keyCode: Int, event: KeyEvent): Boolean {
                if(keyCode==KeyEvent.KEYCODE_BACK) {
                    if(event.action==KeyEvent.ACTION_DOWN && keyboardVisible) { dismissKeyboard=true;return true }
                    if(event.action==KeyEvent.ACTION_UP && dismissKeyboard) {
                        dismissKeyboard=false
                        (getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager).hideSoftInputFromWindow(windowToken,0)
                        return true
                    }
                }
                return super.onKeyPreIme(keyCode,event)
            }
        }.apply {
            setBackgroundColor(Color.rgb(28,31,39));settings.javaScriptEnabled=true;settings.domStorageEnabled=true
            settings.allowFileAccess=false;settings.allowContentAccess=true;settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;settings.setSupportMultipleWindows(false)
            addJavascriptInterface(NativeBridge(),"WolfNative")
            webViewClient=object: WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = assets.shouldInterceptRequest(request.url)
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true
                override fun onPageFinished(view: WebView, url: String) { if(url=="https://appassets.androidplatform.net/assets/wolf/index.html"){ready=true;if(expanded)javascript("window.ToolkitHost.show()")} }
            }
            webChromeClient=object: WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null);fileCallback=callback;minimize()
                    startActivity(Intent(this@WolfOverlayService,WolfFileActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));return true
                }
                override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
            }
            setOnKeyListener { _,key,event -> if(key==KeyEvent.KEYCODE_BACK && event.action==KeyEvent.ACTION_UP){javascript("window.ToolkitHost.back()");true}else false }
        }
        webParams=WindowManager.LayoutParams(1,1,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,android.graphics.PixelFormat.TRANSLUCENT).apply { gravity=Gravity.TOP or Gravity.LEFT }
        panel=FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(28,31,39))
            addView(web,FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT))
        }
        ViewCompat.setOnApplyWindowInsetsListener(panel) { view,insets ->
            keyboardVisible=insets.isVisible(WindowInsetsCompat.Type.ime())
            val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);WindowInsetsCompat.CONSUMED
        }
        windows.addView(panel,webParams)
        web.loadUrl("https://appassets.androidplatform.net/assets/wolf/index.html")
    }
    private fun dp(value: Int)=(value*resources.displayMetrics.density).toInt()
    private fun maxX()=(resources.displayMetrics.widthPixels-dp(88)).coerceAtLeast(0)
    private fun maxY()=(resources.displayMetrics.heightPixels-dp(70)).coerceAtLeast(0)
    private fun javascript(code: String) { if(::web.isInitialized)web.evaluateJavascript(code,null) }
    private fun expand() {
        if(!::web.isInitialized)return
        expanded=true;bubble.visibility=View.GONE
        webParams.width=WindowManager.LayoutParams.MATCH_PARENT;webParams.height=WindowManager.LayoutParams.MATCH_PARENT
        webParams.flags=WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
        webParams.softInputMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;windows.updateViewLayout(panel,webParams);ViewCompat.requestApplyInsets(panel);web.requestFocus()
        if(ready)javascript("window.ToolkitHost.show()")
    }
    private fun minimize() {
        if(!::web.isInitialized)return
        expanded=false
        (getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager).hideSoftInputFromWindow(web.windowToken,0)
        webParams.width=1;webParams.height=1;webParams.flags=WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;windows.updateViewLayout(panel,webParams)
        bubble.visibility=if(showButton)View.VISIBLE else View.GONE
    }
    override fun onConfigurationChanged(configuration: Configuration) { super.onConfigurationChanged(configuration);if(::windows.isInitialized){buttonParams.x=(maxX()*positionX/100).toInt();buttonParams.y=(maxY()*positionY/100).toInt();windows.updateViewLayout(bubble,buttonParams)} }
    override fun onDestroy() {
        running=false;active=null;io.shutdownNow();fileCallback?.onReceiveValue(null);fileCallback=null
        if(::windows.isInitialized) {if(::bubble.isInitialized && bubble.isAttachedToWindow)windows.removeView(bubble);if(::panel.isInitialized && panel.isAttachedToWindow)windows.removeView(panel);if(::web.isInitialized){web.removeJavascriptInterface("WolfNative");web.destroy()}}
        WolfSession.root=null;super.onDestroy()
    }
    inner class NativeBridge {
        @JavascriptInterface fun bootstrap()=bootstrap
        @JavascriptInterface fun saves(): String = try {
            JSONArray(gameFiles.listFiles().filter {it.isFile && it.name?.matches(Regex("toolkit-save-[0-9]{1,6}\\.sav"))==true && it.length()>0}.sortedByDescending {it.lastModified()}.take(100).map {JSONObject().put("name",it.name).put("date",it.lastModified())}).toString()
        }catch(_: Exception){"[]"}
        @JavascriptInterface fun close() {handler.post {minimize()} }
        @JavascriptInterface fun request(id: String, text: String) {
            if(!Regex("[a-zA-Z0-9-]{1,64}").matches(id)||text.length>2*1024*1024)return
            io.execute {
                val answer=try { JSONObject().put("id",id).put("result",transport.exchange(JSONArray(text))) }catch(e: Exception){JSONObject().put("id",id).put("error",e.message ?: "Échange WOLF impossible.")}
                handler.post {javascript("window.ToolkitHost.answer("+answer.toString()+")")}
            }
        }
        @JavascriptInterface fun settings(text: String) {
            if(text.length>4096)return
            val settings=try{JSONObject(text)}catch(_: Exception){return}
            handler.post {
                val requested=settings.optBoolean("showButton",true)
                val notifications=getSystemService(NotificationManager::class.java).areNotificationsEnabled()
                showButton=requested || !notifications
                if(!requested && !notifications)javascript("window.ToolkitHost.error(\"Autorisez les notifications pour masquer Toolbox.\")")
                positionX=settings.optDouble("buttonX",0.0).coerceIn(0.0,100.0);positionY=settings.optDouble("buttonY",0.0).coerceIn(0.0,100.0);buttonParams.x=(maxX()*positionX/100).toInt();buttonParams.y=(maxY()*positionY/100).toInt();windows.updateViewLayout(bubble,buttonParams);bubble.visibility=if(showButton && !expanded)View.VISIBLE else View.GONE
            }
        }
        @JavascriptInterface fun exportJson(name: String, text: String) {
            if(!Regex("[a-zA-Z0-9._-]{1,100}\\.json").matches(name)||text.toByteArray().size>8*1024*1024)return
            io.execute {
                try {
                    JSONObject(text)
                    val directory=File(cacheDir,"rpgm-toolkit").also{it.mkdirs()};val file=File(directory,name);file.writeText(text,Charsets.UTF_8)
                    val uri=FileProvider.getUriForFile(this@WolfOverlayService,packageName+".fileprovider",file)
                    handler.post {minimize();startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),"Exporter").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}
                }catch(e: Exception){handler.post {javascript("window.ToolkitHost.error("+JSONObject.quote(e.message ?: "Export impossible.")+")")}}
            }
        }
    }
}
