package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.at
import com.elevation.reasoning.puzzle.engine.spin
import com.elevation.reasoning.puzzle.model.ShapeKind
import com.elevation.reasoning.puzzle.model.ShapeKind.ARROW
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.FLAG
import com.elevation.reasoning.puzzle.model.ShapeKind.HEPTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.HEXAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.OCTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.PENTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE
import com.elevation.reasoning.puzzle.model.Sizes

private fun framed(shape: ShapeKind, dots: Int) = fig(
    listOf(el(shape, N, OUT, Sizes.XL, tag = "frame")) + rowOf(dots, CIRCLE, T, size = 0.08f, y = if (shape == TRIANGLE) 0.15f else 0.05f, spacing = 0.2f),
)

private fun nested(outer: ShapeKind, outerInk: com.elevation.reasoning.puzzle.model.Ink, inner: ShapeKind, innerInk: com.elevation.reasoning.puzzle.model.Ink, inside: Boolean = true) =
    if (inside) {
        fig(el(outer, outerInk, OUT, Sizes.L), el(inner, innerInk, SOLID, 0.26f))
    } else {
        fig(el(outer, outerInk, OUT, Sizes.M, x = -0.3f), el(inner, innerInk, SOLID, 0.2f, x = 0.72f, y = 0.6f))
    }

private fun container(outer: ShapeKind, a: ShapeKind, b: ShapeKind) = fig(
    el(outer, N, OUT, Sizes.XL),
    el(a, T, SOLID, 0.24f, x = -0.26f, y = -0.2f),
    el(b, T, SOLID, 0.24f, x = 0.28f, y = 0.22f),
)

private fun three(arrow: Int, col: Int, ink: com.elevation.reasoning.puzzle.model.Ink) = fig(
    el(ARROW, size = 0.26f, rot = arrow, tag = "arrow").at(0, 0),
    el(SQUARE, ink, size = 0.22f, tag = "square").at(2, 0),
    el(CIRCLE, C, size = 0.22f, tag = "circle").at(col, 2),
    board = true,
)

private fun accel(rot: Int, fill: com.elevation.reasoning.puzzle.model.Fill, mirrored: Boolean = false) =
    fig(el(FLAG, T, fill, Sizes.M, rot = rot, mir = mirrored))

/** Chapter 7 – Advanced Inductive Reasoning. */
internal val chapter07: List<PuzzleSpec> = listOf(
    matrix(
        Meta(
            61, "Sum and Shape", 7, 65,
            "In each row the third cell holds as many items as the first two together, and each row and column holds circles, squares and triangles once each.",
            listOf("Count the items across the top row.", "Then work out which shape is missing from the bottom row."),
            listOf("3×3 matrix", "arithmetic", "Latin square"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            val counts = listOf(listOf(1, 2, 3), listOf(2, 3, 5), listOf(3, 1, 4))
            val shapes = listOf(listOf(CIRCLE, SQUARE, TRIANGLE), listOf(SQUARE, TRIANGLE, CIRCLE), listOf(TRIANGLE, CIRCLE, SQUARE))
            dice(counts[r][c], shapes[r][c])
        },
        distractors = { listOf(dice(4, TRIANGLE), dice(3, SQUARE), dice(5, SQUARE), dice(4, CIRCLE)) },
    ),
    sequence(
        Meta(
            62, "Two Fewer", 7, 60,
            "Each shape has one more side than the last, and the number of dots inside is always two less than the number of sides. A heptagon (7 sides) therefore holds 5 dots.",
            listOf("Count both the sides and the dots in every figure.", "Is there a fixed link between the two numbers?"),
            listOf("hidden relationship", "progression"),
        ),
        frames = listOf(TRIANGLE to 1, SQUARE to 2, PENTAGON to 3, HEXAGON to 4).map { (s, d) -> framed(s, d) },
        answer = framed(HEPTAGON, 5),
        distractors = listOf(framed(HEPTAGON, 4), framed(OCTAGON, 5), framed(HEPTAGON, 7)),
    ),
    ruleDeduction(
        Meta(
            63, "Like Within Like", 7, 70,
            "A figure follows the rule when it is a single outlined shape holding one smaller solid copy of the same shape inside it. Counter-examples use a different inner shape, put the copy outside, or hold two copies.",
            listOf("Compare the inner shape with the outer shape in each top figure.", "Check where the small shape sits and how many there are."),
            listOf("rule induction", "relationship"),
        ),
        follows = listOf(nested(CIRCLE, N, CIRCLE, T), nested(SQUARE, G, SQUARE, N), nested(TRIANGLE, T, TRIANGLE, C)),
        breaks = listOf(
            nested(SQUARE, N, CIRCLE, T),
            nested(SQUARE, T, SQUARE, G, inside = false),
            fig(el(CIRCLE, G, OUT, Sizes.L), el(CIRCLE, N, SOLID, 0.2f, x = -0.25f), el(CIRCLE, N, SOLID, 0.2f, x = 0.25f)),
        ),
        answer = nested(HEXAGON, C, HEXAGON, G),
        distractors = listOf(
            nested(HEXAGON, C, CIRCLE, G),
            nested(HEXAGON, C, HEXAGON, G, inside = false),
            fig(el(HEXAGON, C, OUT, Sizes.L), el(HEXAGON, G, SOLID, 0.2f, x = -0.25f), el(HEXAGON, G, SOLID, 0.2f, x = 0.25f)),
        ),
    ),
    oddOneOut(
        Meta(
            64, "Sides Add Up", 8, 75,
            "In four figures the sides of the two small shapes add up to the sides of the large shape (3+3=6, 4+4=8, 3+4=7, 5+3=8). In the odd figure 4+4 makes 8, but the heptagon has only 7 sides.",
            listOf("Count the sides of every shape.", "Compare the small shapes' total with the large shape."),
            listOf("hidden relationship", "arithmetic"),
        ),
        odd = container(HEPTAGON, SQUARE, SQUARE),
        others = listOf(
            container(HEXAGON, TRIANGLE, TRIANGLE),
            container(OCTAGON, SQUARE, SQUARE),
            container(HEPTAGON, TRIANGLE, SQUARE),
            container(OCTAGON, PENTAGON, TRIANGLE),
        ),
    ),
    sequence(
        Meta(
            65, "Three at Once", 8, 75,
            "Three independent rules: the arrow turns 90° clockwise, the coral circle moves one cell right along the bottom row (wrapping around), and the square cycles navy → teal → gold.",
            listOf("Give each of the three pieces its own rule.", "Check every piece in your chosen answer."),
            listOf("multiple variables"),
        ),
        frames = listOf(Triple(0, 0, N), Triple(90, 1, T), Triple(180, 2, G), Triple(270, 0, N), Triple(0, 1, T)).map { (a, c, i) -> three(a, c, i) },
        answer = three(90, 2, G),
        distractors = listOf(three(180, 2, G), three(90, 0, G), three(90, 2, N), three(90, 2, T)),
    ),
    sequence(
        Meta(
            66, "Growing Gaps", 8, 70,
            "The gaps grow by one each time: +1, +2, +3, so the next gap is +4 and 7 + 4 = 11 dots.",
            listOf("Write down how many dots are added at each step.", "Look at how the differences themselves change."),
            listOf("non-linear progression"),
        ),
        frames = listOf(1, 2, 4, 7).map { cluster(it) },
        answer = cluster(11),
        distractors = listOf(cluster(10), cluster(12), cluster(14)),
    ),
    sequence(
        Meta(
            67, "Add the Last Two", 8, 70,
            "Each count is the sum of the two counts before it: 1, 1, 2, 3, 5 — so the next figure has 3 + 5 = 8 triangles.",
            listOf("The first two figures are identical — that is a clue.", "Try combining two neighbouring counts."),
            listOf("recursive sequence"),
        ),
        frames = listOf(1, 1, 2, 3, 5).map { cluster(it, TRIANGLE, G) },
        answer = cluster(8, TRIANGLE, G),
        distractors = listOf(cluster(7, TRIANGLE, G), cluster(6, TRIANGLE, G), cluster(10, TRIANGLE, G)),
    ),
    matrix(
        Meta(
            68, "Adding Angles", 8, 75,
            "Measured clockwise from 'up', the third arrow's angle in each row is the sum of the first two: 45°+90°=135°, 90°+45°=135°, 180°+90°=270°.",
            listOf("Express each arrow as an angle turned clockwise from pointing up.", "Combine the first two angles of each row."),
            listOf("3×3 matrix", "rotation", "arithmetic"),
        ),
        rows = 3, cols = 3,
        cell = { r, c -> fig(el(ARROW, size = Sizes.M, rot = listOf(listOf(45, 90, 135), listOf(90, 45, 135), listOf(180, 90, 270))[r][c])) },
        distractors = { a -> listOf(a.spin(180), a.spin(-45), a.spin(90)) },
    ),
    matrix(
        Meta(
            69, "Column Cancel", 8, 75,
            "Read down each column: squares that appear in both the top and middle cells cancel out, and squares that appear in only one of them drop to the bottom cell.",
            listOf("The rows hide nothing — try the columns.", "Shared squares vanish; unique squares survive."),
            listOf("exclusive or", "column rule"),
        ),
        rows = 3, cols = 3,
        missing = 2 to 1,
        cell = { r, c ->
            val sets = listOf(
                listOf(setOf(0, 4), setOf(1, 3, 4), setOf(2, 6)),
                listOf(setOf(4, 8), setOf(3, 5), setOf(2, 4, 6)),
                listOf(setOf(0, 8), setOf(1, 4, 5), setOf(4)),
            )
            cells(sets[r][c], com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE, T, size = 0.18f)
        },
        distractors = {
            listOf(setOf(1, 3, 4, 5), setOf(3), setOf(1, 4), setOf(1, 5)).map { cells(it, SQUARE, T, size = 0.18f) }
        },
    ),
    sequence(
        Meta(
            70, "Accelerating Turn", 8, 80,
            "The turns grow by 45° each step (45°, 90°, 135°, 180°), so the next turn is 225°; meanwhile the fill alternates solid and outlined.",
            listOf("Measure how far the flag turns between neighbours.", "The turning amount itself follows a pattern."),
            listOf("non-linear rotation", "alternation"),
        ),
        frames = listOf(0, 45, 135, 270, 90).mapIndexed { i, r -> accel(r, if (i % 2 == 0) SOLID else OUT) },
        answer = accel(315, OUT),
        distractors = listOf(accel(270, OUT), accel(315, SOLID), accel(0, OUT), accel(315, OUT, mirrored = true)),
    ),
)

