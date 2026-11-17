package fr.azk.rpgmtoolkit

import android.net.Uri
import android.os.SystemClock
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.tauri.plugin.JSObject
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.URL
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class InstallerInstrumentedTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    private fun manifest(version: String = "1.10.0") = JSONObject().put("draft", false).put("prerelease", false).put("tag_name", "v$version")
        .put("assets", org.json.JSONArray().put(JSONObject().put("name", "RPGMToolkit-$version.apk").put("size", 8000)
            .put("browser_download_url", "https://github.com/azksama/RPGMToolkit/releases/download/v$version/RPGMToolkit-$version.apk").put("digest", "sha256:" + "a".repeat(64))))

    private fun fails(action: () -> Unit) { try { action(); fail("Expected rejection") } catch (_: IllegalArgumentException) {} catch (_: IllegalStateException) {} }

    @Test fun updateManifestRejectsUntrustedAssetsAndNonStableVersions() {
        val release = UpdateRelease.parse(manifest())
        assertEquals(1_010_000L, release.code)
        assertTrue(release.code > UpdateRelease.versionCode("1.9.99"))
        for (version in listOf("../1.10.0", "1.10.0-beta", "1.1000.0", "01.2.3")) fails { UpdateRelease.versionCode(version) }
        fails { UpdateRelease.parse(manifest().put("prerelease", true)) }
        fails { UpdateRelease.parse(manifest().put("draft", true)) }
        for ((key, value) in listOf("size" to (UpdateRelease.MAX_APK + 1), "digest" to "sha256:invalid", "browser_download_url" to "https://github.com/other/app/file.apk")) {
            val json = manifest(); json.getJSONArray("assets").getJSONObject(0).put(key, value)
            fails { UpdateRelease.parse(json) }
        }
        for (address in listOf("http://github.com/file", "https://github.com.evil.test/file", "https://user@github.com/file", "https://github.com:444/file")) assertFalse(AppUpdater.allowed(URL(address)))
        assertTrue(AppUpdater.allowed(URL("https://release-assets.githubusercontent.com/file")))
    }

    @Test fun alteredApkIsNeverAccepted() {
        val file = File(context.cacheDir, "update-test-${UUID.randomUUID()}.apk")
        try { file.writeBytes(ByteArray(8000)); fails { AppUpdater.validate(context, file, UpdateRelease.parse(manifest())) } }
        finally { file.delete() }
    }

    @Test fun largePluginRegistryTransferIsLossless() {
        val cache = File(context.cacheDir, "registry-test-${UUID.randomUUID()}")
        val text = "var \$plugins = [{name:'Other',parameters:{text:'" + "日本語".repeat(2_000_000) + "'}}];"
        try {
            val result = RegistryTransfer.attachText(JSObject(), text, cache)
            assertFalse(result.has("registry"))
            val name = result.getString("registryPath")
            val args = ApplyArgs().apply { registryPath = name }
            RegistryTransfer.load(args, cache)
            assertEquals(text, args.registry)
            assertFalse(File(cache, name).exists())
        } finally { cache.deleteRecursively() }
    }

    private fun inFolder(test: (DocumentFile) -> Unit) {
        val uri = Uri.parse(InstrumentationRegistry.getArguments().getString("root") ?: error("A writable SAF tree is required."))
        val parent = DocumentFile.fromTreeUri(context, uri)!!
        val folder = parent.createDirectory("installer-test-${UUID.randomUUID()}")!!
        try { test(folder) } finally { folder.delete() }
    }

    @Test fun indexedLookupsReduceQueriesAndInvalidateAfterChanges() = inFolder { original ->
        repeat(60) { original.createFile("text/plain", "entry-$it.txt")!! }
        val baselineStart = SystemClock.elapsedRealtime()
        repeat(8) { assertNotNull(original.toolkitChild("entry-${it * 5}.txt")) }
        val baselineMs = SystemClock.elapsedRealtime() - baselineStart
        val root = DocumentQueries.wrap(context, original)
        var queries = 0
        var lookupMs = 0L
        val start = SystemClock.elapsedRealtime()
        DocumentQueries.scoped(context, { queries = it.queries }) {
            repeat(8) { assertNotNull(root.toolkitChild("entry-${it * 5}.txt")) }
            lookupMs = SystemClock.elapsedRealtime() - start
            assertEquals(1, DocumentQueries.index(context).metrics.queries)
            assertNull(root.toolkitChild("created.txt"))
            val added = root.createFile("text/plain", "created.txt")!!
            assertNotNull(root.toolkitChild("created.txt"))
            assertTrue(added.renameTo("renamed.txt"))
            assertNull(root.toolkitChild("created.txt")); assertNotNull(root.toolkitChild("renamed.txt"))
            assertTrue(added.delete()); assertNull(root.toolkitChild("renamed.txt"))
            original.createFile("text/plain", "external.txt")!!
            DocumentQueries.refresh()
            assertNotNull(root.toolkitChild("external.txt"))
        }
        val indexedMs = SystemClock.elapsedRealtime() - start
        assertTrue("Expected one enumeration per mutation, got $queries", queries <= 8)
        Log.i("ToolkitBenchmark", "baseline_lookup_ms=$baselineMs indexed_lookup_ms=$lookupMs indexed_with_mutations_ms=$indexedMs queries=$queries baseline_min_queries=${8*61}")
        assertNotNull(root.toolkitChild("external.txt"))
    }

    @Test fun completeRuntimeWithoutIndexAndLargeRegistryCanBeInspected() = inFolder { original ->
        val js = original.createDirectory("js")!!
        val data = original.createDirectory("data")!!
        fun write(parent: DocumentFile, name: String, value: String) {
            val file = parent.createFile("application/octet-stream", name)!!
            context.contentResolver.openOutputStream(file.uri, "wt")!!.use { it.write(value.toByteArray()) }
        }
        for (name in listOf("rpg_core.js", "rpg_managers.js", "rpg_objects.js", "rpg_scenes.js", "rpg_sprites.js", "rpg_windows.js", "main.js")) write(js, name, "Utils.RPGMAKER_VERSION = '1.5.2';")
        val registry = "var \$plugins = [{name:'Other',parameters:{text:'" + "a".repeat(5 * 1024 * 1024) + "'}}];"
        write(js, "plugins.js", registry); write(data, "System.json", "{\"gameTitle\":\"No index game\"}")
        run {
            var plugin: StoragePlugin? = null
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                plugin = StoragePlugin(object : android.app.Activity() { init { attachBaseContext(context) } })
            }
            val inspect = StoragePlugin::class.java.getDeclaredMethod("inspect", DocumentFile::class.java).apply { isAccessible = true }
            DocumentQueries.scoped(context) {
                val result = inspect.invoke(plugin, DocumentQueries.wrap(context, original)) as JSObject
                assertEquals("MV", result.getString("engine")); assertEquals("No index game", result.getString("title"))
                val args = ApplyArgs().apply { registryPath = result.getString("registryPath") }
                RegistryTransfer.load(args, File(context.cacheDir, "rpgm-toolkit"))
                assertEquals(registry, args.registry)
            }
        }
        assertNull(original.toolkitChild("index.html"))
    }
}
