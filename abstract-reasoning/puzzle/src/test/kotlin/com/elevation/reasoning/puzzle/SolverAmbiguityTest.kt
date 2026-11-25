package com.elevation.reasoning.puzzle

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.Ink
import com.elevation.reasoning.puzzle.model.ShapeKind
import com.elevation.reasoning.puzzle.solver.MatrixSolver
import com.elevation.reasoning.puzzle.solver.PredicateSolver
import com.elevation.reasoning.puzzle.solver.RelationSolver
import com.elevation.reasoning.puzzle.solver.SequenceSolver
import org.junit.Assert.assertEquals
import org.junit.Test

/** The solver must detect puzzles with more than one defensible answer. */
class SolverAmbiguityTest {
    private fun f(shape: ShapeKind, rot: Int = 0, ink: Ink = Ink.PRIMARY, fill: Fill = Fill.SOLID) =
        Figure(Element(shape, ink, fill, rotation = rot))

    private fun dots(n: Int) = Figure((0 until n).map { Element(ShapeKind.CIRCLE, size = 0.1f, x = -0.6f + 0.3f * it) })

    @Test
    fun clearArithmeticSequenceHasOneAnswer() {
        val a = SequenceSolver.analyse(listOf(dots(1), dots(2), dots(3)), listOf(dots(4), dots(5), dots(3)))
        assertEquals(setOf(0), a.explainable)
    }

    @Test
    fun twoFramesAreTooFewToDecide() {
        // 1, 2 could continue as 3 (+1) or 4 (×2): nothing should be ruled in with confidence,
        // so the solver must not single out one option.
        val a = SequenceSolver.analyse(listOf(dots(1), dots(2)), listOf(dots(3), dots(4)))
        assertEquals(setOf(0, 1), a.explainable)
    }

    @Test
    fun growthRulesNeedEnoughEvidence() {
        // 1, 2, 4: doubling gives 8, growing gaps (+1, +2) give 7.
        val a = SequenceSolver.analyse(listOf(dots(1), dots(2), dots(4)), listOf(dots(8), dots(7), dots(5)))
        assertEquals(setOf(0), a.explainable) // only doubling is a 3-term rule; growing gaps need 4 terms
        val b = SequenceSolver.analyse(listOf(dots(1), dots(2), dots(4), dots(8)), listOf(dots(16), dots(15), dots(9)))
        assertEquals(setOf(0), b.explainable)
    }

    @Test
    fun invisibleRotationIsNotADifferentAnswer() {
        // A square rotated by 90° looks identical, so both options are the same picture.
        val frames = listOf(f(ShapeKind.SQUARE), f(ShapeKind.CIRCLE), f(ShapeKind.SQUARE), f(ShapeKind.CIRCLE))
        val a = SequenceSolver.analyse(frames, listOf(f(ShapeKind.SQUARE, 90), f(ShapeKind.SQUARE, 0)))
        assertEquals(setOf(0, 1), a.explainable)
    }

    @Test
    fun matrixLatinSquareResolvesUniquely() {
        val s = listOf(ShapeKind.CIRCLE, ShapeKind.SQUARE, ShapeKind.TRIANGLE)
        val cells = (0 until 9).map { i -> if (i == 8) null else f(s[(i / 3 + i % 3) % 3]) }
        val a = MatrixSolver.analyse(3, 3, cells, listOf(f(ShapeKind.SQUARE), f(ShapeKind.CIRCLE), f(ShapeKind.TRIANGLE)))
        assertEquals(setOf(0), a.explainable)
    }

    @Test
    fun oddOneOutWithTwoOddFiguresIsAmbiguous() {
        val figures = listOf(f(ShapeKind.SQUARE), f(ShapeKind.SQUARE), f(ShapeKind.SQUARE, ink = Ink.TEAL), f(ShapeKind.SQUARE, fill = Fill.OUTLINE))
        assertEquals(setOf(2, 3), PredicateSolver.oddOneOut(figures).explainable)
    }

    @Test
    fun relationOptionsThatBehaveAlikeAreBothAccepted() {
        // On an arrow, a top–bottom mirror and a half turn give the same picture.
        val examples = listOf(f(ShapeKind.ARROW) to Transform.Rotate(180).apply(f(ShapeKind.ARROW)))
        val a = RelationSolver.analyseTransforms(examples, listOf(Transform.Rotate(180), Transform.Reflect(Axis.HORIZONTAL), Transform.Rotate(90)))
        assertEquals(setOf(0, 1), a.explainable)
    }

    @Test
    fun ruleDeductionRejectsUnderdeterminedExamples() {
        // Positives: 3 navy items. Negative: 3 teal items. Is the rule "navy" or also "three items"?
        fun trio(ink: Ink, n: Int = 3) = Figure((0 until n).map { Element(ShapeKind.CIRCLE, ink, size = 0.2f, x = -0.5f + 0.5f * it) })
        val a = PredicateSolver.ruleDeduction(listOf(trio(Ink.PRIMARY), trio(Ink.PRIMARY)), listOf(trio(Ink.TEAL)), listOf(trio(Ink.PRIMARY, 2), trio(Ink.TEAL, 2)))
        // Two navy items satisfy "all navy" (which explains the counter-example), so it is acceptable.
        assertEquals(setOf(0), a.explainable)
    }
}
