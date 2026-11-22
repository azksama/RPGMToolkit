package fr.azk.rpgmtoolkit

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class EquipmentWebViewTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    @SuppressLint("SetJavaScriptEnabled")
    @Test fun packagedToolkitEquipsAndReturnsAnItem() {
        val context = instrumentation.targetContext
        val fixture = instrumentation.context.assets.open("fixture.js").bufferedReader().use { it.readText() }
        val module = context.assets.open("wolf/toolkit.js").bufferedReader().use { it.readText() }
        val intent = Intent(context, Activity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val activity = instrumentation.startActivitySync(intent)
        val ready = CountDownLatch(1)
        lateinit var view: WebView
        instrumentation.runOnMainSync {
            view = WebView(activity).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String) { ready.countDown() }
                }
            }
            activity.addContentView(view, ViewGroup.LayoutParams(-1, -1))
            view.loadDataWithBaseURL("https://fixture.invalid/", "<html><body><span id='ticks'></span></body></html>", "text/html", "UTF-8", null)
        }
        try {
            assertTrue("WebView did not load the fixture", ready.await(45, TimeUnit.SECONDS))
            fun run(script: String): String {
                val done = CountDownLatch(1)
                var result = ""
                instrumentation.runOnMainSync { view.evaluateJavascript(script) { result = it; done.countDown() } }
                assertTrue("WebView did not finish evaluating the script", done.await(20, TimeUnit.SECONDS))
                return result
            }
            run(fixture)
            run(module)
            run("SceneManager.updateScene(); RPGMToolkit.open();")
            run("document.querySelector('[data-action=tool-equipment]').click()")
            assertEquals("true", run("!!document.querySelector('#rt-gear-slot')"))
            run("document.querySelector('[data-action=gear-create]').click()")
            val balance = "[\$gameActors.actor(1).equips()[0]?.id || 0, \$gameParty.numItems(\$dataWeapons[2])]"
            assertEquals("[2,0]", run(balance))
            run("document.querySelector('[data-action=gear-remove]').click()")
            assertEquals("[0,1]", run(balance))
            run("document.querySelector('[data-action=modal-dismiss]').click()")
            assertEquals("true", run("RPGMToolkit.isOpen()"))
        } finally {
            instrumentation.runOnMainSync {
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
                activity.finish()
            }
        }
    }
}
