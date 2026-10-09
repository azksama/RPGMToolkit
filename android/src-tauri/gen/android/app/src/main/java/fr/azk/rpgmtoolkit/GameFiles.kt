package fr.azk.rpgmtoolkit

import androidx.documentfile.provider.DocumentFile

fun DocumentFile.toolkitChild(name: String): DocumentFile? {
    val matches = listFiles().filter { it.name.equals(name, ignoreCase = true) }
    require(matches.size <= 1) { "Plusieurs fichiers correspondent à $name." }
    return matches.firstOrNull()
}
