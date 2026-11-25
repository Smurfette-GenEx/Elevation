package com.elevation.reasoning.puzzle

import com.elevation.reasoning.puzzle.content.PuzzleCatalog
import com.elevation.reasoning.puzzle.geometry.Canonical
import com.elevation.reasoning.puzzle.model.AnswerOption
import com.elevation.reasoning.puzzle.model.PuzzleType
import com.elevation.reasoning.puzzle.validation.PuzzleValidator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Quality gate for the shipped content: every level must pass every check. */
class CatalogValidationTest {

    @Test
    fun catalogHasExactlyOneHundredLevelsInTenChapters() {
        assertEquals(100, PuzzleCatalog.puzzles.size)
        assertEquals(10, PuzzleCatalog.chapters.size)
        assertEquals((1..100).toList(), PuzzleCatalog.puzzles.map { it.level })
        PuzzleCatalog.chapters.forEach { ch ->
            assertEquals(10, PuzzleCatalog.puzzles.count { it.chapter == ch.number })
        }
    }

    @Test
    fun everyPuzzlePassesValidation() {
        val failures = PuzzleCatalog.specs.map { PuzzleValidator.validate(it) }.filterNot { it.ok }
        assertTrue(
            failures.joinToString("\n") { "L${it.puzzle.level} ${it.puzzle.title}: ${it.problems}" },
            failures.isEmpty(),
        )
    }

    @Test
    fun catalogLevelChecksPass() {
        val problems = PuzzleValidator.validateCatalog(PuzzleCatalog.specs)
        assertTrue(problems.joinToString("\n"), problems.isEmpty())
    }

    @Test
    fun correctOptionExistsAndIsUnique() {
        for (p in PuzzleCatalog.puzzles) {
            assertTrue("L${p.level}", p.correctIndex in p.options.indices)
            val figures = p.options.filterIsInstance<AnswerOption.FigureOption>().map { Canonical.key(it.figure) }
            assertEquals("L${p.level} duplicate options", figures.size, figures.toSet().size)
        }
    }

    @Test
    fun noSolverExemptions() {
        // Every puzzle is verified by the independent solver; none relies on an exemption.
        assertTrue(PuzzleCatalog.specs.none { it.exemptFromSolver != null })
    }

    @Test
    fun allSixFormatsAreUsed() {
        PuzzleType.entries.forEach { t -> assertTrue(t.name, PuzzleCatalog.puzzles.count { it.type == t } >= 6) }
    }

    @Test
    fun difficultyRisesAcrossChapters() {
        val avg = (1..10).map { ch -> PuzzleCatalog.puzzles.filter { it.chapter == ch }.map { it.difficulty }.average() }
        avg.zipWithNext().forEach { (a, b) -> assertTrue("$a -> $b", b >= a) }
        assertTrue(avg.first() < avg.last())
    }

    @Test
    fun hintsNeverGiveTheAnswerAwayVerbatim() {
        for (p in PuzzleCatalog.puzzles) {
            p.hints.forEach { h -> assertTrue("L${p.level}", !p.explanation.startsWith(h)) }
        }
    }
}
