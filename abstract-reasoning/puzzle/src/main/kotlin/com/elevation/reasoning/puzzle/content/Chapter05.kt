package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.engine.at
import com.elevation.reasoning.puzzle.engine.atRing
import com.elevation.reasoning.puzzle.engine.recolor
import com.elevation.reasoning.puzzle.engine.reshape
import com.elevation.reasoning.puzzle.engine.rotate
import com.elevation.reasoning.puzzle.engine.spin
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.ShapeKind
import com.elevation.reasoning.puzzle.model.ShapeKind.ARROW
import com.elevation.reasoning.puzzle.model.ShapeKind.CHEVRON
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.CROSS
import com.elevation.reasoning.puzzle.model.ShapeKind.DIAMOND
import com.elevation.reasoning.puzzle.model.ShapeKind.FLAG
import com.elevation.reasoning.puzzle.model.ShapeKind.HEXAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.L_SHAPE
import com.elevation.reasoning.puzzle.model.ShapeKind.OCTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.PENTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.RIGHT_TRIANGLE
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.STAR
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE
import com.elevation.reasoning.puzzle.model.Sizes

/** A polygon with a centred row of dots inside. */
internal fun polygonWithDots(shape: ShapeKind, dots: Int, ink: com.elevation.reasoning.puzzle.model.Ink = N, y: Float = 0f) = fig(
    listOf(el(shape, ink, OUT, Sizes.XL)) + rowOf(dots, CIRCLE, T, size = 0.08f, y = y, spacing = 0.2f),
)

/** One to five items in a balanced, non-overlapping arrangement, used for "colour / count" rule figures. */
internal fun trioOf(shapes: List<ShapeKind>, inks: List<com.elevation.reasoning.puzzle.model.Ink>, fills: List<com.elevation.reasoning.puzzle.model.Fill> = shapes.map { SOLID }): Figure {
    val spots = when (shapes.size) {
        1 -> listOf(0f to 0f)
        2 -> listOf(-0.42f to 0f, 0.42f to 0f)
        3 -> listOf(-0.45f to -0.4f, 0.45f to -0.4f, 0f to 0.45f)
        4 -> listOf(-0.45f to -0.45f, 0.45f to -0.45f, -0.45f to 0.45f, 0.45f to 0.45f)
        else -> listOf(-0.55f to -0.55f, 0.55f to -0.55f, 0f to 0f, -0.55f to 0.55f, 0.55f to 0.55f)
    }
    val size = if (shapes.size >= 5) 0.22f else 0.27f
    return fig(shapes.indices.map { i -> el(shapes[i], inks[i], fills[i], size, x = spots[i].first, y = spots[i].second) })
}

private fun flagStep(rot: Int, size: Float) = fig(el(FLAG, G, size = size, rot = rot))

private fun alternator(rot: Int, ink: com.elevation.reasoning.puzzle.model.Ink) = fig(el(ARROW, ink, size = Sizes.M, rot = rot))

private fun twin(chevron: Int, dot: Int) = fig(
    el(CHEVRON, size = Sizes.M, rot = chevron, tag = "chevron"),
    el(CIRCLE, C, size = 0.16f, tag = "dot").atRing(dot),
    board = true,
)

private val cards = listOf(
    trioOf(listOf(TRIANGLE, CIRCLE, SQUARE), listOf(N, T, G)),
)

/** Chapter 5 – Multiple Rules. */
internal val chapter05: List<PuzzleSpec> = listOf(
    sequence(
        Meta(
            41, "Shape and Count", 5, 45,
            "Two rules run together: the shape cycles circle → square → triangle, and every figure has one more item than the one before.",
            listOf("Look at the shapes and the number of items separately.", "After a square comes a triangle; after 5 items come 6."),
            listOf("cycle", "quantity", "two rules"),
        ),
        frames = listOf(CIRCLE, SQUARE, TRIANGLE, CIRCLE, SQUARE).mapIndexed { i, s -> dice(i + 1, s) },
        answer = dice(6, TRIANGLE),
        distractors = listOf(dice(6, CIRCLE), dice(5, TRIANGLE), dice(6, SQUARE)),
    ),
    sequence(
        Meta(
            42, "Turn and Grow", 5, 45,
            "The flag turns 45° clockwise and grows by the same amount at every step.",
            listOf("Treat direction and size as two separate patterns.", "Both change by the same amount every step."),
            listOf("rotation", "size", "two rules"),
        ),
        frames = (0..3).map { flagStep(it * 45, 0.3f + it * 0.1f) },
        answer = flagStep(180, 0.7f),
        distractors = listOf(flagStep(180, 0.6f), flagStep(225, 0.7f), fig(el(FLAG, G, size = 0.7f, rot = 180, mir = true))),
    ),
    matrix(
        Meta(
            43, "Three Independent Rules", 6, 60,
            "Three rules apply at once: each row and column has one circle, square and triangle; each row and column has one navy, teal and gold figure; and every column has one more item than the column to its left.",
            listOf("Solve shape, colour and count one at a time.", "The third column always has three items."),
            listOf("3×3 matrix", "Latin square", "three rules"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            val shapes = listOf(listOf(CIRCLE, SQUARE, TRIANGLE), listOf(TRIANGLE, CIRCLE, SQUARE), listOf(SQUARE, TRIANGLE, CIRCLE))
            val inks = listOf(listOf(N, T, G), listOf(T, G, N), listOf(G, N, T))
            dice(c + 1, shapes[r][c], inks[r][c])
        },
        distractors = { listOf(dice(3, CIRCLE, N), dice(2, CIRCLE, T), dice(3, SQUARE, T), dice(3, CIRCLE, G)) },
    ),
    oddOneOut(
        Meta(
            44, "Dots and Sides", 6, 55,
            "In four figures the number of dots equals the number of sides of the shape around them. The octagon has 8 sides but holds only 7 dots.",
            listOf("Count the dots and the sides in each figure.", "Is there a link between the two numbers?"),
            listOf("hidden relationship", "counting"),
        ),
        odd = polygonWithDots(OCTAGON, 7),
        others = listOf(polygonWithDots(TRIANGLE, 3, y = 0.12f), polygonWithDots(SQUARE, 4), polygonWithDots(PENTAGON, 5, y = 0.05f), polygonWithDots(HEXAGON, 6)),
    ),
    ruleDeduction(
        Meta(
            45, "Matching Trio", 6, 60,
            "A figure follows the rules when it has exactly three shapes and all of them share one colour. The counter-examples have mixed colours, two shapes or four shapes.",
            listOf("Count the shapes in the figures that follow the rules.", "Then compare their colours."),
            listOf("rule induction", "two rules"),
        ),
        follows = listOf(
            trioOf(listOf(TRIANGLE, CIRCLE, SQUARE), listOf(N, N, N)),
            trioOf(listOf(STAR, DIAMOND, CIRCLE), listOf(T, T, T)),
            trioOf(listOf(SQUARE, HEXAGON, TRIANGLE), listOf(G, G, G), listOf(SOLID, OUT, SOLID)),
        ),
        breaks = listOf(
            trioOf(listOf(CIRCLE, SQUARE, STAR), listOf(N, T, N)),
            trioOf(listOf(TRIANGLE, DIAMOND), listOf(G, G)),
            trioOf(listOf(CIRCLE, SQUARE, TRIANGLE, STAR), listOf(T, T, T, T)),
        ),
        answer = trioOf(listOf(HEXAGON, STAR, CROSS), listOf(C, C, C)),
        distractors = listOf(
            trioOf(listOf(HEXAGON, STAR, CROSS), listOf(C, G, C)),
            trioOf(listOf(HEXAGON, STAR, CROSS, CIRCLE), listOf(C, C, C, C)),
            trioOf(listOf(HEXAGON, CROSS), listOf(C, C)),
        ),
    ),
    sequence(
        Meta(
            46, "Turn, Paint, Turn, Paint", 6, 60,
            "Two changes take turns: first the arrow turns 90° clockwise, then it switches colour, then it turns again, and so on. The last step was a turn, so the next step is a colour switch.",
            listOf("Look at what changes between each pair of neighbours.", "Only one thing changes at a time, and the two changes alternate."),
            listOf("alternating transformations"),
        ),
        frames = listOf(0 to N, 90 to N, 90 to T, 180 to T, 180 to N, 270 to N).map { (r, c) -> alternator(r, c) },
        answer = alternator(270, T),
        distractors = listOf(alternator(0, N), alternator(270, N), alternator(0, T), alternator(180, T)),
    ),
    matrix(
        Meta(
            47, "Shape, Turn, Colour", 6, 60,
            "Each column keeps one shape, each row turns its figures by the same amount (0°, 90°, 180°), and each row and column contains navy, teal and gold once.",
            listOf("Read the columns for shape and the rows for direction.", "Which colour is missing from the middle row?"),
            listOf("3×3 matrix", "rotation", "three rules"),
        ),
        rows = 3, cols = 3,
        missing = 1 to 2,
        cell = { r, c ->
            val inks = listOf(listOf(N, T, G), listOf(T, G, N), listOf(G, N, T))
            fig(el(listOf(FLAG, L_SHAPE, RIGHT_TRIANGLE)[c], inks[r][c], size = Sizes.M, rot = r * 90))
        },
        distractors = { a -> listOf(a.spin(90), a.recolor(T), a.reshape(L_SHAPE), a.spin(-90)) },
    ),
    analogy(
        Meta(
            48, "Turn and Swap", 6, 55,
            "The pair is turned a quarter turn clockwise and its two colours are swapped. Applying both changes to the third figure gives the answer.",
            listOf("Two things change between the first two figures.", "Check positions as well as colours."),
            listOf("analogy", "rotation", "colour"),
        ),
        examples = listOf(fig(el(FLAG, size = 0.36f, x = -0.38f, y = -0.38f), el(CIRCLE, T, size = 0.2f, x = 0.42f, y = 0.42f))),
        query = fig(el(L_SHAPE, size = 0.36f, x = 0.38f, y = -0.35f), el(TRIANGLE, T, size = 0.22f, x = -0.42f, y = 0.42f)),
        rule = Transform.Then(Transform.Rotate(90), Transform.SwapInks(N, T)),
        distractors = { a ->
            val q = fig(el(L_SHAPE, size = 0.36f, x = 0.38f, y = -0.35f), el(TRIANGLE, T, size = 0.22f, x = -0.42f, y = 0.42f))
            listOf(q.rotate(90), Transform.SwapInks(N, T).apply(q), Transform.SwapInks(N, T).apply(q.rotate(-90)))
        },
    ),
    sequence(
        Meta(
            49, "Independent Motion", 6, 55,
            "The chevron turns 45° counter-clockwise at each step, while the coral dot walks one cell clockwise around the edge of the board. The two motions are independent.",
            listOf("Follow the chevron and the dot separately.", "Each moves by the same amount every step."),
            listOf("rotation", "movement", "two rules"),
        ),
        frames = (0..3).map { twin(360 - 45 * it, it) },
        answer = twin(180, 4),
        distractors = listOf(twin(180, 3), twin(225, 4), twin(90, 4), twin(180, 5)),
    ),
    ruleDeduction(
        Meta(
            50, "Both Conditions", 7, 70,
            "Figures follow the rules when they contain at least one triangle and an odd number of shapes. Each counter-example fails exactly one of these conditions.",
            listOf("What do all the top figures contain?", "Now count the shapes in each top figure."),
            listOf("logical intersection", "rule induction"),
        ),
        follows = listOf(
            trioOf(listOf(TRIANGLE, CIRCLE, SQUARE), listOf(N, T, G)),
            trioOf(listOf(STAR, TRIANGLE, DIAMOND, TRIANGLE, CIRCLE), listOf(G, N, T, C, N)),
            fig(el(TRIANGLE, C, size = Sizes.M)),
        ),
        breaks = listOf(
            trioOf(listOf(TRIANGLE, STAR), listOf(T, N)),
            trioOf(listOf(CIRCLE, SQUARE, STAR), listOf(N, T, G)),
            trioOf(listOf(TRIANGLE, CIRCLE, DIAMOND, SQUARE), listOf(G, N, C, T)),
        ),
        answer = trioOf(listOf(DIAMOND, TRIANGLE, STAR), listOf(T, G, C)),
        distractors = listOf(
            trioOf(listOf(DIAMOND, TRIANGLE), listOf(T, G)),
            trioOf(listOf(DIAMOND, CIRCLE, STAR), listOf(T, G, C)),
            trioOf(listOf(DIAMOND, TRIANGLE, STAR, CIRCLE), listOf(T, G, C, N)),
        ),
    ),
)
