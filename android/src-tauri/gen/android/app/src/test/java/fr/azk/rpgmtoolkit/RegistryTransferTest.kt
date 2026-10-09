package fr.azk.rpgmtoolkit

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.RandomAccessFile
import java.nio.file.Files

class RegistryTransferTest {
    private fun inCache(test: (File) -> Unit) {
        val directory = Files.createTempDirectory("registry-test").toFile()
        try { test(directory) } finally { directory.deleteRecursively() }
    }

    @Test fun inlineAndUtf8FileTransfersPreserveRegistry() = inCache { cache ->
        val inline = ApplyArgs().apply { registry = "var \$plugins = [];" }
        RegistryTransfer.load(inline, cache)
        assertEquals("var \$plugins = [];", inline.registry)
        val file = File(cache, "registry-unicode.json")
        val content = "日本語 \"text\" \\n"
        file.writeText(content)
        val args = ApplyArgs().apply { registryPath = file.name }
        RegistryTransfer.load(args, cache)
        assertEquals(content, args.registry)
        assertEquals("", args.registryPath)
        assertFalse(file.exists())
    }

    @Test fun rejectsTraversalAndAmbiguousTransfers() = inCache { cache ->
        val file = File(cache, "registry-external.json").apply { writeText("sentinel") }
        for (path in listOf("../${file.name}", file.absolutePath, "result-test.zip")) {
            try { RegistryTransfer.load(ApplyArgs().apply { registryPath = path }, cache); fail(path) }
            catch (_: IllegalArgumentException) { }
        }
        try {
            RegistryTransfer.load(ApplyArgs().apply { registryPath = file.name; registry = "inline" }, cache)
            fail("Ambiguous transfer must be rejected")
        } catch (_: IllegalArgumentException) { }
        assertEquals("sentinel", file.readText())
    }

    @Test fun oversizedAndMalformedFilesAreRemovedBeforeApplying() = inCache { cache ->
        val oversized = File(cache, "registry-oversized.json")
        RandomAccessFile(oversized, "rw").use { it.setLength(RegistryTransfer.LIMIT + 1) }
        try { RegistryTransfer.load(ApplyArgs().apply { registryPath = oversized.name }, cache); fail("Oversized transfer") }
        catch (_: IllegalArgumentException) { }
        assertFalse(oversized.exists())
        val malformed = File(cache, "registry-invalid.json").apply { writeBytes(byteArrayOf(0xc3.toByte(), 0x28)) }
        try { RegistryTransfer.load(ApplyArgs().apply { registryPath = malformed.name }, cache); fail("Invalid UTF-8") }
        catch (_: java.nio.charset.CharacterCodingException) { }
        assertFalse(malformed.exists())
    }
}
