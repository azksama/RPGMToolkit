package fr.azk.rpgmtoolkit

import org.junit.Assert.*
import org.junit.Test

class GameScannerTest {
    private class Node(val name: String, val directory: Boolean = true) {
        val entries = mutableListOf<Node>()
        var denied = false
        fun dir(name: String) = Node(name).also { entries.add(it) }
        fun file(name: String) { entries.add(Node(name, false)) }
        fun game(mz: Boolean = false) { dir("js").apply { file(if (mz) "rmmz_core.js" else "rpg_core.js"); file("plugins.js") } }
    }
    private fun scanner(depth: Int = 32, limit: Int = 4000, visited: MutableList<Node> = mutableListOf()) = GameScanner<Node>(
        children = { node -> visited.add(node); check(!node.denied) { "Lecture refusée" }; node.entries.map { ScanEntry(it, it.name, it.directory) } },
        identity = { System.identityHashCode(it).toString() }, maxDepth = depth, maxDirectories = limit
    )
    @Test fun nestedGamesAndWwwAreFoundWithoutTraversingAssetsOrBackups() {
        val root = Node("Games")
        val mv = root.dir("Collection").dir("A").dir("www").apply { game() }
        val mz = root.dir("B").apply { game(true) }
        val img = mv.dir("img").apply { dir("Tiles").game() }
        root.dir(".rpgm-toolkit-backups").dir("old").game()
        val visited = mutableListOf<Node>()
        val report = scanner(visited = visited).scan(root, root.name)
        assertEquals(setOf(mv,mz),report.games.map { it.node }.toSet())
        assertFalse(visited.contains(img))
        assertTrue(report.warnings.isEmpty())
        assertTrue(report.games.any { it.path == "Games/Collection/A/www" })
    }
    @Test fun brokenLegacyAndUnreadableGamesDoNotHideOtherGames() {
        val root = Node("Games")
        root.dir("Broken").dir("js").file("rpg_core.js")
        root.dir("Legacy").file("Game.rgss3a")
        root.dir("Denied").denied = true
        root.dir("Valid").game()
        val report = scanner().scan(root, root.name)
        assertEquals(3,report.games.size)
        assertEquals(1,report.games.count { it.legacy })
        assertEquals(1,report.warnings.size)
    }
    @Test fun repeatedDocumentIdsAreVisitedOnceAndLimitsAreReported() {
        val root = Node("Games")
        val game = root.dir("A").apply { game() }
        root.entries.add(game)
        game.entries.add(root)
        assertEquals(1,scanner().scan(root,root.name).games.size)
        assertTrue(scanner(limit = 1).scan(root,root.name).warnings.isNotEmpty())
        assertTrue(scanner(depth = 0).scan(root,root.name).warnings.isNotEmpty())
    }
}
