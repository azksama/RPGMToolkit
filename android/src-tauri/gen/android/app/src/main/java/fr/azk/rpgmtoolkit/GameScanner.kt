package fr.azk.rpgmtoolkit

data class ScanEntry<T>(val node: T, val name: String, val directory: Boolean)
data class ScanCandidate<T>(val node: T, val path: String, val legacy: Boolean, val wolf: Boolean = false)
data class ScanReport<T>(val games: List<ScanCandidate<T>>, val warnings: List<String>)

class GameScanner<T>(
    private val children: (T) -> List<ScanEntry<T>>,
    private val identity: (T) -> String,
    private val maxDirectories: Int = 4000,
    private val maxDepth: Int = 32,
    private val maxGames: Int = 500
) {
    fun scan(root: T, name: String, progress: (Int) -> Unit = {}): ScanReport<T> {
        data class Pending<T>(val node: T, val path: String, val depth: Int)
        val queue = java.util.ArrayDeque<Pending<T>>()
        val seen = mutableSetOf<String>()
        val games = mutableListOf<ScanCandidate<T>>()
        val warnings = mutableListOf<String>()
        val listings = mutableMapOf<String, List<ScanEntry<T>>>()
        fun read(node: T) = listings.getOrPut(identity(node)) { children(node) }
        val ignored = setOf(".rpgm-toolkit-backups", ".git", "node_modules")
        val assets = setOf("js", "data", "img", "audio", "movies", "fonts", "save", "saves")
        queue.add(Pending(root, name, 0))
        while (queue.isNotEmpty()) {
            if (seen.size >= maxDirectories || games.size >= maxGames) {
                warnings.add("Limite d’analyse atteinte. Ajoutez les sous-dossiers restants séparément.")
                break
            }
            val next = queue.removeFirst()
            if (!seen.add(identity(next.node))) continue
            progress(seen.size)
            try {
                val entries = read(next.node)
                val js = entries.firstOrNull { it.directory && it.name.equals("js", true) }
                val names = js?.let { read(it.node).filter { child -> !child.directory }.map { child -> child.name.lowercase(java.util.Locale.ROOT) }.toSet() } ?: emptySet()
                val candidate = names.any { it in setOf("rpg_core.js", "rmmz_core.js", "plugins.js") }
                val data = if(candidate) null else entries.firstOrNull { it.directory && it.name.equals("Data",true) }?.let { read(it.node) }
                val basic = data?.firstOrNull { it.directory && it.name.equals("BasicData",true) }?.let { read(it.node) }
                val wolf = !candidate && (entries.any { !it.directory && it.name.lowercase() in setOf("data.wolf","data.wolfx",".rpgm-toolkit-wolf-pending.json") } || data?.any { it.name.lowercase() in setOf("basicdata.wolf","basicdata.wolfx") }==true || basic?.any { it.name.equals("CommonEvent.dat",true) }==true)
                val legacy = !candidate && !wolf && entries.any { !it.directory && (it.name.endsWith(".rgss3a", true) || it.name.endsWith(".rgss2a", true) || it.name.endsWith(".rgssad", true) || it.name.equals("RPG_RT.ldb", true) || it.name.equals("Game.ini", true)) }
                if (candidate || legacy || wolf) games.add(ScanCandidate(next.node, next.path, legacy, wolf))
                val directories = entries.filter { it.directory && it.name.lowercase(java.util.Locale.ROOT) !in ignored && (!(candidate || legacy || wolf) || it.name.lowercase(java.util.Locale.ROOT) !in assets) }
                if (next.depth >= maxDepth) {
                    if (directories.isNotEmpty()) warnings.add("${next.path} : profondeur maximale atteinte.")
                } else directories.sortedBy { it.name }.forEach { queue.add(Pending(it.node, "${next.path}/${it.name}", next.depth + 1)) }
            } catch (e: Exception) {
                warnings.add("${next.path} : ${e.message ?: "lecture impossible"}")
            }
        }
        return ScanReport(games, warnings)
    }
}
