package fr.azk.rpgmtoolkit

import android.net.Uri
import android.util.Base64
import androidx.documentfile.provider.DocumentFile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import java.io.File
import app.tauri.plugin.Invoke
import com.fasterxml.jackson.databind.ObjectMapper

@RunWith(AndroidJUnit4::class)
class WolfStorageInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val storage = WolfStorage(context)

    private fun materialize(result: app.tauri.plugin.JSObject): app.tauri.plugin.JSObject {
        val args = ApplyArgs().apply { registryPath=result.getString("registryPath") }
        RegistryTransfer.load(args,File(context.cacheDir,"rpgm-toolkit"))
        result.remove("registryPath")
        return result.put("registry",args.registry)
    }
    private fun inspect(root: DocumentFile) = materialize(storage.inspect(root))

    @Test fun compactTransportPreservesLargeFieldTypesAndRejectsInvalidWrites() = inGame(3) { root, _ ->
        val own=storage.directory(storage.data(root),"RPGMToolkit")
        val transport=WolfTransport(storage,own,BooleanArray(200_032) { it%2==1 })
        fun operation(index: Int,action: Int,value: Any) = JSONObject().put("index",index).put("action",action).put("value",value)
        for(op in listOf(operation(-2,1,42),operation(200_032,1,42),operation(200_031,1,42),operation(200_030,2,"text"))) {
            try { transport.exchange(org.json.JSONArray().put(op));fail("Invalid field or type must be refused") }
            catch(_: IllegalArgumentException) {}
        }
        assertNull(own.toolkitChild("request.txt"))
        assertNull(own.toolkitChild("commands.txt"))
        val executor=java.util.concurrent.Executors.newSingleThreadExecutor()
        try {
            val reply=executor.submit {
                val end=android.os.SystemClock.elapsedRealtime()+10_000
                var request: DocumentFile?=null
                while(request==null && android.os.SystemClock.elapsedRealtime()<end) {request=own.toolkitChild("request.txt")?.takeIf { it.length()>0 };Thread.sleep(40)}
                val id=storage.read(request ?: error("No request received")).toString(Charsets.UTF_8).trim().toInt()
                val rows=org.json.JSONArray().put(JSONObject().put("index",200_030).put("value",42).put("error",0).put("frozen",0))
                    .put(JSONObject().put("index",200_031).put("value",0).put("string",true).put("error",0).put("frozen",0))
                storage.write(own,"output-1.txt","日本語\ntext".toByteArray(Charsets.UTF_8))
                storage.write(own,"reply.txt",JSONObject().put("request",id).put("results",rows).toString().toByteArray(Charsets.UTF_8))
                storage.write(own,"ack.txt",id.toString().toByteArray(Charsets.US_ASCII))
            }
            val result=transport.exchange(org.json.JSONArray().put(operation(200_030,1,42)).put(operation(200_031,2,"日本語\ntext")))
            reply.get(12,java.util.concurrent.TimeUnit.SECONDS)
            assertTrue(result.getBoolean("mutating"))
            assertEquals(42,result.getJSONArray("results").getJSONObject(0).getInt("value"))
            assertEquals("日本語\ntext",result.getJSONArray("results").getJSONObject(1).getString("value"))
            assertEquals("日本語\ntext",storage.read(own.toolkitChild("input-1.txt")!!).toString(Charsets.UTF_8))
        } finally {executor.shutdownNow()}
    }

    private fun fixture(version: Int, installed: Boolean) = JSONObject(instrumentation.context.assets.open("wolf-$version-${if (installed) "installed" else "original"}.json").bufferedReader().use { it.readText() })

    private fun inGame(version: Int, original: JSONObject = fixture(version, false), test: (DocumentFile, JSONObject) -> Unit) {
        val uri = Uri.parse(InstrumentationRegistry.getArguments().getString("root") ?: error("A writable SAF tree grant is required."))
        val parent = DocumentFile.fromTreeUri(context, uri) ?: error("SAF tree unavailable.")
        val name = "wolf-test-${UUID.randomUUID()}"
        val root = storage.directory(parent, name)
        try {
            val basic = storage.directory(storage.directory(root, "Data"), "BasicData")
            for ((key, file) in mapOf("common" to "CommonEvent.dat", "system" to "SysDatabase.dat", "mutable" to "CDataBase.dat", "game" to "Game.dat")) {
                storage.write(basic, file, Base64.decode(original.getString(key), Base64.NO_WRAP))
            }
            DocumentQueries.scoped(context) { test(DocumentQueries.wrap(context, root), original) }
        } finally {
            assertEquals(name, root.name)
            assertTrue(root.delete())
        }
    }

    @Test fun safInstallUpdateUninstallPreservesOriginalsAndSaves() {
        for (version in listOf(2, 3)) inGame(version) { root, original ->
            assertEquals(WolfStorage.fingerprint(original), WolfStorage.fingerprint(JSONObject(inspect(root).getString("registry"))))
            val installed = fixture(version, true)
            fun apply(bundle: JSONObject, uninstall: Boolean) {
                val before = JSONObject(inspect(root).getString("registry"))
                val args = ApplyArgs().apply { registry = bundle.toString(); expected = WolfStorage.fingerprint(before); this.uninstall = uninstall }
                val result = materialize(storage.apply(root, args))
                assertEquals(WolfStorage.fingerprint(bundle), WolfStorage.fingerprint(JSONObject(result.getString("registry"))))
                assertNull(root.toolkitChild(WolfStorage.PENDING))
            }
            storage.write(root, "Save01.sav", "player-save".toByteArray())
            apply(installed, false)
            val own = storage.data(root).toolkitChild("RPGMToolkit")!!
            storage.write(own, "toolkit-save-42.sav", "toolkit-save".toByteArray())
            apply(installed, false)
            apply(original, true)
            assertArrayEquals("player-save".toByteArray(), storage.read(root.toolkitChild("Save01.sav")!!))
            assertArrayEquals("toolkit-save".toByteArray(), storage.read(storage.data(root).toolkitChild("RPGMToolkit")!!.toolkitChild("toolkit-save-42.sav")!!))
            assertTrue(root.toolkitChild(".rpgm-toolkit-backups")!!.listFiles().size >= 3)
        }
    }

    @Test fun safInterruptedInstallRestoresAndChangedGameIsRefused() = inGame(3) { root, original ->
        val id = "recovery-wolf-test"
        val backup = storage.directory(storage.directory(root, ".rpgm-toolkit-backups"), id)
        storage.write(backup, "state.json", original.toString().toByteArray())
        val journal = JSONObject().put("backup", id).put("fingerprint", WolfStorage.fingerprint(original))
        storage.write(root, WolfStorage.PENDING, journal.toString().toByteArray())
        storage.write(storage.data(root).toolkitChild("BasicData")!!, "CommonEvent.dat", byteArrayOf(1, 2, 3))
        assertTrue(inspect(root).getBoolean("recoveryNeeded"))
        storage.restore(root)
        assertNull(root.toolkitChild(WolfStorage.PENDING))
        assertEquals(WolfStorage.fingerprint(original), WolfStorage.fingerprint(JSONObject(inspect(root).getString("registry"))))
        val args = ApplyArgs().apply { registry = fixture(3, true).toString(); expected = WolfStorage.fingerprint(original) }
        storage.write(storage.data(root).toolkitChild("BasicData")!!, "CommonEvent.dat", byteArrayOf(4, 5, 6))
        try { storage.apply(root, args); fail("Changed game must be refused.") } catch (expected: IllegalArgumentException) { assertTrue(expected.message!!.contains("changé")) }
        assertArrayEquals(byteArrayOf(4, 5, 6), storage.read(storage.data(root).toolkitChild("BasicData")!!.toolkitChild("CommonEvent.dat")!!))
    }

    @Test fun safLargeCatalogueInstallUpdateAndRestore() {
        val uri = Uri.parse(InstrumentationRegistry.getArguments().getString("root") ?: error("A writable SAF tree grant is required."))
        val parent = DocumentFile.fromTreeUri(context, uri) ?: error("SAF tree unavailable.")
        val fixtures = parent.toolkitChild("fixtures-191")
        org.junit.Assume.assumeNotNull(fixtures)
        fun large(name: String) = JSONObject(storage.read(fixtures!!.toolkitChild(name) ?: error("Large fixture missing."),WolfStorage.CATALOG_LIMIT).toString(Charsets.UTF_8))
        val original = large("wolf-3-original.json")
        val installed = large("wolf-3-installed.json")
        val catalog = installed.getString("catalog")
        assertTrue(catalog.toByteArray(Charsets.UTF_8).size > 8 * 1024 * 1024)
        assertEquals(100_032,org.json.JSONArray(catalog).length())
        inGame(3,original) { root, before ->
            fun apply(bundle: JSONObject, uninstall: Boolean) {
                val current = JSONObject(inspect(root).getString("registry"))
                val args = ApplyArgs().apply { registry = bundle.toString(); expected = WolfStorage.fingerprint(current); this.uninstall = uninstall }
                val result = materialize(storage.apply(root,args))
                assertEquals(WolfStorage.fingerprint(bundle),WolfStorage.fingerprint(JSONObject(result.getString("registry"))))
                assertNull(root.toolkitChild(WolfStorage.PENDING))
            }
            apply(installed,false)
            apply(installed,false)
            val pending = root.toolkitChild(".rpgm-toolkit-backups")!!.listFiles().first { it.toolkitChild("state.json")?.let { file -> JSONObject(storage.read(file).toString(Charsets.UTF_8)).optString("catalog")==catalog }==true }
            val journal = JSONObject(storage.read(pending.toolkitChild("manifest.json")!!).toString(Charsets.UTF_8))
            storage.write(root,WolfStorage.PENDING,journal.toString().toByteArray())
            storage.write(storage.data(root).toolkitChild("RPGMToolkit")!!,"catalog.json","[]".toByteArray())
            storage.restore(root)
            assertEquals(catalog,JSONObject(inspect(root).getString("registry")).getString("catalog"))
            apply(before,true)
        }
    }

    @Test fun largeRegistryUsesBoundedInvokeArgsAndSafRoundTrips() {
        val uri = Uri.parse(InstrumentationRegistry.getArguments().getString("root") ?: error("A writable SAF tree grant is required."))
        val parent = DocumentFile.fromTreeUri(context, uri) ?: error("SAF tree unavailable.")
        val fixtures = parent.toolkitChild("fixtures-192") ?: error("Large IPC fixtures missing.")
        val cache = File(context.cacheDir,"rpgm-toolkit").also { it.mkdirs() }
        fun fixture(version: Int, installed: Boolean) = fixtures.toolkitChild("wolf-$version-${if(installed) "installed" else "original"}.json") ?: error("Fixture missing.")
        fun parse(payload: String): ApplyArgs = Invoke(1,"applyFolder",1,2,{ _, _ -> },payload,ObjectMapper()).parseArgs(ApplyArgs::class.java)
        fun checkInlineLimit() {
            try {
                parse(JSONObject().put("registry","a".repeat(20_054_016)).toString())
                fail("Baseline inline registry must reproduce Jackson's string limit")
            } catch (expected: com.fasterxml.jackson.databind.JsonMappingException) {
                assertTrue(expected.message!!.contains("maximum length"))
            }
        }
        fun fingerprint(file: DocumentFile): String {
            val content = JSONObject(storage.read(file,WolfStorage.CATALOG_LIMIT).toString(Charsets.UTF_8))
            if(!content.isNull("catalog")) assertEquals(200_032,org.json.JSONArray(content.getString("catalog")).length())
            return WolfStorage.fingerprint(content)
        }
        fun currentFingerprint(root: DocumentFile) = WolfStorage.fingerprint(JSONObject(inspect(root).getString("registry")))
        checkInlineLimit()
        for (version in listOf(2,3)) {
            val original = JSONObject(storage.read(fixture(version,false),WolfStorage.CATALOG_LIMIT).toString(Charsets.UTF_8))
            val installed = fixture(version,true)
            assertTrue(installed.length() > 20_000_000)
            val installedFingerprint = fingerprint(installed)
            inGame(version,original) { root, _ ->
                storage.write(root,"Save01.sav","unchanged-save".toByteArray())
                fun apply(source: DocumentFile, expected: String, uninstall: Boolean) {
                    val before = currentFingerprint(root)
                    val file = File(cache,"registry-${UUID.randomUUID()}.json")
                    context.contentResolver.openInputStream(source.uri)!!.use { input -> file.outputStream().use { input.copyTo(it,65536) } }
                    try {
                        val payload = JSONObject().put("registryPath",file.name).put("expected",before).put("uninstall",uninstall).toString()
                        assertTrue(payload.length < 256)
                        val args = parse(payload)
                        RegistryTransfer.load(args,cache)
                        assertTrue(args.registry.isNotEmpty())
                        assertFalse(file.exists())
                        val result = materialize(storage.apply(root,args))
                        assertEquals(expected,WolfStorage.fingerprint(JSONObject(result.getString("registry"))))
                        assertNull(root.toolkitChild(WolfStorage.PENDING))
                    } finally { file.delete() }
                }
                apply(installed,installedFingerprint,false)
                apply(installed,installedFingerprint,false)
                apply(fixture(version,false),WolfStorage.fingerprint(original),true)
                assertArrayEquals("unchanged-save".toByteArray(),storage.read(root.toolkitChild("Save01.sav")!!))
            }
        }
    }

    @Test fun registryTransferRejectsSymlinksWithoutDeletingTheirTarget() {
        val cache = File(context.cacheDir,"rpgm-toolkit").also { it.mkdirs() }
        val target = File(context.filesDir,"registry-target-${UUID.randomUUID()}.json").apply { writeText("preserved") }
        val link = File(cache,"registry-${UUID.randomUUID()}.json")
        try {
            java.nio.file.Files.createSymbolicLink(link.toPath(),target.toPath())
            try { RegistryTransfer.load(ApplyArgs().apply { registryPath=link.name },cache); fail("Symlink must be rejected") }
            catch (_: IllegalArgumentException) { }
            assertEquals("preserved",target.readText())
        } finally { link.delete(); target.delete() }
    }

    @Test fun streamedRegistryPreservesAndroidJsonSerialization() {
        val registry = JSONObject().put("text","a".repeat(16383)+"🧭/\"\\\n\t日本語").put("null",JSONObject.NULL).put("base64","/a+b==")
        val output=java.io.ByteArrayOutputStream()
        val digest=RegistryTransfer.write(registry,output)
        val expected=registry.toString().toByteArray(Charsets.UTF_8)
        assertArrayEquals(expected,output.toByteArray())
        assertEquals(java.security.MessageDigest.getInstance("SHA-256").digest(expected).joinToString("") { "%02x".format(it) },digest)
        val cache=File(context.cacheDir,"rpgm-toolkit")
        val result=RegistryTransfer.attach(app.tauri.plugin.JSObject().put("engine","RGSS"),registry,cache)
        assertTrue(result.toString().length < 256)
        assertEquals(registry.toString(),materialize(result).getString("registry"))
    }
}
