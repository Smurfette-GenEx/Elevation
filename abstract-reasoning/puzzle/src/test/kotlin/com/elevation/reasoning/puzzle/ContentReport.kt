package com.elevation.reasoning.puzzle

import com.elevation.reasoning.puzzle.content.PuzzleCatalog
import com.elevation.reasoning.puzzle.validation.PuzzleValidator
import org.junit.Test

/** Prints a full validation report (useful while authoring); never fails. */
class ContentReport {
    @Test
    fun report() {
        val only = System.getProperty("levels")?.takeIf { it.isNotBlank() }?.split(",")?.map { it.trim().toInt() }?.toSet()
        for (spec in PuzzleCatalog.specs) {
            if (only != null && spec.puzzle.level !in only) continue
            val r = PuzzleValidator.validate(spec)
            if (!r.ok) {
                println("✗ L${spec.puzzle.level} ${spec.puzzle.title}: ${r.problems}")
                r.analysis?.let { println(it.describe().prependIndent("      ")) }
            } else if (only != null) {
                println("✓ L${spec.puzzle.level}")
                r.analysis?.let { println(it.describe().prependIndent("      ")) }
            }
        }
        println("catalog: " + PuzzleValidator.validateCatalog(PuzzleCatalog.specs))
    }
}
