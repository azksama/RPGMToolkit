package fr.azk.rpgmtoolkit

import java.io.File
import java.io.DataInputStream
import java.io.OutputStream
import java.io.OutputStreamWriter
import java.io.BufferedWriter
import java.io.Writer
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.file.Files
import java.nio.file.LinkOption
import java.security.DigestOutputStream
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONObject
import app.tauri.plugin.JSObject

internal object RegistryTransfer {
    const val LIMIT = 256L * 1024 * 1024

    fun load(args: ApplyArgs, cache: File) {
        if (args.registryPath.isEmpty()) return
        require(args.registry.isEmpty()) { "Transfert du registre ambigu." }
        val name = args.registryPath
        require(Regex("registry-[A-Za-z0-9_-]+\\.json").matches(name)) { "Transfert du registre non reconnu." }
        val file = File(cache, name)
        require(file.canonicalFile.parentFile == cache.canonicalFile &&
            Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS)) { "Transfert du registre inaccessible." }
        try {
            val length = file.length()
            require(length in 1..LIMIT) { "Le registre dépasse 256 Mio." }
            val content = ByteArray(length.toInt())
            DataInputStream(file.inputStream()).use { stream ->
                stream.readFully(content)
                require(stream.read() == -1) { "Le transfert du registre a changé." }
            }
            args.registry = Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(content)).toString()
            args.registryPath = ""
        } finally {
            file.delete()
        }
    }

    fun attach(result: JSObject, registry: JSONObject, cache: File): JSObject {
        require(cache.isDirectory || cache.mkdirs()) { "Cache indisponible." }
        val file = File(cache,"registry-${UUID.randomUUID()}.json")
        require(file.createNewFile()) { "Création du transfert impossible." }
        try {
            file.outputStream().use { write(registry,it) }
            return result.put("registryPath",file.name)
        } catch (error: Exception) { file.delete(); throw error }
    }

    fun write(registry: JSONObject, output: OutputStream, limit: Long = LIMIT): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bounded = object: OutputStream() {
            var total = 0L
            override fun write(value: Int) { require(++total <= limit); output.write(value) }
            override fun write(bytes: ByteArray, offset: Int, count: Int) {
                total += count
                require(total <= limit) { "Le registre dépasse la taille autorisée." }
                output.write(bytes,offset,count)
            }
            override fun flush() { output.flush() }
        }
        val writer = BufferedWriter(OutputStreamWriter(DigestOutputStream(bounded,digest),Charsets.UTF_8))
        writer.write("{")
        var comma = false
        for (key in registry.keys()) {
            if (comma) writer.write(",")
            comma = true
            quoted(writer,key)
            writer.write(":")
            if (registry.isNull(key)) writer.write("null")
            else quoted(writer,registry.getString(key))
        }
        writer.write("}")
        writer.flush()
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun quoted(writer: Writer, text: String) {
        writer.write("\"")
        var start = 0
        while (start < text.length) {
            val end = minOf(start+16*1024,text.length)
            val escaped = JSONObject.quote(text.substring(start,end))
            writer.write(escaped,1,escaped.length-2)
            start = end
        }
        writer.write("\"")
    }
}
