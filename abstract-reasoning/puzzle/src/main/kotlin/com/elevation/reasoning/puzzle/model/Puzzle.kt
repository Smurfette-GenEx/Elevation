package com.elevation.reasoning.puzzle.model

import com.elevation.reasoning.puzzle.engine.Transform

/** The six supported question formats. */
enum class PuzzleType(val displayName: String, val code: Char) {
    SEQUENCE("Sequence completion", 'A'),
    MATRIX("Missing matrix", 'B'),
    TRANSFORMATION("Transformation logic", 'C'),
    ODD_ONE_OUT("Odd one out", 'D'),
    RELATIONSHIP("Visual relationship", 'E'),
    MULTI_RULE("Multi-rule deduction", 'F'),
}

/** What the player looks at above the answer choices. */
sealed interface PuzzleBody {
    /** Shown frames; the next frame is the answer. */
    data class Sequence(val frames: List<Figure>) : PuzzleBody

    /** Row-major cells; exactly one is null (the missing cell). */
    data class Matrix(val rows: Int, val cols: Int, val cells: List<Figure?>) : PuzzleBody {
        val missingIndex: Int get() = cells.indexOfFirst { it == null }
    }

    /** Start figure followed by transformation steps applied in order. */
    data class Transformation(val start: Figure, val steps: List<Transform>) : PuzzleBody

    /** The figures are the answer options themselves; nothing extra is displayed. */
    data object OddOneOut : PuzzleBody

    /** Example pairs (before → after) and, optionally, a query figure whose "after" is asked. */
    data class Relationship(val examples: List<Pair<Figure, Figure>>, val query: Figure?) : PuzzleBody

    /** Figures that follow the hidden rules and figures that break them. */
    data class RuleDeduction(val follows: List<Figure>, val breaks: List<Figure>) : PuzzleBody
}

/** An answer choice: a figure, or a named transformation for relationship questions. */
sealed interface AnswerOption {
    data class FigureOption(val figure: Figure) : AnswerOption
    data class TransformOption(val transform: Transform) : AnswerOption {
        val label: String get() = transform.label
    }
}

/**
 * A complete, playable puzzle.
 *
 * @property difficulty 1 (easiest) to 10 (hardest).
 * @property targetSeconds time within which a hint-free correct answer earns three stars.
 * @property hints ordered from gentle nudge to strong guidance; never the answer itself.
 */
data class Puzzle(
    val id: String,
    val level: Int,
    val title: String,
    val type: PuzzleType,
    val difficulty: Int,
    val prompt: String,
    val body: PuzzleBody,
    val options: List<AnswerOption>,
    val correctIndex: Int,
    val explanation: String,
    val hints: List<String>,
    val targetSeconds: Int,
    val concepts: List<String> = emptyList(),
) {
    val chapter: Int get() = (level - 1) / LEVELS_PER_CHAPTER + 1
    val levelInChapter: Int get() = (level - 1) % LEVELS_PER_CHAPTER + 1

    fun isCorrect(optionIndex: Int) = optionIndex == correctIndex

    companion object {
        const val LEVELS_PER_CHAPTER = 10
    }
}

/** Static description of a chapter. */
data class Chapter(
    val number: Int,
    val title: String,
    val subtitle: String,
    val focus: List<String>,
) {
    val levels: IntRange get() = ((number - 1) * Puzzle.LEVELS_PER_CHAPTER + 1)..(number * Puzzle.LEVELS_PER_CHAPTER)
}
