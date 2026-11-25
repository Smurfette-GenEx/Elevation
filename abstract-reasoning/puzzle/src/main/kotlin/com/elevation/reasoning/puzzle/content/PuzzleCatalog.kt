package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.model.Chapter
import com.elevation.reasoning.puzzle.model.Puzzle

/** The complete, ordered set of levels and chapters shipped with the game. */
object PuzzleCatalog {

    val chapters: List<Chapter> = listOf(
        Chapter(1, "Visual Foundations", "See one change at a time", listOf("Shape", "Colour", "Size", "Quantity", "Rotation")),
        Chapter(2, "Sequences & Transformations", "Follow changes step by step", listOf("Rotation direction", "Position", "Two simple rules")),
        Chapter(3, "Spatial Reasoning", "Mirrors, turns and positions", listOf("Reflection", "Symmetry", "Orientation", "Movement")),
        Chapter(4, "Logical Matrices", "Rows and columns hold the key", listOf("2×2 and 3×3 grids", "Row rules", "Column rules")),
        Chapter(5, "Multiple Rules", "Several patterns at once", listOf("Independent attributes", "Alternation", "Intersections")),
        Chapter(6, "Complex Transformations", "Combine, subtract and nest", listOf("Superposition", "Subtraction", "Nested cycles")),
        Chapter(7, "Advanced Induction", "Find the hidden relationship", listOf("Hidden links", "Non-linear growth", "Matrix algebra")),
        Chapter(8, "Abstract Logic", "Reason with symbols", listOf("Symbolic mapping", "Multi-step deduction", "Dependencies")),
        Chapter(9, "Expert Challenges", "Three rules and more", listOf("Many attributes", "Irregular rhythms", "Spatial composites")),
        Chapter(10, "Mastermind", "Everything you have learned", listOf("Interacting rules", "Long deductions", "Final challenge")),
    )

    /** Authoring specs including validation metadata. */
    val specs: List<PuzzleSpec> by lazy {
        listOf(chapter01, chapter02, chapter03, chapter04, chapter05, chapter06, chapter07, chapter08, chapter09, chapter10).flatten().sortedBy { it.puzzle.level }
    }

    val puzzles: List<Puzzle> by lazy { specs.map { it.puzzle } }

    fun puzzle(level: Int): Puzzle = puzzles.first { it.level == level }

    fun chapterOf(level: Int): Chapter = chapters[(level - 1) / Puzzle.LEVELS_PER_CHAPTER]

    val levelCount: Int get() = puzzles.size
}
