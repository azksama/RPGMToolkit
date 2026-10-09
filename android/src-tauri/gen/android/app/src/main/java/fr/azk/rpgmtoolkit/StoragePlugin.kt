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
import org.json.JSONArray
import android.provider.DocumentsContract

@InvokeArg class PickArgs { var kind: String = "zip" }
@InvokeArg class ApplyArgs { var token: String = ""; var registry: String = ""; var registryPath: String = ""; var plugin: String? = null; var expected: String = ""; var uninstall: Boolean = false }
@InvokeArg class FolderArgs { var token: String = "" }
@InvokeArg class ExportArgs { var path: String = ""; var name: String = "game-toolkit.zip" }

@TauriPlugin
class StoragePlugin(private val activity: Activity) : Plugin(activity) {
    private val rgss = RgssStorage(activity)
    private val wolf = WolfStorage(activity)
    private val io = Executors.newSingleThreadExecutor()
    private val roots = mutableMapOf<String, DocumentFile>()
    private val rootTokens = mutableMapOf<String, String>()
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
        val file = parent.toolkitChild(name) ?: parent.createFile("application/octet-stream", name) ?: error("Création refusée : $name")
        require(file.isFile && file.canWrite()) { "Écriture refusée : $name" }
        activity.contentResolver.openOutputStream(file.uri, "wt")?.use { it.write(content); it.flush() } ?: error("Écriture impossible : $name")
        require(hash(bytes(file)) == hash(content)) { "La vérification de $name a échoué." }
        return file
    }
    private fun write(parent: DocumentFile, name: String, content: String) = write(parent, name, content.toByteArray(Charsets.UTF_8))
    private fun dir(parent: DocumentFile, name: String): DocumentFile {
        val directory = parent.toolkitChild(name) ?: parent.createDirectory(name) ?: error("Création du dossier $name refusée.")
        require(directory.isDirectory) { "$name est déjà utilisé par un fichier." }
        return directory
    }
    private fun identity(root: DocumentFile): String = root.uri.authority + ":" + DocumentsContract.getDocumentId(root.uri)
    private fun register(root: DocumentFile): String {
        val key = identity(root)
        val token = rootTokens.getOrPut(key) { UUID.randomUUID().toString() }
        roots[token] = root
        return token
    }
    private fun entries(parent: DocumentFile): List<ScanEntry<DocumentFile>> {
        require(parent.canRead()) { "Lecture refusée." }
        val projection = arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE)
        val uri = DocumentsContract.buildChildDocumentsUriUsingTree(parent.uri, DocumentsContract.getDocumentId(parent.uri))
        val metadata = mutableMapOf<String, Pair<String, Boolean>>()
        (activity.contentResolver.query(uri, projection, null, null, null) ?: error("Lecture du dossier impossible.")).use { cursor ->
            while (cursor.moveToNext()) {
                require(metadata.size < 100000) { "Trop d’entrées dans ce dossier." }
                metadata[cursor.getString(0)] = Pair(cursor.getString(1) ?: "", cursor.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR)
            }
        }
        return parent.listFiles().mapNotNull { file -> metadata[DocumentsContract.getDocumentId(file.uri)]?.let { ScanEntry(file, it.first, it.second) } }
    }
    private fun scan(root: DocumentFile): JSObject {
        val scanner = GameScanner<DocumentFile>(
            children = ::entries,
            identity = ::identity
        )
        val report = scanner.scan(root, root.name ?: "Dossier")
        val games = JSONArray()
        report.games.forEach { candidate ->
            val token = register(candidate.node)
            val value = JSObject().put("title", candidate.node.name ?: "Jeu")
            if (candidate.legacy && candidate.node.toolkitChild("Game.ini") == null) value.put("error", "Game.ini absent ou moteur 2000/2003 non pris en charge.")
            games.put(value.put("token", token).put("path", candidate.path))
        }
        return JSObject().put("games", games).put("warnings", JSONArray(report.warnings))
    }
    private fun compatibility(root: DocumentFile): String {
        require(root.canRead() && root.canWrite()) { "Dossier en lecture seule ou accès refusé." }
        val js = root.toolkitChild("js") ?: error("Dossier js absent.")
        require(js.canWrite()) { "Le dossier js est en lecture seule." }
        val mv = js.toolkitChild("rpg_core.js")?.takeIf { it.isFile }
        val mz = js.toolkitChild("rmmz_core.js")?.takeIf { it.isFile }
        require((mv != null) != (mz != null)) { "Moteur MV/MZ absent ou ambigu." }
        val core = text((mz ?: mv)!!)
        val version = Regex("RPGMAKER_VERSION\\s*=\\s*[\"'](\\d+)\\.(\\d+)(?:\\.\\d+)?[\"']").find(core)
            ?: error("Version du moteur non reconnue.")
        val major = version.groupValues[1].toInt()
        require(major == 1) { "Version de moteur inconnue : MV/MZ 1.x requis." }
        val prefix = if (mz != null) "rmmz" else "rpg"
        listOf("plugins.js", "main.js", "${prefix}_managers.js", "${prefix}_objects.js", "${prefix}_scenes.js", "${prefix}_sprites.js", "${prefix}_windows.js").forEach {
            require(js.toolkitChild(it)?.isFile == true) { "Fichier requis absent : js/$it" }
        }
        require(js.toolkitChild("plugins.js")?.canWrite() == true) { "plugins.js est en lecture seule." }
        js.toolkitChild("plugins")?.let { plugins ->
            require(plugins.isDirectory && plugins.canWrite()) { "Dossier js/plugins inaccessible." }
            plugins.toolkitChild("RPGMToolkit.js")?.let { require(it.isFile && it.canWrite()) { "RPGMToolkit.js est en lecture seule." } }
        }
        require(root.toolkitChild("index.html")?.isFile == true) { "Fichier requis absent : index.html" }
        val system = root.toolkitChild("data")?.toolkitChild("System.json") ?: error("Fichier requis absent : data/System.json")
        JSONObject(text(system).removePrefix("\uFEFF"))
        return if (mz != null) "MZ" else "MV"
    }
    private fun pending(root: DocumentFile): Pair<DocumentFile, JSONObject>? {
        val marker = root.toolkitChild(markerName) ?: return null
        val data = JSONObject(text(marker))
        val id = data.getString("backup")
        require(Regex("[a-zA-Z0-9-]+").matches(id)) { "Journal de restauration invalide." }
        val backup = root.toolkitChild(".rpgm-toolkit-backups")?.toolkitChild(id) ?: error("La copie de secours de l’opération interrompue est introuvable.")
        return Pair(backup, data)
    }
    private fun isRgss(root: DocumentFile): Boolean {
        val js = root.toolkitChild("js")
        return root.toolkitChild(RgssStorage.MARKER) != null || (root.toolkitChild("Game.ini") != null && js?.toolkitChild("rpg_core.js") == null && js?.toolkitChild("rmmz_core.js") == null)
    }
    private fun inspect(root: DocumentFile): JSObject {
        if (WolfStorage.detected(root)) return wolf.inspect(root)
        if (isRgss(root)) return rgss.inspect(root)
        val detectedEngine = compatibility(root)
        val js = root.toolkitChild("js") ?: error("Dossier js absent.")
        val recovery = pending(root)
        val registry = if (recovery != null) text(recovery.first.toolkitChild("plugins.js") ?: error("Copie de secours absente.")) else text(js.toolkitChild("plugins.js") ?: error("plugins.js absent."))
        val plugin = if (recovery != null) recovery.first.toolkitChild("RPGMToolkit.js")?.let { text(it) } else js.toolkitChild("plugins")?.toolkitChild("RPGMToolkit.js")?.let { text(it) }
        val title = try { root.toolkitChild("data")?.toolkitChild("System.json")?.let { JSONObject(text(it).removePrefix("\uFEFF")).optString("gameTitle") } } catch (_: Exception) { null }
        return JSObject().put("kind", "folder").put("registry", registry).put("plugin", plugin ?: JSONObject.NULL)
            .put("title", title?.takeIf { it.isNotBlank() } ?: root.name ?: "Jeu RPG Maker")
            .put("engine", detectedEngine)
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
                val root = DocumentFile.fromTreeUri(activity, uri) ?: error("Ce dossier n’est pas accessible.")
                require(root.canRead()) { "Accordez l’accès en lecture à ce dossier." }
                scan(root)
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
    private fun checkedRoot(token: String): DocumentFile = roots[token] ?: error("Sélectionnez le dossier à nouveau.")
    @Command fun forgetFolder(invoke: Invoke) {
        val args = invoke.parseArgs(FolderArgs::class.java)
        background(invoke) {
            roots.remove(args.token)?.let { rootTokens.remove(identity(it)) }
            JSObject()
        }
    }
    @Command fun inspectFolder(invoke: Invoke) { val args = invoke.parseArgs(FolderArgs::class.java); background(invoke) { inspect(checkedRoot(args.token)) } }
    @Command fun showWolf(invoke: Invoke) {
        try {
            val root=checkedRoot(invoke.parseArgs(FolderArgs::class.java).token)
            val shown=WolfOverlayService.running
            require(!shown || WolfSession.root?.let { identity(it)==identity(root) }==true) { "Arrêtez le menu WOLF actuel avant d’ouvrir un autre jeu." }
            if(shown)activity.startForegroundService(Intent(activity,WolfOverlayService::class.java).setAction("show"))
            invoke.resolve(JSObject().put("shown",shown))
        }catch(e: Exception){invoke.reject(e.message ?: "Menu WOLF indisponible.")}
    }
    @Command fun openWolf(invoke: Invoke) {
        try {
            val root=checkedRoot(invoke.parseArgs(FolderArgs::class.java).token)
            require(WolfStorage.detected(root)) { "Ce jeu n’utilise pas WOLF." }
            require(!WolfOverlayService.running || WolfSession.root?.let { identity(it)==identity(root) }==true) { "Arrêtez le menu WOLF actuel avant d’ouvrir un autre jeu." }
            if(!WolfOverlayService.running)WolfSession.root=root
            if(!android.provider.Settings.canDrawOverlays(activity)) {
                WolfSession.awaitingPermission=true
                activity.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:${activity.packageName}")))
                invoke.resolve(JSObject().put("permission",true))
            } else { (activity as? MainActivity)?.requestWolfNotifications();activity.startForegroundService(Intent(activity,WolfOverlayService::class.java).setAction("show"));invoke.resolve(JSObject().put("started",true)) }
        }catch(e: Exception){invoke.reject(e.message ?: "Menu WOLF indisponible.")}
    }
    @Command fun applyFolder(invoke: Invoke) {
        val args = invoke.parseArgs(ApplyArgs::class.java)
        background(invoke) {
            RegistryTransfer.load(args, cache)
            val root = checkedRoot(args.token)
            if (WolfStorage.detected(root)) { require(!WolfOverlayService.running) { "Fermez le menu flottant avant de modifier le mod WOLF." }; return@background wolf.apply(root, args) }
            if (isRgss(root)) return@background rgss.apply(root, args)
            compatibility(root)
            require(pending(root) == null) { "Restaurez d’abord l’opération interrompue." }
            val js = root.toolkitChild("js") ?: error("Dossier js absent.")
            val registryFile = js.toolkitChild("plugins.js") ?: error("plugins.js absent.")
            val pluginDir = dir(js, "plugins")
            val oldRegistry = bytes(registryFile)
            val oldPlugin = pluginDir.toolkitChild("RPGMToolkit.js")?.let { bytes(it) }
            val oldText = text(registryFile)
            require(fingerprint(oldText, pluginDir.toolkitChild("RPGMToolkit.js")?.let { text(it) }) == args.expected) { "Le jeu a changé depuis l’analyse. Sélectionnez-le à nouveau." }
            val backupId = "${System.currentTimeMillis()}-${UUID.randomUUID()}"
            val backup = dir(dir(root, ".rpgm-toolkit-backups"), backupId)
            write(backup, "plugins.js", oldRegistry)
            if (oldPlugin != null) write(backup, "RPGMToolkit.js", oldPlugin)
            val journal = JSONObject().put("backup", backupId).put("hadPlugin", oldPlugin != null).put("registrySha256", hash(oldRegistry)).put("pluginSha256", oldPlugin?.let { hash(it) } ?: JSONObject.NULL).put("action", if (args.uninstall) "uninstall" else "install")
            write(backup, "manifest.json", journal.toString(2))
            require(fingerprint(text(registryFile), pluginDir.toolkitChild("RPGMToolkit.js")?.let { text(it) }) == args.expected) { "Les fichiers du jeu ont changé pendant la sauvegarde." }
            val marker = write(root, markerName, journal.toString())
            try {
                if (!args.uninstall) write(pluginDir, "RPGMToolkit.js", args.plugin ?: error("Mod absent."))
                write(js, "plugins.js", args.registry)
                if (args.uninstall) pluginDir.toolkitChild("RPGMToolkit.js")?.let { require(it.delete()) { "Impossible de retirer RPGMToolkit.js." } }
                require(marker.delete()) { "Impossible de finaliser le journal. Une restauration est nécessaire." }
            } catch (e: Exception) {
                try { restore(root); } catch (rollback: Exception) { error("${e.message} Restauration incomplète : ${rollback.message}. Rouvrez ce dossier pour restaurer la copie de secours.") }
                error("${e.message} Les fichiers précédents ont été restaurés.")
            }
            inspect(root).put("backup", ".rpgm-toolkit-backups/$backupId")
        }
    }
    private fun restore(root: DocumentFile) {
        if (root.toolkitChild(WolfStorage.PENDING) != null) { require(!WolfOverlayService.running); wolf.restore(root); return }
        if (root.toolkitChild(RgssStorage.MARKER) != null) { rgss.restore(root); return }
        val (backup, data) = pending(root) ?: return
        val registry = bytes(backup.toolkitChild("plugins.js") ?: error("Copie de plugins.js absente."))
        require(hash(registry) == data.getString("registrySha256")) { "Copie de secours du registre endommagée." }
        val js = root.toolkitChild("js") ?: error("Dossier js absent.")
        val pluginDir = dir(js, "plugins")
        if (data.getBoolean("hadPlugin")) {
            val previous = bytes(backup.toolkitChild("RPGMToolkit.js") ?: error("Copie du mod absente."))
            require(hash(previous) == data.getString("pluginSha256")) { "Copie de secours du plugin endommagée." }
            write(pluginDir, "RPGMToolkit.js", previous)
        } else pluginDir.toolkitChild("RPGMToolkit.js")?.let { require(it.delete()) { "Suppression du plugin impossible." } }
        write(js, "plugins.js", registry)
        require(root.toolkitChild(markerName)?.delete() == true) { "Suppression du journal impossible." }
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
