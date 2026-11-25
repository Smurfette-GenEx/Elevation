package com.elevation.reasoning.puzzle.validation

import com.elevation.reasoning.puzzle.content.PuzzleSpec
import com.elevation.reasoning.puzzle.geometry.Canonical
import com.elevation.reasoning.puzzle.geometry.ShapeGeometry
import com.elevation.reasoning.puzzle.model.AnswerOption
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Puzzle
import com.elevation.reasoning.puzzle.model.PuzzleBody
import com.elevation.reasoning.puzzle.model.PuzzleType
import com.elevation.reasoning.puzzle.solver.Analysis
import com.elevation.reasoning.puzzle.solver.MatrixSolver
import com.elevation.reasoning.puzzle.solver.PredicateSolver
import com.elevation.reasoning.puzzle.solver.RelationSolver
import com.elevation.reasoning.puzzle.solver.SequenceSolver

/**
 * Quality gate for puzzle content. A puzzle passes only if its metadata is complete, every figure
 * can be rendered inside its cell, its options are visually distinct, and an independent solver
 * finds exactly one defensible answer — the designated one.
 */
object PuzzleValidator {

    data class Report(val puzzle: Puzzle, val problems: List<String>, val analysis: Analysis?) {
        val ok get() = problems.isEmpty()
    }

    fun validate(spec: PuzzleSpec): Report {
        val p = spec.puzzle
        val problems = mutableListOf<String>()

        // Metadata.
        if (!Regex("L\\d{3}").matches(p.id)) problems += "bad id ${p.id}"
        if (p.level !in 1..100) problems += "level out of range"
        if (p.title.isBlank()) problems += "missing title"
        if (p.prompt.isBlank()) problems += "missing prompt"
        if (p.explanation.length < 30) problems += "explanation too short"
        if (p.hints.isEmpty() || p.hints.size > 3 || p.hints.any { it.isBlank() }) problems += "needs 1–3 hints"
        if (p.hints.any { it == p.explanation }) problems += "hint repeats the explanation"
        if (p.difficulty !in 1..10) problems += "difficulty must be 1..10"
        if (p.targetSeconds !in 10..600) problems += "target time out of range"

        // Options.
        if (p.options.size !in 4..5) problems += "needs 4 or 5 options, has ${p.options.size}"
        if (p.correctIndex !in p.options.indices) problems += "correct index out of range"
        val figureOptions = p.options.filterIsInstance<AnswerOption.FigureOption>().map { it.figure }
        val transformOptions = p.options.filterIsInstance<AnswerOption.TransformOption>().map { it.transform }
        if (figureOptions.isNotEmpty() && transformOptions.isNotEmpty()) problems += "mixed option kinds"
        val keys = figureOptions.map { Canonical.key(it) }
        if (keys.toSet().size != keys.size) problems += "two options look identical"

        // Rendering.
        allFigures(p).forEachIndexed { i, f -> renderProblem(f)?.let { problems += "figure $i: $it" } }

        // Body/type agreement and logical uniqueness.
        val analysis: Analysis? = when (val body = p.body) {
            is PuzzleBody.Sequence -> {
                if (p.type != PuzzleType.SEQUENCE && p.type != PuzzleType.MULTI_RULE) problems += "type/body mismatch"
                if (body.frames.size < 3) problems += "a sequence needs at least three frames"
                SequenceSolver.analyse(body.frames, figureOptions)
            }
            is PuzzleBody.Matrix -> {
                if (p.type != PuzzleType.MATRIX && p.type != PuzzleType.MULTI_RULE) problems += "type/body mismatch"
                if (body.cells.size != body.rows * body.cols || body.cells.count { it == null } != 1) problems += "matrix must have exactly one gap"
                MatrixSolver.analyse(body.rows, body.cols, body.cells, figureOptions)
            }
            is PuzzleBody.Transformation -> {
                if (p.type != PuzzleType.TRANSFORMATION) problems += "type/body mismatch"
                val expected = body.steps.fold(body.start) { f, t -> t.apply(f) }
                var prev = body.start
                body.steps.forEachIndexed { i, t ->
                    val next = t.apply(prev)
                    if (Canonical.same(prev, next)) problems += "step ${i + 1} (${t.label}) has no visible effect"
                    prev = next
                }
                Analysis(figureOptions.indices.filter { Canonical.same(figureOptions[it], expected) }.toSet(), emptyList())
            }
            PuzzleBody.OddOneOut -> {
                if (p.type != PuzzleType.ODD_ONE_OUT) problems += "type/body mismatch"
                PredicateSolver.oddOneOut(figureOptions)
            }
            is PuzzleBody.Relationship -> {
                if (p.type != PuzzleType.RELATIONSHIP) problems += "type/body mismatch"
                if (body.query != null) {
                    RelationSolver.analyseFigures(body.examples, body.query, figureOptions)
                } else {
                    // Distinct rules must also behave differently on the examples.
                    val results = transformOptions.map { t -> body.examples.joinToString("|") { Canonical.key(t.apply(it.first)) } }
                    if (results.toSet().size != results.size) problems += "two rule options behave identically"
                    RelationSolver.analyseTransforms(body.examples, transformOptions)
                }
            }
            is PuzzleBody.RuleDeduction -> {
                if (p.type != PuzzleType.MULTI_RULE) problems += "type/body mismatch"
                PredicateSolver.ruleDeduction(body.follows, body.breaks, figureOptions)
            }
        }

        if (spec.exemptFromSolver != null) {
            val v = spec.verify
            val correct = (p.options.getOrNull(p.correctIndex) as? AnswerOption.FigureOption)?.figure
            if (v == null || correct == null || !Canonical.same(v(), correct)) problems += "exempt puzzle: verifier disagrees with the answer"
        } else if (analysis != null && analysis.explainable != setOf(p.correctIndex)) {
            problems += "solver accepts options ${analysis.explainable.sorted()} but the answer is ${p.correctIndex}"
        }
        spec.verify?.let { v ->
            val correct = (p.options.getOrNull(p.correctIndex) as? AnswerOption.FigureOption)?.figure
            if (correct != null && !Canonical.same(v(), correct)) problems += "rule does not reproduce the answer"
        }
        return Report(p, problems, analysis)
    }

    /** Checks that apply to the catalogue as a whole. */
    fun validateCatalog(specs: List<PuzzleSpec>): List<String> {
        val problems = mutableListOf<String>()
        val puzzles = specs.map { it.puzzle }
        if (puzzles.size != 100) problems += "expected 100 puzzles, found ${puzzles.size}"
        if (puzzles.map { it.level }.sorted() != (1..100).toList()) problems += "levels must be exactly 1..100"
        if (puzzles.map { it.id }.toSet().size != puzzles.size) problems += "duplicate ids"
        val bodies = puzzles.map { bodyKey(it) }
        bodies.groupBy { it }.filterValues { it.size > 1 }.keys.forEach { k ->
            problems += "duplicate puzzle content: levels ${puzzles.filter { bodyKey(it) == k }.map { it.level }}"
        }
        val byChapter = puzzles.groupBy { it.chapter }.toSortedMap()
        val avg = byChapter.mapValues { (_, ps) -> ps.map { it.difficulty }.average() }
        avg.values.zipWithNext().forEachIndexed { i, (a, b) ->
            if (b < a) problems += "chapter ${i + 2} is easier on average than chapter ${i + 1}"
        }
        byChapter.forEach { (ch, ps) ->
            if (ps.map { it.type }.toSet().size < 2) problems += "chapter $ch uses a single question format"
        }
        PuzzleType.entries.forEach { t ->
            val n = puzzles.count { it.type == t }
            if (n < 6) problems += "format ${t.displayName} is used only $n times"
        }
        val positions = puzzles.groupingBy { it.correctIndex }.eachCount()
        positions.forEach { (pos, n) -> if (n > 40) problems += "answer position $pos used $n times" }
        (0..3).forEach { if ((positions[it] ?: 0) < 12) problems += "answer position $it used only ${positions[it] ?: 0} times" }
        return problems
    }

    private fun bodyKey(p: Puzzle): String = when (val b = p.body) {
        is PuzzleBody.Sequence -> "S" + b.frames.joinToString("/") { Canonical.key(it) }
        is PuzzleBody.Matrix -> "M" + b.cells.joinToString("/") { it?.let(Canonical::key) ?: "?" }
        is PuzzleBody.Transformation -> "T" + Canonical.key(b.start) + b.steps.joinToString { it.label }
        PuzzleBody.OddOneOut -> "O" + p.options.joinToString("/") { (it as? AnswerOption.FigureOption)?.figure?.let(Canonical::key) ?: "" }
        is PuzzleBody.Relationship -> "R" + b.examples.joinToString("/") { Canonical.key(it.first) + ">" + Canonical.key(it.second) }
        is PuzzleBody.RuleDeduction -> "D" + (b.follows + b.breaks).joinToString("/") { Canonical.key(it) }
    }

    fun allFigures(p: Puzzle): List<Figure> {
        val fromBody = when (val b = p.body) {
            is PuzzleBody.Sequence -> b.frames
            is PuzzleBody.Matrix -> b.cells.filterNotNull()
            is PuzzleBody.Transformation -> listOf(b.start)
            PuzzleBody.OddOneOut -> emptyList()
            is PuzzleBody.Relationship -> b.examples.flatMap { listOf(it.first, it.second) } + listOfNotNull(b.query)
            is PuzzleBody.RuleDeduction -> b.follows + b.breaks
        }
        return fromBody + p.options.filterIsInstance<AnswerOption.FigureOption>().map { it.figure }
    }

    /** A figure is renderable when it is non-empty or intentionally blank, and every element fits in the cell. */
    fun renderProblem(f: Figure): String? {
        for (e in f.elements) {
            if (e.size <= 0f) return "element with non-positive size"
            val b = ShapeGeometry.bounds(e)
            if (b[0] < -1.02f || b[1] < -1.02f || b[2] > 1.02f || b[3] > 1.02f) {
                return "${e.shape} at (${e.x}, ${e.y}) size ${e.size} spills outside the cell"
            }
        }
        return null
    }
}
