package fr.azk.rpgmtoolkit

import java.io.InputStream

object RgssFormat {
    const val LIMIT = 16 * 1024 * 1024
    fun scriptPath(ini: ByteArray): Pair<String, String> {
        var game = false
        var found: Pair<String, String>? = null
        ini.toString(Charsets.ISO_8859_1).lineSequence().forEach { line ->
            val s = line.trim().removePrefix("ï»¿")
            if (s.startsWith("[")) game = s.equals("[Game]", true)
            else if (game && s.substringBefore('=').trim().equals("Scripts", true) && s.contains('=')) {
                require(found == null) { "Plusieurs chemins Scripts dans Game.ini." }
                val path = s.substringAfter('=').trim().replace('\\', '/')
                require(path.all { it.code in 32..126 } && !path.startsWith('/') && !path.contains(':') && path.split('/').none { it.isEmpty() || it == "." || it == ".." }) { "Chemin des scripts non pris en charge." }
                val engine = when (path.substringAfterLast('.').lowercase()) { "rxdata" -> "XP"; "rvdata" -> "VX"; "rvdata2" -> "VX Ace"; else -> error("Extension de scripts RGSS inconnue.") }
                found = Pair(path, engine)
            }
        }
        return found ?: error("Chemin Scripts absent de Game.ini.")
    }
    fun target(ini: ByteArray) = "Scripts." + scriptPath(ini).first.substringAfterLast('.')
    fun redirect(ini: ByteArray): ByteArray {
        scriptPath(ini)
        var game = false
        val text = ini.toString(Charsets.ISO_8859_1)
        return Regex("[^\n]*\n|[^\n]+$").findAll(text).joinToString("") { match ->
            val line = match.value
            val s = line.trim().removePrefix("ï»¿")
            if (s.startsWith("[")) game = s.equals("[Game]", true)
            if (game && s.substringBefore('=').trim().equals("Scripts", true) && s.contains('=')) {
                line.substringBefore('=') + "=RPGMToolkit\\" + target(ini) + if (line.endsWith("\r\n")) "\r\n" else if (line.endsWith('\n')) "\n" else ""
            } else line
        }.toByteArray(Charsets.ISO_8859_1)
    }
    private fun read(input: InputStream, n: Int): ByteArray {
        require(n in 0..LIMIT) { "Entrée RGSS trop volumineuse." }
        val data = ByteArray(n); var pos = 0
        while (pos < n) { val count = input.read(data, pos, n - pos); require(count > 0) { "Archive RGSS tronquée." }; pos += count }
        return data
    }
    private fun word(input: InputStream): Int { val b = read(input, 4); return (b[0].toInt() and 255) or ((b[1].toInt() and 255) shl 8) or ((b[2].toInt() and 255) shl 16) or ((b[3].toInt() and 255) shl 24) }
    private fun skip(input: InputStream, count: Long) {
        var left = count; require(left >= 0) { "Position RGSS invalide." }
        val buffer = ByteArray(65536)
        while (left > 0) { val n = input.read(buffer, 0, minOf(left, buffer.size.toLong()).toInt()); require(n > 0) { "Archive RGSS tronquée." }; left -= n }
    }
    private fun decrypt(data: ByteArray, seed: Int): ByteArray {
        var key = seed
        data.indices.forEach { i -> if (i > 0 && i % 4 == 0) key = key * 7 + 3; data[i] = (data[i].toInt() xor (key ushr ((i % 4) * 8))).toByte() }
        return data
    }
    fun extract(input: InputStream, wanted: String): ByteArray {
        val header = read(input, 8)
        require(header.copyOfRange(0, 7).contentEquals(byteArrayOf(82,71,83,83,65,68,0))) { "Archive RGSS non reconnue." }
        fun matches(name: ByteArray) = name.toString(Charsets.UTF_8).replace('\\', '/').equals(wanted, true)
        if (header[7].toInt() == 1) {
            var key = 0xdeadcafe.toInt()
            fun next(): Int { val old = key; key = key * 7 + 3; return old }
            repeat(100000) {
                val size = word(input) xor next(); require(size in 0..4096) { "Nom RGSS invalide." }
                val name = read(input, size); name.indices.forEach { name[it] = (name[it].toInt() xor next()).toByte() }
                val length = (word(input) xor next()).toLong() and 0xffffffffL
                if (matches(name)) { require(length <= LIMIT); return decrypt(read(input, length.toInt()), key) }
                skip(input, length)
            }
        } else if (header[7].toInt() == 3) {
            val key = word(input) * 9 + 3; var position = 12L; var found: Triple<Long, Int, Int>? = null
            for (i in 0 until 100000) {
                val offset = (word(input) xor key).toLong() and 0xffffffffL; position += 4
                if (offset == 0L) break
                val length = (word(input) xor key).toLong() and 0xffffffffL; val fileKey = word(input) xor key; val size = word(input) xor key; position += 12
                require(size in 0..4096) { "Nom RGSS invalide." }
                val name = read(input, size); position += size
                name.indices.forEach { name[it] = (name[it].toInt() xor (key ushr ((it % 4) * 8))).toByte() }
                if (matches(name)) { require(found == null && length <= LIMIT) { "Scripts RGSS invalides ou en double." }; found = Triple(offset, length.toInt(), fileKey) }
            }
            val entry = found ?: error("Scripts absents de l’archive RGSS.")
            skip(input, entry.first - position); return decrypt(read(input, entry.second), entry.third)
        }
        error("Archive RGSS non prise en charge ou scripts absents.")
    }
}
