package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.model.AnswerOption
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.Ink
import com.elevation.reasoning.puzzle.model.Lattice
import com.elevation.reasoning.puzzle.model.Puzzle
import com.elevation.reasoning.puzzle.model.PuzzleBody
import com.elevation.reasoning.puzzle.model.PuzzleType
import com.elevation.reasoning.puzzle.model.ShapeKind
import com.elevation.reasoning.puzzle.model.Sizes
import java.util.Random

/**
 * A puzzle plus authoring metadata that only the validator needs.
 *
 * @property exemptFromSolver when non-null, the puzzle uses a rule outside the generic solver's
 *   vocabulary; the string documents the rule, and [verify] must reproduce the answer.
 */
data class PuzzleSpec(
    val puzzle: Puzzle,
    val exemptFromSolver: String? = null,
    val verify: (() -> Figure)? = null,
)

/** Shared descriptive metadata for every puzzle. */
data class Meta(
    val level: Int,
    val title: String,
    val difficulty: Int,
    val targetSeconds: Int,
    val explanation: String,
    val hints: List<String>,
    val concepts: List<String> = emptyList(),
)

// ---------------------------------------------------------------- element helpers

internal val N = Ink.PRIMARY
internal val T = Ink.TEAL
internal val G = Ink.GOLD
internal val C = Ink.CORAL
internal val SOLID = Fill.SOLID
internal val OUT = Fill.OUTLINE
internal val STRIPE = Fill.STRIPED

internal fun el(
    shape: ShapeKind,
    ink: Ink = N,
    fill: Fill = SOLID,
    size: Float = Sizes.L,
    rot: Int = 0,
    mir: Boolean = false,
    x: Float = 0f,
    y: Float = 0f,
    tag: String? = null,
) = Element(shape, ink, fill, size, rot, mir, x, y, tag)

internal fun fig(vararg e: Element, board: Boolean = false) = Figure(e.toList(), board)
internal fun fig(e: List<Element>, board: Boolean = false) = Figure(e, board)

/** Lattice cell index 0..8 (row-major) → (col, row). */
internal fun cellXY(i: Int) = Lattice.x(i % 3) to Lattice.y(i / 3)

/** Dice-style layouts on the 3×3 lattice for 1..9 items. */
internal val diceLayouts: Map<Int, List<Int>> = mapOf(
    1 to listOf(4),
    2 to listOf(0, 8),
    3 to listOf(0, 4, 8),
    4 to listOf(0, 2, 6, 8),
    5 to listOf(0, 2, 4, 6, 8),
    6 to listOf(0, 3, 6, 2, 5, 8),
    7 to listOf(0, 3, 6, 2, 5, 8, 4),
    8 to listOf(0, 1, 2, 3, 5, 6, 7, 8),
    9 to (0..8).toList(),
)

/** [n] identical items in a dice layout. */
internal fun dice(n: Int, shape: ShapeKind = ShapeKind.CIRCLE, ink: Ink = N, fill: Fill = SOLID, size: Float = Sizes.XS, rot: Int = 0): Figure =
    fig(diceLayouts.getValue(n).map { i -> val (x, y) = cellXY(i); el(shape, ink, fill, size, rot, x = x, y = y) })

/** Items at the given lattice cells (0..8, row-major). */
internal fun cells(indices: Collection<Int>, shape: ShapeKind = ShapeKind.CIRCLE, ink: Ink = N, fill: Fill = SOLID, size: Float = Sizes.XS, board: Boolean = true): Figure =
    fig(indices.sorted().map { i -> val (x, y) = cellXY(i); el(shape, ink, fill, size, x = x, y = y) }, board)

/** [n] items packed in a centred grid (used for counts above nine). */
internal fun cluster(n: Int, shape: ShapeKind = ShapeKind.CIRCLE, ink: Ink = N, fill: Fill = SOLID): Figure {
    val cols = when {
        n <= 1 -> 1
        n <= 4 -> 2
        n <= 9 -> 3
        else -> 4
    }
    val rows = (n + cols - 1) / cols
    val step = if (cols == 4) 0.44f else 0.6f
    val size = 0.14f
    return fig((0 until n).map { i ->
        val r = i / cols
        val inRow = if (r == rows - 1) n - r * cols else cols
        val c = i % cols
        val x = (c - (inRow - 1) / 2f) * step
        val y = (r - (rows - 1) / 2f) * step
        el(shape, ink, fill, size, x = x, y = y)
    })
}

/** [n] items in a horizontal row centred at height [y]. */
internal fun rowOf(n: Int, shape: ShapeKind, ink: Ink = N, fill: Fill = SOLID, size: Float = 0.1f, y: Float = 0f, spacing: Float = 0.26f): List<Element> =
    (0 until n).map { i -> el(shape, ink, fill, size, x = (i - (n - 1) / 2f) * spacing, y = y) }

/** Generates [count] successive values starting at [start]. */
internal fun <T> chain(count: Int, start: T, next: (T) -> T): List<T> =
    generateSequence(start, next).take(count).toList()

// ---------------------------------------------------------------- puzzle builders

private fun shuffledOptions(level: Int, answer: AnswerOption, distractors: List<AnswerOption>): Pair<List<AnswerOption>, Int> {
    val all = (listOf(answer) + distractors).toMutableList()
    val order = all.indices.toMutableList()
    order.shuffle(Random(level * 7919L + 17))
    val options = order.map { all[it] }
    return options to order.indexOf(0)
}

private fun build(
    m: Meta,
    type: PuzzleType,
    prompt: String,
    body: PuzzleBody,
    answer: AnswerOption,
    distractors: List<AnswerOption>,
): Puzzle {
    val (options, correct) = shuffledOptions(m.level, answer, distractors)
    return Puzzle(
        id = "L%03d".format(m.level),
        level = m.level,
        title = m.title,
        type = type,
        difficulty = m.difficulty,
        prompt = prompt,
        body = body,
        options = options,
        correctIndex = correct,
        explanation = m.explanation,
        hints = m.hints,
        targetSeconds = m.targetSeconds,
        concepts = m.concepts,
    )
}

private fun figs(list: List<Figure>) = list.map { AnswerOption.FigureOption(it) }

internal fun sequence(
    m: Meta,
    frames: List<Figure>,
    answer: Figure,
    distractors: List<Figure>,
    prompt: String = "Which figure comes next?",
    type: PuzzleType = PuzzleType.SEQUENCE,
) = PuzzleSpec(build(m, type, prompt, PuzzleBody.Sequence(frames), AnswerOption.FigureOption(answer), figs(distractors)))

/** A sequence generated by repeatedly applying [step]; the last generated frame is the answer. */
internal fun progression(
    m: Meta,
    start: Figure,
    shown: Int,
    distractors: (answer: Figure, frames: List<Figure>) -> List<Figure>,
    prompt: String = "Which figure comes next?",
    type: PuzzleType = PuzzleType.SEQUENCE,
    step: (Figure, Int) -> Figure,
): PuzzleSpec {
    val all = mutableListOf(start)
    for (i in 1..shown) all += step(all.last(), i)
    val frames = all.take(shown)
    val answer = all[shown]
    return sequence(m, frames, answer, distractors(answer, frames), prompt, type)
}

internal fun matrix(
    m: Meta,
    rows: Int,
    cols: Int,
    cell: (r: Int, c: Int) -> Figure,
    missing: Pair<Int, Int> = rows - 1 to cols - 1,
    distractors: (answer: Figure) -> List<Figure>,
    prompt: String = "Which figure completes the matrix?",
    type: PuzzleType = PuzzleType.MATRIX,
): PuzzleSpec {
    val grid = (0 until rows).flatMap { r -> (0 until cols).map { c -> cell(r, c) } }
    val missIdx = missing.first * cols + missing.second
    val answer = grid[missIdx]
    val cells = grid.mapIndexed { i, f -> if (i == missIdx) null else f }
    return PuzzleSpec(build(m, type, prompt, PuzzleBody.Matrix(rows, cols, cells), AnswerOption.FigureOption(answer), figs(distractors(answer))))
}

internal fun transformation(
    m: Meta,
    start: Figure,
    steps: List<Transform>,
    distractors: List<Figure>,
    prompt: String = "Apply every step in order. What is the result?",
): PuzzleSpec {
    val answer = steps.fold(start) { f, t -> t.apply(f) }
    return PuzzleSpec(
        build(m, PuzzleType.TRANSFORMATION, prompt, PuzzleBody.Transformation(start, steps), AnswerOption.FigureOption(answer), figs(distractors)),
        verify = { steps.fold(start) { f, t -> t.apply(f) } },
    )
}

internal fun oddOneOut(
    m: Meta,
    odd: Figure,
    others: List<Figure>,
    prompt: String = "Four figures share a hidden property. Which one does not?",
) = PuzzleSpec(build(m, PuzzleType.ODD_ONE_OUT, prompt, PuzzleBody.OddOneOut, AnswerOption.FigureOption(odd), figs(others)))

/** "A is to B as C is to ?" — the answer is [rule] applied to [query]. */
internal fun analogy(
    m: Meta,
    examples: List<Figure>,
    query: Figure,
    rule: Transform,
    distractors: (answer: Figure) -> List<Figure>,
    prompt: String = "The same change turns each figure into its partner. Which figure completes the last pair?",
): PuzzleSpec {
    val answer = rule.apply(query)
    val pairs = examples.map { it to rule.apply(it) }
    return PuzzleSpec(
        build(m, PuzzleType.RELATIONSHIP, prompt, PuzzleBody.Relationship(pairs, query), AnswerOption.FigureOption(answer), figs(distractors(answer))),
        verify = { rule.apply(query) },
    )
}

/** Which named rule turns each example into its partner? */
internal fun relation(
    m: Meta,
    examples: List<Figure>,
    rule: Transform,
    wrong: List<Transform>,
    prompt: String = "Which rule turns every left figure into its right figure?",
) = PuzzleSpec(
    build(
        m,
        PuzzleType.RELATIONSHIP,
        prompt,
        PuzzleBody.Relationship(examples.map { it to rule.apply(it) }, null),
        AnswerOption.TransformOption(rule),
        wrong.map { AnswerOption.TransformOption(it) },
    ),
)

internal fun ruleDeduction(
    m: Meta,
    follows: List<Figure>,
    breaks: List<Figure>,
    answer: Figure,
    distractors: List<Figure>,
    prompt: String = "The top figures obey the same hidden rules; the bottom figures each break one. Which option obeys the rules?",
) = PuzzleSpec(build(m, PuzzleType.MULTI_RULE, prompt, PuzzleBody.RuleDeduction(follows, breaks), AnswerOption.FigureOption(answer), figs(distractors)))
