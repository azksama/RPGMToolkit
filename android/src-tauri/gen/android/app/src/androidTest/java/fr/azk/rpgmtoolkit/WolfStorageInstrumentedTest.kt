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

@RunWith(AndroidJUnit4::class)
class WolfStorageInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val storage = WolfStorage(context)

    private fun fixture(version: Int, installed: Boolean) = JSONObject(instrumentation.context.assets.open("wolf-$version-${if (installed) "installed" else "original"}.json").bufferedReader().use { it.readText() })

    private fun inGame(version: Int, test: (DocumentFile, JSONObject) -> Unit) {
        val uri = Uri.parse(InstrumentationRegistry.getArguments().getString("root") ?: error("A writable SAF tree grant is required."))
        val parent = DocumentFile.fromTreeUri(context, uri) ?: error("SAF tree unavailable.")
        val name = "wolf-test-${UUID.randomUUID()}"
        val root = storage.directory(parent, name)
        try {
            val original = fixture(version, false)
            val basic = storage.directory(storage.directory(root, "Data"), "BasicData")
            for ((key, file) in mapOf("common" to "CommonEvent.dat", "system" to "SysDatabase.dat", "mutable" to "CDataBase.dat", "game" to "Game.dat")) {
                storage.write(basic, file, Base64.decode(original.getString(key), Base64.NO_WRAP))
            }
            test(root, original)
        } finally {
            assertEquals(name, root.name)
            assertTrue(root.delete())
        }
    }

    @Test fun safInstallUpdateUninstallPreservesOriginalsAndSaves() {
        for (version in listOf(2, 3)) inGame(version) { root, original ->
            assertEquals(WolfStorage.fingerprint(original), WolfStorage.fingerprint(JSONObject(storage.inspect(root).getString("registry"))))
            val installed = fixture(version, true)
            fun apply(bundle: JSONObject, uninstall: Boolean) {
                val before = JSONObject(storage.inspect(root).getString("registry"))
                val args = ApplyArgs().apply { registry = bundle.toString(); expected = WolfStorage.fingerprint(before); this.uninstall = uninstall }
                val result = storage.apply(root, args)
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
        assertTrue(storage.inspect(root).getBoolean("recoveryNeeded"))
        storage.restore(root)
        assertNull(root.toolkitChild(WolfStorage.PENDING))
        assertEquals(WolfStorage.fingerprint(original), WolfStorage.fingerprint(JSONObject(storage.inspect(root).getString("registry"))))
        val args = ApplyArgs().apply { registry = fixture(3, true).toString(); expected = WolfStorage.fingerprint(original) }
        storage.write(storage.data(root).toolkitChild("BasicData")!!, "CommonEvent.dat", byteArrayOf(4, 5, 6))
        try { storage.apply(root, args); fail("Changed game must be refused.") } catch (expected: IllegalArgumentException) { assertTrue(expected.message!!.contains("changé")) }
        assertArrayEquals(byteArrayOf(4, 5, 6), storage.read(storage.data(root).toolkitChild("BasicData")!!.toolkitChild("CommonEvent.dat")!!))
    }
}
