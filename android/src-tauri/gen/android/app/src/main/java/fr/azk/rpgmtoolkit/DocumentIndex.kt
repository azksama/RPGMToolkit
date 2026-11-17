package fr.azk.rpgmtoolkit

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import androidx.documentfile.provider.ToolkitDocumentFile

object DocumentQueries {
    private val active = ThreadLocal<DocumentIndex>()

    fun <T> scoped(context: Context, report: (DocumentIndex.Metrics) -> Unit = {}, action: () -> T): T {
        val previous = active.get()
        val index = DocumentIndex(context.applicationContext)
        active.set(index)
        try { return action() } finally { report(index.metrics); active.set(previous) }
    }

    internal fun index(context: Context) = active.get() ?: DocumentIndex(context.applicationContext)
    fun refresh() { active.get()?.clear() }
    fun wrap(context: Context, document: DocumentFile): DocumentFile =
        if (document.uri.scheme == "content") IndexedDocument(context.applicationContext, document.uri, null) else document
}

class DocumentIndex(private val context: Context) {
    data class Metadata(val name: String, val type: String, val flags: Int, val size: Long, val modified: Long)
    data class Metrics(var queries: Int = 0, var hits: Int = 0)
    val metrics = Metrics()
    private val metadata = object : LinkedHashMap<Uri, Metadata>(128, .75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Uri, Metadata>?) = size > 16_384
    }
    private val directories = object : LinkedHashMap<Uri, Array<DocumentFile>>(64, .75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Uri, Array<DocumentFile>>?) = size > 128
    }
    private val columns = arrayOf(
        DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_FLAGS,
        DocumentsContract.Document.COLUMN_SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED
    )

    fun clear() { metadata.clear(); directories.clear() }
    fun invalidate(uri: Uri, parent: Uri?) { metadata.remove(uri); directories.remove(uri); parent?.let { directories.remove(it) } }

    private fun row(cursor: android.database.Cursor) = Metadata(
        cursor.getString(1) ?: "", cursor.getString(2) ?: "", cursor.getInt(3),
        if (cursor.isNull(4)) 0 else cursor.getLong(4), if (cursor.isNull(5)) 0 else cursor.getLong(5)
    )

    fun metadata(uri: Uri): Metadata? {
        metadata[uri]?.let { metrics.hits++; return it }
        metrics.queries++
        return context.contentResolver.query(uri, columns, null, null, null)?.use {
            if (!it.moveToFirst()) null else row(it).also { value -> metadata[uri] = value }
        }
    }

    fun children(parent: IndexedDocument): Array<DocumentFile> {
        directories[parent.uri]?.let { metrics.hits++; return it.copyOf() }
        val query = DocumentsContract.buildChildDocumentsUriUsingTree(parent.uri, DocumentsContract.getDocumentId(parent.uri))
        val found = mutableListOf<DocumentFile>()
        metrics.queries++
        (context.contentResolver.query(query, columns, null, null, null) ?: error("Lecture du dossier impossible.")).use { cursor ->
            while (cursor.moveToNext()) {
                require(found.size < 100_000) { "Trop d’entrées dans ce dossier." }
                val uri = DocumentsContract.buildDocumentUriUsingTree(parent.uri, cursor.getString(0))
                metadata[uri] = row(cursor)
                found.add(IndexedDocument(context, uri, parent))
            }
        }
        return found.toTypedArray().also { if (it.size <= 4096) directories[parent.uri] = it }
    }
}

class IndexedDocument(private val context: Context, private var documentUri: Uri, parent: DocumentFile?) : ToolkitDocumentFile(parent) {
    private fun index() = DocumentQueries.index(context)
    private fun meta() = index().metadata(documentUri)
    private fun granted(flag: Int) = context.checkCallingOrSelfUriPermission(documentUri, flag) == PackageManager.PERMISSION_GRANTED
    override fun getUri() = documentUri
    override fun getName() = meta()?.name
    override fun getType() = meta()?.type?.takeUnless { it == DocumentsContract.Document.MIME_TYPE_DIR }
    override fun isDirectory() = meta()?.type == DocumentsContract.Document.MIME_TYPE_DIR
    override fun isFile() = meta()?.type?.let { it.isNotEmpty() && it != DocumentsContract.Document.MIME_TYPE_DIR } == true
    override fun isVirtual() = (meta()?.flags ?: 0) and DocumentsContract.Document.FLAG_VIRTUAL_DOCUMENT != 0
    override fun exists() = meta() != null
    override fun length() = meta()?.size ?: 0L
    override fun lastModified() = meta()?.modified ?: 0L
    override fun canRead() = granted(Intent.FLAG_GRANT_READ_URI_PERMISSION) && !meta()?.type.isNullOrEmpty()
    override fun canWrite(): Boolean {
        if (!granted(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)) return false
        val data = meta() ?: return false
        return data.flags and DocumentsContract.Document.FLAG_SUPPORTS_DELETE != 0 ||
            data.flags and DocumentsContract.Document.FLAG_SUPPORTS_WRITE != 0 ||
            (data.type == DocumentsContract.Document.MIME_TYPE_DIR && data.flags and DocumentsContract.Document.FLAG_DIR_SUPPORTS_CREATE != 0)
    }
    override fun listFiles() = index().children(this)
    override fun createFile(mimeType: String, displayName: String): DocumentFile? {
        val uri = DocumentsContract.createDocument(context.contentResolver, documentUri, mimeType, displayName) ?: return null
        index().invalidate(documentUri, parentFile?.uri)
        return IndexedDocument(context, uri, this)
    }
    override fun createDirectory(displayName: String) = createFile(DocumentsContract.Document.MIME_TYPE_DIR, displayName)
    override fun delete(): Boolean {
        val removed = DocumentsContract.deleteDocument(context.contentResolver, documentUri)
        if (removed) index().invalidate(documentUri, parentFile?.uri)
        return removed
    }
    override fun renameTo(displayName: String): Boolean {
        val renamed = DocumentsContract.renameDocument(context.contentResolver, documentUri, displayName) ?: return false
        index().invalidate(documentUri, parentFile?.uri)
        documentUri = renamed
        return true
    }
}
