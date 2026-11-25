package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.recolor
import com.elevation.reasoning.puzzle.engine.refill
import com.elevation.reasoning.puzzle.engine.reshape
import com.elevation.reasoning.puzzle.engine.resize
import com.elevation.reasoning.puzzle.engine.spin
import com.elevation.reasoning.puzzle.model.ShapeKind.ARROW
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.DIAMOND
import com.elevation.reasoning.puzzle.model.ShapeKind.FLAG
import com.elevation.reasoning.puzzle.model.ShapeKind.HEXAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.LINE
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.STAR
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE
import com.elevation.reasoning.puzzle.model.Sizes

private val latin3 = listOf(listOf(0, 1, 2), listOf(1, 2, 0), listOf(2, 0, 1))

internal fun lines(vararg angles: Int, size: Float = Sizes.L) = fig(angles.map { el(LINE, size = size, rot = it) })

/** Chapter 4 – Logical Matrices. */
internal val chapter04: List<PuzzleSpec> = listOf(
    matrix(
        Meta(
            31, "Rows and Columns", 4, 35,
            "Each row keeps the same shape, and each column keeps the same colour. The missing cell is in the square row and the teal column.",
            listOf("What do the figures in the top row have in common?", "Now look down each column."),
            listOf("2×2 matrix", "row rule", "column rule"),
        ),
        rows = 2, cols = 2,
        cell = { r, c -> fig(el(listOf(CIRCLE, SQUARE)[r], listOf(N, T)[c])) },
        distractors = { a -> listOf(a.recolor(N), a.reshape(CIRCLE), a.recolor(G)) },
    ),
    analogy(
        Meta(
            32, "Quarter Turn Across", 4, 40,
            "The arrow turns a quarter turn clockwise to become its partner. The upside-down flag gets the same quarter turn, so it ends up pointing left with its pole along the top.",
            listOf("What happens to the arrow between the two figures?", "Apply exactly the same change to the flag."),
            listOf("analogy", "rotation"),
        ),
        examples = listOf(fig(el(ARROW))),
        query = fig(el(FLAG, T, rot = 180)),
        rule = com.elevation.reasoning.puzzle.engine.Transform.Rotate(90),
        distractors = { a -> listOf(a.spin(-180), a.spin(-90), a.reshape(ARROW)) },
        prompt = "The arrow changes into its partner. Apply the same change to the flag.",
    ),
    matrix(
        Meta(
            33, "Shape by Row, Count by Column", 5, 45,
            "Every row uses one shape; every column has one more item than the column to its left (1, 2, 3).",
            listOf("Read the rows first, then the columns.", "The bottom row uses triangles. How many items does the third column have?"),
            listOf("3×3 matrix", "row rule", "column rule"),
        ),
        rows = 3, cols = 3,
        cell = { r, c -> dice(c + 1, listOf(CIRCLE, SQUARE, TRIANGLE)[r]) },
        distractors = { listOf(dice(2, TRIANGLE), dice(3, SQUARE), dice(4, TRIANGLE), dice(3, TRIANGLE, fill = OUT)) },
    ),
    matrix(
        Meta(
            34, "Each Once", 5, 40,
            "Every row and every column contains a circle, a square and a triangle exactly once. The bottom row already has a triangle and a circle.",
            listOf("Which shapes already appear in the last row?", "Each shape appears exactly once per row."),
            listOf("Latin square"),
        ),
        rows = 3, cols = 3,
        cell = { r, c -> fig(el(listOf(CIRCLE, SQUARE, TRIANGLE)[latin3[r][c]], size = Sizes.M)) },
        distractors = { a -> listOf(a.reshape(CIRCLE), a.reshape(TRIANGLE), a.reshape(DIAMOND)) },
    ),
    matrix(
        Meta(
            35, "Shape Rows, Fill Pattern", 5, 45,
            "Each row uses a single shape, and each row and column contains solid, striped and outlined fills once each. The middle row is diamonds and is missing its solid fill.",
            listOf("Separate the shape rule from the fill rule.", "Which fill is missing from the middle row?"),
            listOf("3×3 matrix", "Latin square", "two rules"),
        ),
        rows = 3, cols = 3,
        missing = 1 to 2,
        cell = { r, c -> fig(el(listOf(HEXAGON, DIAMOND, STAR)[r], fill = listOf(SOLID, STRIPE, OUT)[(c + r) % 3], size = Sizes.M)) },
        distractors = { a -> listOf(a.refill(STRIPE), a.refill(OUT), a.reshape(HEXAGON)) },
    ),
    matrix(
        Meta(
            36, "Adding Up", 5, 50,
            "In every row, the number of dots in the third cell equals the dots in the first two cells added together: 1+2=3, 2+2=4, 3+1=4.",
            listOf("Count the dots in each cell of the top row.", "How could the first two numbers produce the third?"),
            listOf("3×3 matrix", "arithmetic"),
        ),
        rows = 3, cols = 3,
        cell = { r, c -> dice(listOf(listOf(1, 2, 3), listOf(2, 2, 4), listOf(3, 1, 4))[r][c]) },
        distractors = { listOf(dice(3), dice(5), dice(2)) },
    ),
    matrix(
        Meta(
            37, "Turning Grid", 5, 50,
            "Along each row the arrow turns 45° clockwise per step; down each column it turns 90° clockwise. From the bottom-left cell (pointing down) two 45° steps give an arrow pointing left.",
            listOf("How much does the arrow turn from one column to the next?", "Check that the same rule works in every row."),
            listOf("3×3 matrix", "rotation"),
        ),
        rows = 3, cols = 3,
        cell = { r, c -> fig(el(ARROW, size = Sizes.M, rot = r * 90 + c * 45)) },
        distractors = { a -> listOf(a.spin(-45), a.spin(45), a.spin(-135)) },
    ),
    matrix(
        Meta(
            38, "Shrinking Rows", 6, 50,
            "Each row contains a circle, a square and a triangle once, and the shapes get smaller from the top row to the bottom row.",
            listOf("Compare sizes from top to bottom.", "Which shape is still missing from the bottom row?"),
            listOf("3×3 matrix", "Latin square", "size"),
        ),
        rows = 3, cols = 3,
        missing = 2 to 1,
        cell = { r, c -> fig(el(listOf(CIRCLE, SQUARE, TRIANGLE)[latin3[r][c]], size = listOf(Sizes.L, Sizes.M, Sizes.S)[r])) },
        distractors = { a -> listOf(a.resize(Sizes.M), a.reshape(SQUARE), a.reshape(TRIANGLE)) },
    ),
    matrix(
        Meta(
            39, "Two Latin Squares", 6, 55,
            "Shapes and colours each follow their own once-per-row, once-per-column pattern. The missing cell needs the shape and the colour that are absent from both its row and its column.",
            listOf("Solve the shape first, ignoring colour.", "Then solve the colour, ignoring shape."),
            listOf("3×3 matrix", "Latin square", "two rules"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            fig(el(listOf(CIRCLE, SQUARE, TRIANGLE)[latin3[r][c]], listOf(N, T, G)[(c - r + 3) % 3], size = Sizes.M))
        },
        distractors = { a -> listOf(a.recolor(G), a.reshape(CIRCLE), a.recolor(T)) },
    ),
    matrix(
        Meta(
            40, "Overlay", 6, 55,
            "The third cell of each row is the first two cells laid on top of each other. In the bottom row that gives three lines.",
            listOf("Compare the top row's third cell with its first two cells.", "Nothing disappears; lines are only combined."),
            listOf("3×3 matrix", "superposition"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            listOf(
                listOf(lines(0), lines(90), lines(0, 90)),
                listOf(lines(45), lines(135), lines(45, 135)),
                listOf(lines(0, 45), lines(90), lines(0, 45, 90)),
            )[r][c]
        },
        distractors = { listOf(lines(0, 90), lines(0, 45, 90, 135), lines(45, 90)) },
    ),
)

