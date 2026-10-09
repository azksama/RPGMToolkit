package fr.azk.rpgmtoolkit

import androidx.documentfile.provider.DocumentFile

object WolfSession {
    @Volatile var root: DocumentFile? = null
    @Volatile var awaitingPermission = false
}
