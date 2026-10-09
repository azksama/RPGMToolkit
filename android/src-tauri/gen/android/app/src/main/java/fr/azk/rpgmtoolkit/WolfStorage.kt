package fr.azk.rpgmtoolkit

import android.content.Context
import android.util.Base64
import androidx.documentfile.provider.DocumentFile
import app.tauri.plugin.JSObject
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

class WolfStorage(private val context: Context) {
    companion object {
        const val PENDING = ".rpgm-toolkit-wolf-pending.json"
        private const val LIMIT = 64 * 1024 * 1024
        const val CATALOG_LIMIT = LIMIT
        const val MAX_CATALOG_ENTRIES = 1_110_000
        private const val BUNDLE_LIMIT = LIMIT * 4
        val KEYS = listOf("common", "original", "system", "systemNames", "mutable", "mutableNames", "marker", "catalog", "game", "originalGame")
        fun fingerprint(bundle: JSONObject): String {
            val digest = MessageDigest.getInstance("SHA-256")
            KEYS.forEach { key -> digest.update(if (bundle.isNull(key)) byteArrayOf(0) else bundle.getString(key).toByteArray(Charsets.UTF_8)); digest.update(0xff.toByte()) }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
        fun detected(root: DocumentFile): Boolean = root.toolkitChild(PENDING) != null ||
            root.toolkitChild("Data.wolf") != null || root.toolkitChild("Data.wolfx") != null ||
            root.toolkitChild("Data")?.let { it.toolkitChild("BasicData.wolf") != null || it.toolkitChild("BasicData.wolfx") != null || it.toolkitChild("BasicData")?.toolkitChild("CommonEvent.dat") != null } == true
    }
    fun read(file: DocumentFile, limit: Int = LIMIT): ByteArray {
        require(file.isFile && file.length() <= limit) { "Fichier WOLF trop volumineux : ${file.name}" }
        return context.contentResolver.openInputStream(file.uri)?.use { stream ->
            val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(65536);var total=0
            while(true) {val n=stream.read(buffer);if(n<0)break;total+=n;require(total<=limit){"Fichier trop volumineux."};out.write(buffer,0,n)}
            out.toByteArray()
        } ?: error("Lecture WOLF refusée : ${file.name}")
    }
    private fun hash(bytes: ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    fun write(parent: DocumentFile, name: String, bytes: ByteArray, limit: Int = LIMIT): DocumentFile {
        require(bytes.size <= limit) { "Fichier WOLF trop volumineux." }
        val file=parent.toolkitChild(name) ?: parent.createFile("application/octet-stream",name) ?: error("Création refusée : $name")
        require(file.isFile && file.canWrite()) { "Écriture refusée : $name" }
        context.contentResolver.openOutputStream(file.uri,"wt")?.use { it.write(bytes);it.flush() } ?: error("Écriture refusée : $name")
        require(read(file,limit).contentEquals(bytes)) { "Vérification échouée : $name" };return file
    }
    fun directory(parent: DocumentFile, name: String): DocumentFile {
        val dir=parent.toolkitChild(name) ?: parent.createDirectory(name) ?: error("Création refusée : $name")
        require(dir.isDirectory && dir.canWrite()) { "Dossier inaccessible : $name" };return dir
    }
    private fun remove(parent: DocumentFile, name: String) { parent.toolkitChild(name)?.let { require(it.isFile && it.delete()) { "Suppression refusée : $name" } } }
    fun data(root: DocumentFile): DocumentFile {
        require(root.toolkitChild("Data.wolf")==null && root.toolkitChild("Data.wolfx")==null) { "WOLF : archive Data protégée. Des fichiers décompressés sont requis." }
        val data=root.toolkitChild("Data") ?: error("WOLF : dossier Data absent.")
        require(data.toolkitChild("BasicData.wolf")==null && data.toolkitChild("BasicData.wolfx")==null) { "WOLF : archive BasicData protégée. Des fichiers décompressés sont requis." }
        require(data.isDirectory && root.canWrite()) { "Dossier WOLF en lecture seule." };return data
    }
    private fun basic(root: DocumentFile)=data(root).toolkitChild("BasicData") ?: error("BasicData absent.")
    private fun current(root: DocumentFile): JSONObject {
        val basic=basic(root);val own=data(root).toolkitChild("RPGMToolkit")
        require(own==null || own.toolkitChild("meta.json")!=null || own.isDirectory && own.listFiles().all { it.isFile && it.name?.matches(Regex("toolkit-save-[0-9]{1,6}\\.sav",RegexOption.IGNORE_CASE))==true }) { "Dossier Data/RPGMToolkit déjà utilisé ou installation incomplète." }
        fun encoded(file: DocumentFile?)=file?.let { Base64.encodeToString(read(it),Base64.NO_WRAP) } ?: JSONObject.NULL
        return JSONObject().put("common",encoded(basic.toolkitChild("CommonEvent.dat") ?: error("CommonEvent.dat absent.")))
            .put("original",encoded(own?.toolkitChild("original-common.dat")))
            .put("system",encoded(basic.toolkitChild("SysDatabase.dat") ?: error("SysDatabase.dat absent.")))
            .put("systemNames",encoded(basic.toolkitChild("SysDatabase.project")))
            .put("mutable",encoded(basic.toolkitChild("CDataBase.dat") ?: error("CDataBase.dat absent.")))
            .put("mutableNames",encoded(basic.toolkitChild("CDataBase.project")))
            .put("marker",own?.toolkitChild("meta.json")?.let { read(it,1024*1024).toString(Charsets.UTF_8) } ?: JSONObject.NULL)
            .put("catalog",own?.toolkitChild("catalog.json")?.let { read(it,CATALOG_LIMIT).toString(Charsets.UTF_8) } ?: JSONObject.NULL)
            .put("game",encoded(basic.toolkitChild("Game.dat") ?: error("Game.dat absent.")))
            .put("originalGame",encoded(own?.toolkitChild("original-game.dat")))
    }
    private fun backup(root: DocumentFile, journal: JSONObject): DocumentFile {
        val name=journal.getString("backup");require(Regex("[a-zA-Z0-9-]+").matches(name)) { "Journal WOLF invalide." }
        return root.toolkitChild(".rpgm-toolkit-backups")?.toolkitChild(name) ?: error("Copie de secours WOLF absente.")
    }
    private fun state(root: DocumentFile, journal: JSONObject): JSONObject {
        val state=JSONObject(read(backup(root,journal).toolkitChild("state.json") ?: error("État de secours absent."),BUNDLE_LIMIT).toString(Charsets.UTF_8))
        require(fingerprint(state)==journal.getString("fingerprint")) { "Copie de secours WOLF altérée." };return state
    }
    fun inspect(root: DocumentFile): JSObject {
        val pending=root.toolkitChild(PENDING)?.let { JSONObject(read(it,65536).toString(Charsets.UTF_8)) }
        val state=if(pending==null)current(root) else state(root,pending)
        return JSObject().put("engine","WOLF").put("title",root.name ?: "WOLF RPG").put("name",root.name).put("kind","folder").put("registry",state.toString()).put("recoveryNeeded",pending!=null)
    }
    private fun decode(bundle: JSONObject, key: String): ByteArray {
        val text=bundle.getString(key);require(text.length <= LIMIT*4/3+4);return Base64.decode(text,Base64.NO_WRAP).also {require(it.size<=LIMIT)}
    }
    private fun replace(root: DocumentFile, bundle: JSONObject) {
        val data=data(root);val own=data.toolkitChild("RPGMToolkit") ?: directory(data,"RPGMToolkit")
        if(!bundle.isNull("marker")) {
            write(own,"original-common.dat",decode(bundle,"original"))
            write(own,"original-game.dat",decode(bundle,"originalGame"))
            write(own,"catalog.json",bundle.getString("catalog").toByteArray(Charsets.UTF_8))
            write(own,"meta.json",bundle.getString("marker").toByteArray(Charsets.UTF_8))
            if(own.toolkitChild("request.txt")==null)write(own,"request.txt","0".toByteArray())
        }
        write(basic(root),"CommonEvent.dat",decode(bundle,"common"))
        write(basic(root),"Game.dat",decode(bundle,"game"))
        if(bundle.isNull("marker")) {
            remove(own,"original-common.dat");remove(own,"original-game.dat");remove(own,"catalog.json");remove(own,"meta.json")
            own.listFiles().filter { it.isFile && (it.name?.let { name -> name in listOf("request.txt","commands.txt","reply.txt","ack.txt") }==true || it.name?.matches(Regex("(input|output)-[0-9]{1,3}\\.txt"))==true) }.forEach { require(it.delete()) }
            if(own.listFiles().isEmpty())require(own.delete())
        }
    }
    fun apply(root: DocumentFile, args: ApplyArgs): JSObject {
        require(root.toolkitChild(PENDING)==null) { "Restauration WOLF requise." }
        val before=current(root);require(fingerprint(before)==args.expected) { "Le jeu a changé depuis l’analyse." }
        val next=JSONObject(args.registry)
        for(key in listOf("system","systemNames","mutable","mutableNames"))require(before.opt(key)==next.opt(key)) { "Schéma WOLF modifié inattendu." }
        val original=if(before.isNull("original"))before.getString("common")else before.getString("original")
        val originalGame=if(before.isNull("originalGame"))before.getString("game")else before.getString("originalGame")
        require(if(args.uninstall)next.getString("common")==original && next.isNull("marker") else next.getString("original")==original && !next.isNull("marker")) { "Copie originale incohérente." }
        require(if(args.uninstall)next.getString("game")==originalGame else next.getString("originalGame")==originalGame) { "Copie originale Game.dat incohérente." }
        val id="${System.currentTimeMillis()}-${UUID.randomUUID()}-wolf"
        val backup=directory(directory(root,".rpgm-toolkit-backups"),id)
        write(backup,"state.json",before.toString().toByteArray(Charsets.UTF_8),BUNDLE_LIMIT)
        val journal=JSONObject().put("backup",id).put("fingerprint",args.expected)
        write(backup,"manifest.json",journal.toString().toByteArray(Charsets.UTF_8))
        require(fingerprint(current(root))==args.expected) { "Le jeu a changé pendant la copie de secours." }
        write(root,PENDING,journal.toString().toByteArray(Charsets.UTF_8))
        try {
            replace(root,next);require(fingerprint(current(root))==fingerprint(next)) { "Vérification de l’installation WOLF échouée." };remove(root,PENDING)
        } catch(e: Exception) {
            try {restore(root)}catch(rollback: Exception){error("${e.message} Restauration WOLF requise : ${rollback.message}")}
            error("${e.message} Fichiers précédents restaurés.")
        }
        return inspect(root)
    }
    fun restore(root: DocumentFile) {
        val marker=root.toolkitChild(PENDING) ?: return
        val journal=JSONObject(read(marker,65536).toString(Charsets.UTF_8));val previous=state(root,journal)
        replace(root,previous);require(fingerprint(current(root))==journal.getString("fingerprint")) { "Restauration WOLF incorrecte." };require(marker.delete())
    }
}
