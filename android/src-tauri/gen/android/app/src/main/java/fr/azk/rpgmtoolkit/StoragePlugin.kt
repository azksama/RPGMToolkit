package fr.azk.rpgmtoolkit

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.documentfile.provider.DocumentFile
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import org.json.JSONObject

@InvokeArg class PickArgs { var kind: String = "zip" }
@InvokeArg class ApplyArgs { var token: String = ""; var registry: String = ""; var plugin: String? = null; var expected: String = ""; var uninstall: Boolean = false }
@InvokeArg class FolderArgs { var token: String = "" }
@InvokeArg class ExportArgs { var path: String = ""; var name: String = "game-toolkit.zip" }

@TauriPlugin
class StoragePlugin(private val activity: Activity) : Plugin(activity) {
    private val io = Executors.newSingleThreadExecutor()
    private var selectedRoot: DocumentFile? = null
    private var selectedToken: String = ""
    private var pickKind = "zip"
    private var pendingExport: File? = null
    private var originalZip: Uri? = null
    private val cache: File get() = File(activity.cacheDir, "rpgm-toolkit").also { it.mkdirs() }
    private val maxText = 4L * 1024 * 1024
    private val markerName = ".rpgm-toolkit-pending.json"

    private fun background(invoke: Invoke, action: () -> JSObject) {
        io.execute { try { invoke.resolve(action()) } catch (e: Exception) { invoke.reject(e.message ?: "Accès aux fichiers impossible.") } }
    }
    private fun bytes(file: DocumentFile, limit: Long = maxText): ByteArray {
        require(file.length() <= limit) { "${file.name} dépasse la taille autorisée." }
        return activity.contentResolver.openInputStream(file.uri)?.use { stream ->
            val out = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(64 * 1024)
            var total = 0L
            while (true) { val n = stream.read(buffer); if (n < 0) break; total += n; require(total <= limit) { "Fichier trop volumineux." }; out.write(buffer, 0, n) }
            out.toByteArray()
        } ?: error("Lecture refusée : ${file.name}")
    }
    private fun text(file: DocumentFile): String = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes(file))).toString()
    private fun hash(data: ByteArray) = MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }
    private fun fingerprint(registry: String, plugin: String?): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(registry.toByteArray(Charsets.UTF_8)); digest.update(0.toByte())
        if (plugin == null) digest.update(2.toByte()) else { digest.update(1.toByte()); digest.update(plugin.toByteArray(Charsets.UTF_8)) }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
    private fun write(parent: DocumentFile, name: String, content: ByteArray): DocumentFile {
        val file = parent.findFile(name) ?: parent.createFile("application/octet-stream", name) ?: error("Création refusée : $name")
        require(file.isFile && file.canWrite()) { "Écriture refusée : $name" }
        activity.contentResolver.openOutputStream(file.uri, "wt")?.use { it.write(content); it.flush() } ?: error("Écriture impossible : $name")
        require(hash(bytes(file)) == hash(content)) { "La vérification de $name a échoué." }
        return file
    }
    private fun write(parent: DocumentFile, name: String, content: String) = write(parent, name, content.toByteArray(Charsets.UTF_8))
    private fun dir(parent: DocumentFile, name: String): DocumentFile {
        val directory = parent.findFile(name) ?: parent.createDirectory(name) ?: error("Création du dossier $name refusée.")
        require(directory.isDirectory) { "$name est déjà utilisé par un fichier." }
        return directory
    }
    private fun engine(root: DocumentFile): String? {
        val js = root.findFile("js") ?: return null
        if (js.findFile("plugins.js")?.isFile != true) return null
        return if (js.findFile("rmmz_core.js")?.isFile == true) "MZ" else if (js.findFile("rpg_core.js")?.isFile == true) "MV" else null
    }
    private fun locate(root: DocumentFile): DocumentFile {
        if (engine(root) != null) return root
        root.findFile("www")?.let { if (engine(it) != null) return it }
        val found = mutableListOf<DocumentFile>()
        // One enclosing folder is accepted. Never crawl a whole phone or every asset.
        val children = root.listFiles()
        require(children.size <= 500) { "Choisissez directement le dossier du jeu : ce dossier contient trop d’entrées." }
        children.filter { it.isDirectory }.forEach { child ->
            if (engine(child) != null) found.add(child)
            else child.findFile("www")?.let { if (engine(it) != null) found.add(it) }
        }
        require(found.size == 1) { if (found.isEmpty()) "Aucun jeu MV/MZ détecté. Choisissez son dossier contenant js, ou www." else "Plusieurs jeux détectés. Choisissez le dossier d’un seul jeu." }
        return found.first()
    }
    private fun pending(root: DocumentFile): Pair<DocumentFile, JSONObject>? {
        val marker = root.findFile(markerName) ?: return null
        val data = JSONObject(text(marker))
        val id = data.getString("backup")
        require(Regex("[a-zA-Z0-9-]+").matches(id)) { "Journal de restauration invalide." }
        val backup = root.findFile(".rpgm-toolkit-backups")?.findFile(id) ?: error("La copie de secours de l’opération interrompue est introuvable.")
        return Pair(backup, data)
    }
    private fun inspect(root: DocumentFile): JSObject {
        val js = root.findFile("js") ?: error("Dossier js absent.")
        val recovery = pending(root)
        val registry = if (recovery != null) text(recovery.first.findFile("plugins.js") ?: error("Copie de secours absente.")) else text(js.findFile("plugins.js") ?: error("plugins.js absent."))
        val plugin = if (recovery != null) recovery.first.findFile("RPGMToolkit.js")?.let { text(it) } else js.findFile("plugins")?.findFile("RPGMToolkit.js")?.let { text(it) }
        val title = try { root.findFile("data")?.findFile("System.json")?.let { JSONObject(text(it).removePrefix("\uFEFF")).optString("gameTitle") } } catch (_: Exception) { null }
        return JSObject().put("kind", "folder").put("registry", registry).put("plugin", plugin ?: JSONObject.NULL)
            .put("title", title?.takeIf { it.isNotBlank() } ?: root.name ?: "Jeu RPG Maker")
            .put("engine", engine(root) ?: error("Moteur du jeu absent."))
            .put("name", root.name ?: "Jeu").put("recoveryNeeded", recovery != null)
    }
    @Command fun pick(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(PickArgs::class.java)
            require(args.kind in listOf("zip", "folder", "mod")) { "Type de sélection invalide." }
            pickKind = args.kind
            val intent = if (args.kind == "folder") Intent(Intent.ACTION_OPEN_DOCUMENT_TREE) else Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE); type = "*/*"
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream"))
            }
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (args.kind == "folder") intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            startActivityForResult(invoke, intent, "picked")
        } catch (e: Exception) { invoke.reject(e.message ?: "Sélecteur de fichiers indisponible.") }
    }
    @ActivityCallback fun picked(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { invoke.reject("CANCELLED"); return }
        val uri = result.data!!.data!!
        val kind = pickKind
        background(invoke) {
            if (kind == "folder") {
                val flags = result.data!!.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                try { activity.contentResolver.takePersistableUriPermission(uri, flags) } catch (_: SecurityException) { /* Session grant still works. */ }
                val root = locate(DocumentFile.fromTreeUri(activity, uri) ?: error("Ce dossier n’est pas accessible."))
                require(root.canRead() && root.canWrite()) { "Accordez l’accès en lecture et écriture à ce dossier." }
                val snapshot = inspect(root); selectedRoot = root; selectedToken = UUID.randomUUID().toString(); snapshot.put("token", selectedToken)
            } else {
                var name = "game.zip"
                var size = -1L
                activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) { name = cursor.getString(0) ?: name; if (!cursor.isNull(1)) size = cursor.getLong(1) }
                }
                require(name.endsWith(".zip", true)) { "Sélectionnez un fichier .zip." }
                val max = if (kind == "mod") 16L * 1024 * 1024 else 8L * 1024 * 1024 * 1024
                require(size <= max) { "ZIP trop volumineux : ${if (kind == "mod") "16 Mo" else "8 Go"} maximum." }
                if (size > 0) require(cache.usableSpace > size * 2 + 128 * 1024 * 1024) { "Espace libre insuffisant pour copier et préparer cette archive." }
                val target = File(cache, "import-${UUID.randomUUID()}.zip")
                try {
                    activity.contentResolver.openInputStream(uri)?.use { input -> target.outputStream().use { output ->
                        val buffer = ByteArray(256 * 1024); var copied = 0L
                        while (true) { val n = input.read(buffer); if (n < 0) break; copied += n; require(copied <= max) { "ZIP trop volumineux." }; output.write(buffer, 0, n) }
                        output.fd.sync()
                    } } ?: error("Lecture de l’archive refusée.")
                } catch (e: Exception) { target.delete(); throw e }
                if (kind == "zip") originalZip = uri
                JSObject().put("kind", "zip").put("path", target.absolutePath).put("name", name).put("size", target.length())
            }
        }
    }
    private fun checkedRoot(token: String): DocumentFile { require(token.isNotEmpty() && token == selectedToken) { "La sélection du dossier a changé. Sélectionnez le jeu à nouveau." }; return selectedRoot ?: error("Sélectionnez un dossier.") }
    @Command fun inspectFolder(invoke: Invoke) { val args = invoke.parseArgs(FolderArgs::class.java); background(invoke) { inspect(checkedRoot(args.token)) } }
    @Command fun applyFolder(invoke: Invoke) {
        val args = invoke.parseArgs(ApplyArgs::class.java)
        background(invoke) {
            val root = checkedRoot(args.token)
            require(pending(root) == null) { "Restaurez d’abord l’opération interrompue." }
            val js = root.findFile("js") ?: error("Dossier js absent.")
            val registryFile = js.findFile("plugins.js") ?: error("plugins.js absent.")
            val pluginDir = dir(js, "plugins")
            val oldRegistry = bytes(registryFile)
            val oldPlugin = pluginDir.findFile("RPGMToolkit.js")?.let { bytes(it) }
            val oldText = text(registryFile)
            require(fingerprint(oldText, pluginDir.findFile("RPGMToolkit.js")?.let { text(it) }) == args.expected) { "Le jeu a changé depuis l’analyse. Sélectionnez-le à nouveau." }
            val backupId = "${System.currentTimeMillis()}-${UUID.randomUUID()}"
            val backup = dir(dir(root, ".rpgm-toolkit-backups"), backupId)
            write(backup, "plugins.js", oldRegistry)
            if (oldPlugin != null) write(backup, "RPGMToolkit.js", oldPlugin)
            val journal = JSONObject().put("backup", backupId).put("hadPlugin", oldPlugin != null).put("registrySha256", hash(oldRegistry)).put("pluginSha256", oldPlugin?.let { hash(it) } ?: JSONObject.NULL).put("action", if (args.uninstall) "uninstall" else "install")
            write(backup, "manifest.json", journal.toString(2))
            require(fingerprint(text(registryFile), pluginDir.findFile("RPGMToolkit.js")?.let { text(it) }) == args.expected) { "Les fichiers du jeu ont changé pendant la sauvegarde." }
            val marker = write(root, markerName, journal.toString())
            try {
                if (!args.uninstall) write(pluginDir, "RPGMToolkit.js", args.plugin ?: error("Mod absent."))
                write(js, "plugins.js", args.registry)
                if (args.uninstall) pluginDir.findFile("RPGMToolkit.js")?.let { require(it.delete()) { "Impossible de retirer RPGMToolkit.js." } }
                require(marker.delete()) { "Impossible de finaliser le journal. Une restauration est nécessaire." }
            } catch (e: Exception) {
                try { restore(root); } catch (rollback: Exception) { error("${e.message} Restauration incomplète : ${rollback.message}. Rouvrez ce dossier pour restaurer la copie de secours.") }
                error("${e.message} Les fichiers précédents ont été restaurés.")
            }
            inspect(root).put("backup", ".rpgm-toolkit-backups/$backupId")
        }
    }
    private fun restore(root: DocumentFile) {
        val (backup, data) = pending(root) ?: return
        val registry = bytes(backup.findFile("plugins.js") ?: error("Copie de plugins.js absente."))
        require(hash(registry) == data.getString("registrySha256")) { "Copie de secours du registre endommagée." }
        val js = root.findFile("js") ?: error("Dossier js absent.")
        val pluginDir = dir(js, "plugins")
        if (data.getBoolean("hadPlugin")) {
            val previous = bytes(backup.findFile("RPGMToolkit.js") ?: error("Copie du mod absente."))
            require(hash(previous) == data.getString("pluginSha256")) { "Copie de secours du plugin endommagée." }
            write(pluginDir, "RPGMToolkit.js", previous)
        } else pluginDir.findFile("RPGMToolkit.js")?.let { require(it.delete()) { "Suppression du plugin impossible." } }
        write(js, "plugins.js", registry)
        require(root.findFile(markerName)?.delete() == true) { "Suppression du journal impossible." }
    }
    @Command fun recoverFolder(invoke: Invoke) { val args = invoke.parseArgs(FolderArgs::class.java); background(invoke) { val root = checkedRoot(args.token); restore(root); inspect(root) } }
    @Command fun exportZip(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ExportArgs::class.java)
            val file = File(args.path).canonicalFile
            require(file.parentFile == cache.canonicalFile && file.name.startsWith("result-") && file.isFile) { "Archive de sortie non reconnue." }
            pendingExport = file
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "application/zip"; putExtra(Intent.EXTRA_TITLE, args.name) }
            startActivityForResult(invoke, intent, "exported")
        } catch (e: Exception) { invoke.reject(e.message ?: "Export impossible.") }
    }
    @ActivityCallback fun exported(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) { invoke.reject("CANCELLED"); return }
        val uri = result.data!!.data!!
        background(invoke) {
            require(uri != originalZip) { "Choisissez un nouveau fichier pour préserver le ZIP original." }
            val file = pendingExport ?: error("Aucun ZIP prêt à exporter.")
            try {
                activity.contentResolver.openOutputStream(uri, "wt")?.use { output -> file.inputStream().use { it.copyTo(output, 256 * 1024) }; output.flush() } ?: error("Écriture de l’archive refusée.")
                // Verify exported bytes, including on document providers backed by removable storage.
                fun digest(input: java.io.InputStream): String = input.use { val md = MessageDigest.getInstance("SHA-256"); val buffer = ByteArray(256 * 1024); while (true) { val n = it.read(buffer); if (n < 0) break; md.update(buffer, 0, n) }; md.digest().joinToString("") { b -> "%02x".format(b) } }
                val outputHash = activity.contentResolver.openInputStream(uri)?.let { digest(it) } ?: error("Vérification de l’export impossible.")
                require(outputHash == digest(file.inputStream())) { "Le ZIP exporté est incomplet." }
                JSObject().put("saved", true).put("name", DocumentFile.fromSingleUri(activity, uri)?.name ?: "ZIP exporté")
            } catch (e: Exception) {
                // ACTION_CREATE_DOCUMENT creates a new document, never removes an existing game archive.
                DocumentFile.fromSingleUri(activity, uri)?.delete()
                throw e
            }
        }
    }
}
