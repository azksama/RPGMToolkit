package fr.azk.rpgmtoolkit

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream

class RgssFormatTest {
    @Test fun detectsAndRedirectsAllEnginesWithoutChangingOtherBytes() {
        for ((ext, engine) in listOf("rxdata" to "XP", "rvdata" to "VX", "rvdata2" to "VX Ace")) {
            val ini = "[Game]\r\nLibrary=RGSS.dll\r\nScripts=Data\\Scripts.$ext\r\nTitle=Test\r\n".toByteArray()
            assertEquals(engine, RgssFormat.scriptPath(ini).second)
            assertArrayEquals(ini.toString(Charsets.UTF_8).replace("Data\\Scripts", "RPGMToolkit\\Scripts").toByteArray(), RgssFormat.redirect(ini))
        }
    }
    @Test fun refusesUnsafeOrAmbiguousScriptPaths() {
        for (path in listOf("../Scripts.rxdata", "C:\\Scripts.rxdata", "/Data/Scripts.rxdata", "Data/../Scripts.rxdata")) {
            try { RgssFormat.scriptPath("[Game]\nScripts=$path".toByteArray()); fail(path) } catch (_: IllegalArgumentException) { }
        }
        try { RgssFormat.scriptPath("[Game]\nScripts=Data/Scripts.rxdata\nScripts=Other.rxdata".toByteArray()); fail() } catch (_: IllegalArgumentException) { }
    }
    @Test fun extractsBothArchiveVersionsAndRefusesTruncation() {
        val name = "Data/Scripts.rvdata2".toByteArray(); val source = "script payload".toByteArray()
        fun word(out: ByteArrayOutputStream, n: Int) { for (i in 0..3) out.write(n ushr (i * 8)) }
        fun encrypt(out: ByteArrayOutputStream, seed: Int) { var key = seed; source.indices.forEach { i -> if (i > 0 && i % 4 == 0) key = key * 7 + 3; out.write(source[i].toInt() xor (key ushr ((i % 4) * 8))) } }
        val first = ByteArrayOutputStream(); first.write(byteArrayOf(82,71,83,83,65,68,0,1)); var key = 0xdeadcafe.toInt()
        fun next(): Int { val old = key; key = key * 7 + 3; return old }
        word(first, name.size xor next()); name.forEach { first.write(it.toInt() xor next()) }; word(first, source.size xor next()); encrypt(first, key)
        val third = ByteArrayOutputStream(); third.write(byteArrayOf(82,71,83,83,65,68,0,3)); word(third, 123); val fixed = 123 * 9 + 3
        listOf(12 + 16 + name.size + 4, source.size, 42, name.size).forEach { word(third, it xor fixed) }
        name.indices.forEach { third.write(name[it].toInt() xor (fixed ushr ((it % 4) * 8))) }; word(third, fixed); encrypt(third, 42)
        for (archive in listOf(first.toByteArray(), third.toByteArray())) {
            assertArrayEquals(source, RgssFormat.extract(archive.inputStream(), name.toString(Charsets.UTF_8)))
            try { RgssFormat.extract(archive.copyOf(archive.size - 1).inputStream(), name.toString(Charsets.UTF_8)); fail() } catch (_: IllegalArgumentException) { }
        }
    }
}
