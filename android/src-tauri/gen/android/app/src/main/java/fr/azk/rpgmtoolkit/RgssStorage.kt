package fr.azk.rpgmtoolkit

import android.app.Activity
import android.util.Base64
import androidx.documentfile.provider.DocumentFile
import app.tauri.plugin.JSObject
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

class RgssStorage(private val activity: Activity) {
    companion object { const val MARKER = ".rpgm-toolkit-rgss-pending.json" }
    private val limit = RgssFormat.LIMIT * 4
    private fun hash(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
    private fun encode(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)
    private fun decode(s: String): ByteArray { require(s.length <= limit); return Base64.decode(s, Base64.NO_WRAP) }
    private fun read(file: DocumentFile): ByteArray {
        require(file.isFile && file.length() <= limit) { "Fichier RGSS inaccessible ou trop volumineux." }
        return activity.contentResolver.openInputStream(file.uri)?.use { stream ->
            val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(65536)
            while (true) { val n = stream.read(buffer); if (n < 0) break; require(output.size() + n <= limit); output.write(buffer, 0, n) }; output.toByteArray()
        } ?: error("Lecture RGSS refusée.")
    }
    private fun write(parent: DocumentFile, name: String, data: ByteArray) {
        require(data.size <= limit)
        val f = parent.findFile(name) ?: parent.createFile("application/octet-stream", name) ?: error("Création refusée : $name")
        require(f.isFile && f.canWrite()) { "Écriture refusée : $name" }
        activity.contentResolver.openOutputStream(f.uri, "wt")?.use { it.write(data); it.flush() } ?: error("Écriture refusée : $name")
        require(read(f).contentEquals(data)) { "Vérification échouée : $name" }
    }
    private fun directory(parent: DocumentFile, name: String): DocumentFile {
        val d = parent.findFile(name) ?: parent.createDirectory(name) ?: error("Création du dossier refusée.")
        require(d.isDirectory && d.canWrite()) { "Dossier non accessible : $name" }; return d
    }
    private fun remove(parent: DocumentFile, name: String) { parent.findFile(name)?.let { require(it.isFile && it.delete()) { "Suppression refusée : $name" } } }
    private fun find(root: DocumentFile, path: String): DocumentFile? {
        var current: DocumentFile? = root
        path.split('/').forEach { segment ->
            require(segment.isNotEmpty() && segment != "." && segment != ".." && !segment.contains(':'))
            val matches = current?.listFiles()?.filter { it.name.equals(segment, true) } ?: return null
            require(matches.size <= 1) { "Chemin RGSS ambigu." }; current = matches.firstOrNull()
        }
        return current
    }
    private fun scripts(root: DocumentFile, ini: ByteArray): ByteArray {
        val (path, engine) = RgssFormat.scriptPath(ini)
        val extension = when (engine) { "XP" -> ".rgssad"; "VX" -> ".rgss2a"; else -> ".rgss3a" }
        // The redirected path is deliberately absent from the original archive.
        if (!path.startsWith("RPGMToolkit/")) {
            val archives = root.listFiles().filter { it.isFile && it.name?.endsWith(extension, true) == true }
            require(archives.size <= 1) { "Plusieurs archives RGSS : moteur ambigu." }
            if (archives.isNotEmpty()) return activity.contentResolver.openInputStream(archives[0].uri)?.use { RgssFormat.extract(it, path) } ?: error("Archive RGSS illisible.")
        }
        return read(find(root, path) ?: error("Scripts absents : $path"))
    }
    private fun backup(root: DocumentFile, marker: JSONObject): DocumentFile {
        val id = marker.getString("backup"); require(Regex("[a-zA-Z0-9-]+").matches(id))
        return root.findFile(".rpgm-toolkit-backups")?.findFile(id) ?: error("Copie de secours RGSS absente.")
    }
    private fun current(root: DocumentFile): JSONObject {
        val ini = read(root.findFile("Game.ini") ?: error("Game.ini absent."))
        val own = root.findFile("RPGMToolkit")
        val original = own?.findFile("original-game.ini")?.let { read(it) } ?: ini
        RgssFormat.scriptPath(original)
        require(!RgssFormat.scriptPath(original).first.startsWith("RPGMToolkit/")) { "Copie originale de Game.ini absente." }
        require(own == null || own.findFile("original-game.ini") != null) { "Dossier RPGMToolkit déjà utilisé par un autre contenu." }
        return JSONObject().put("ini", encode(ini)).put("originalIni", encode(original)).put("scripts", encode(scripts(root, ini)))
    }
    fun inspect(root: DocumentFile): JSObject {
        require(root.canRead() && root.canWrite()) { "Dossier en lecture seule." }
        val pending = root.findFile(MARKER)?.let { JSONObject(read(it).toString(Charsets.UTF_8)) }
        val state = if (pending != null) {
            val data = read(backup(root, pending).findFile("state.json") ?: error("État RGSS de secours absent."))
            require(hash(data) == pending.getString("stateHash")); JSONObject(data.toString(Charsets.UTF_8))
        } else current(root)
        val ini = decode(state.getString("originalIni"))
        val title = ini.toString(Charsets.UTF_8).lineSequence().firstOrNull { it.trim().startsWith("Title=", true) }?.substringAfter('=')?.trim()
        return JSObject().put("engine", RgssFormat.scriptPath(ini).second).put("title", title?.takeIf { it.isNotEmpty() } ?: root.name ?: "Jeu RGSS")
            .put("name", root.name).put("kind", "folder").put("registry", state.toString()).put("plugin", JSONObject.NULL).put("recoveryNeeded", pending != null)
    }
    private fun fingerprint(registry: String): String = hash(registry.toByteArray(Charsets.UTF_8) + byteArrayOf(0, 2))
    fun apply(root: DocumentFile, args: ApplyArgs): JSObject {
        require(root.findFile(MARKER) == null) { "Restaurez d’abord l’opération RGSS interrompue." }
        val before = current(root); require(fingerprint(before.toString()) == args.expected) { "Le jeu a changé depuis l’analyse." }
        val patched = JSONObject(args.registry)
        val original = decode(before.getString("originalIni")); val target = RgssFormat.target(original)
        require(patched.getString("originalIni") == before.getString("originalIni")) { "Original RGSS incohérent." }
        val newIni = decode(patched.getString("ini")); require(newIni.contentEquals(if (args.uninstall) original else RgssFormat.redirect(original))) { "Chemin RGSS modifié inattendu." }
        val newScripts = decode(patched.getString("scripts")); require(newScripts.size <= RgssFormat.LIMIT && newScripts.take(2) == listOf(4.toByte(),8.toByte())) { "Scripts modifiés invalides." }
        val id = "${System.currentTimeMillis()}-${UUID.randomUUID()}"
        val backup = directory(directory(root, ".rpgm-toolkit-backups"), id)
        val oldDir = root.findFile("RPGMToolkit")
        val oldScripts = oldDir?.findFile(target)?.let { read(it) }
        val oldOriginal = oldDir?.findFile("original-game.ini")?.let { read(it) }
        val state = before.toString().toByteArray(Charsets.UTF_8)
        write(backup, "state.json", state)
        if (oldScripts != null) write(backup, target, oldScripts)
        if (oldOriginal != null) write(backup, "original-game.ini", oldOriginal)
        val journal = JSONObject().put("backup", id).put("stateHash", hash(state)).put("target", target)
            .put("scriptHash", oldScripts?.let { hash(it) } ?: JSONObject.NULL).put("originalHash", oldOriginal?.let { hash(it) } ?: JSONObject.NULL)
        write(backup, "manifest.json", journal.toString().toByteArray(Charsets.UTF_8))
        require(fingerprint(current(root).toString()) == args.expected) { "Le jeu a changé pendant la sauvegarde." }
        write(root, MARKER, journal.toString().toByteArray(Charsets.UTF_8))
        try {
            val own = directory(root, "RPGMToolkit")
            if (!args.uninstall) { write(own, "original-game.ini", original); write(own, target, newScripts) }
            write(root, "Game.ini", newIni)
            if (args.uninstall) { remove(own, target); remove(own, "original-game.ini"); if (own.listFiles().isEmpty()) require(own.delete()) }
            val checked = current(root)
            require(checked.getString("ini") == patched.getString("ini")) { "Game.ini installé incorrect." }
            if (!args.uninstall) require(checked.getString("scripts") == patched.getString("scripts")) { "Scripts installés incorrects." }
            remove(root, MARKER)
        } catch (e: Exception) {
            try { restore(root) } catch (rollback: Exception) { error("${e.message} Restauration RGSS requise : ${rollback.message}") }
            error("${e.message} Fichiers précédents restaurés.")
        }
        return inspect(root)
    }
    fun restore(root: DocumentFile) {
        val marker = root.findFile(MARKER) ?: return
        val journal = JSONObject(read(marker).toString(Charsets.UTF_8)); val backup = backup(root, journal)
        val stateBytes = read(backup.findFile("state.json") ?: error("État RGSS absent.")); require(hash(stateBytes) == journal.getString("stateHash"))
        val state = JSONObject(stateBytes.toString(Charsets.UTF_8)); val original = decode(state.getString("originalIni")); val target = RgssFormat.target(original)
        require(target == journal.getString("target"))
        val own = directory(root, "RPGMToolkit")
        for ((name, key) in listOf(target to "scriptHash", "original-game.ini" to "originalHash")) {
            if (journal.isNull(key)) remove(own, name)
            else { val data = read(backup.findFile(name) ?: error("Copie RGSS absente : $name")); require(hash(data) == journal.getString(key)); write(own, name, data) }
        }
        write(root, "Game.ini", decode(state.getString("ini")))
        if (own.listFiles().isEmpty()) require(own.delete())
        require(marker.delete()) { "Journal RGSS non supprimé." }
    }
}
