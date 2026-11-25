package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.engine.atRing
import com.elevation.reasoning.puzzle.engine.refill
import com.elevation.reasoning.puzzle.engine.reshape
import com.elevation.reasoning.puzzle.engine.spin
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.CROSS
import com.elevation.reasoning.puzzle.model.ShapeKind.DIAMOND
import com.elevation.reasoning.puzzle.model.ShapeKind.FLAG
import com.elevation.reasoning.puzzle.model.ShapeKind.HEXAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.L_SHAPE
import com.elevation.reasoning.puzzle.model.ShapeKind.PENTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.RIGHT_TRIANGLE
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.STAR
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE
import com.elevation.reasoning.puzzle.model.Sizes

private fun chase(leader: Int, follower: Int) = fig(
    el(CIRCLE, C, size = 0.22f, tag = "leader").atRing(leader),
    el(SQUARE, N, size = 0.2f, tag = "follower").atRing(follower),
    board = true,
)

private val crest = fig(
    el(FLAG, N, SOLID, 0.34f, x = -0.4f, y = -0.38f),
    el(CIRCLE, G, OUT, 0.2f, x = 0.42f, y = 0.42f),
    el(TRIANGLE, T, STRIPE, 0.22f, x = 0.42f, y = -0.42f),
)

private val emblem = fig(
    el(L_SHAPE, T, SOLID, 0.36f, x = -0.36f, y = 0.1f),
    el(CIRCLE, C, OUT, 0.2f, x = 0.45f, y = -0.45f),
)

/** Chapter 8 – Abstract Logic. */
internal val chapter08: List<PuzzleSpec> = listOf(
    matrix(
        Meta(
            71, "Sides to Dots", 8, 70,
            "Each row translates a shape into dots: the number of dots on the right equals the number of sides of the shape on the left. A hexagon has six sides.",
            listOf("Compare the left and right cells of the top row.", "What could the shape tell you about the number of dots?"),
            listOf("symbolic mapping"),
        ),
        rows = 3, cols = 2,
        cell = { r, c ->
            val shape = listOf(TRIANGLE, SQUARE, HEXAGON)[r]
            if (c == 0) fig(el(shape, N, OUT, Sizes.M)) else dice(shape.sides!!, ink = T)
        },
        distractors = { listOf(dice(5, ink = T), dice(7, ink = T), dice(6, SQUARE, T)) },
        prompt = "Every row follows the same rule. Which figure completes the last row?",
    ),
    relation(
        Meta(
            72, "Diagonal Mirror", 8, 70,
            "Each figure is reflected in the diagonal running from bottom-left to top-right (╱): the top-left area swaps with the bottom-right, and every shape is flipped across that line.",
            listOf("A quarter turn moves everything; a diagonal mirror flips it. Test both on the flag.", "Look at which corners swap places in the second example."),
            listOf("reflection", "diagonal"),
        ),
        examples = listOf(fig(el(FLAG)), emblem),
        rule = Transform.Reflect(Axis.DIAGONAL_UP),
        wrong = listOf(Transform.Reflect(Axis.DIAGONAL_DOWN), Transform.Rotate(90), Transform.Rotate(-90)),
    ),
    transformation(
        Meta(
            73, "Five Steps", 8, 90,
            "Turn, mirror top–bottom and turn again combine into one top–bottom mirror; the colour swap exchanges navy and gold, and the final step turns solid shapes outlined and outlined shapes solid (the striped triangle is unaffected).",
            listOf("Handle geometry and colour separately.", "Three geometric steps can collapse into one simpler move."),
            listOf("multi-step deduction"),
        ),
        start = crest,
        steps = listOf(Transform.Rotate(90), Transform.Reflect(Axis.HORIZONTAL), Transform.SwapInks(N, G), Transform.Rotate(90), Transform.InvertFill),
        distractors = listOf(
            Transform.Then(Transform.Rotate(180), Transform.SwapInks(N, G), Transform.InvertFill).apply(crest),
            Transform.Then(Transform.Reflect(Axis.HORIZONTAL), Transform.InvertFill).apply(crest),
            Transform.Then(Transform.Reflect(Axis.HORIZONTAL), Transform.SwapInks(N, G)).apply(crest),
        ),
    ),
    sequence(
        Meta(
            74, "Follow the Leader", 8, 80,
            "The coral circle moves 1, then 2, then 3 cells clockwise, so next it moves 4 cells. The navy square always steps into the cell the circle has just left.",
            listOf("The square's path depends on the circle's path.", "Where was the circle one step earlier?"),
            listOf("interdependent rules", "lag"),
        ),
        frames = listOf(0 to 7, 1 to 0, 3 to 1, 6 to 3).map { (l, f) -> chase(l, f) },
        answer = chase(2, 6),
        distractors = listOf(chase(2, 3), chase(1, 6), chase(2, 7)),
    ),
    ruleDeduction(
        Meta(
            75, "Uniform with One Accent", 8, 80,
            "Figures follow the rules when every shape has the same fill and exactly one shape is coral. Counter-examples mix fills, have two coral shapes, or have none.",
            listOf("Look at the fills inside each top figure.", "Then count the coral shapes."),
            listOf("rule induction", "two rules"),
        ),
        follows = listOf(
            trioOf(listOf(CIRCLE, SQUARE, TRIANGLE), listOf(C, N, T)),
            trioOf(listOf(STAR, DIAMOND, HEXAGON, CROSS), listOf(G, C, N, T), List(4) { OUT }),
            trioOf(listOf(TRIANGLE, CIRCLE), listOf(N, C), List(2) { STRIPE }),
        ),
        breaks = listOf(
            trioOf(listOf(SQUARE, STAR, CIRCLE), listOf(C, T, G), listOf(SOLID, OUT, SOLID)),
            trioOf(listOf(DIAMOND, TRIANGLE, SQUARE), listOf(C, C, N), List(3) { OUT }),
            trioOf(listOf(HEXAGON, CIRCLE, STAR), listOf(N, T, G)),
        ),
        answer = trioOf(listOf(PENTAGON, STAR, CIRCLE), listOf(T, C, G), List(3) { OUT }),
        distractors = listOf(
            trioOf(listOf(PENTAGON, STAR, CIRCLE), listOf(T, C, G), listOf(OUT, SOLID, OUT)),
            trioOf(listOf(PENTAGON, STAR, CIRCLE), listOf(T, N, G), List(3) { OUT }),
            trioOf(listOf(PENTAGON, STAR, CIRCLE), listOf(C, C, G), List(3) { OUT }),
        ),
    ),
    matrix(
        Meta(
            76, "Shape, Turn and Fill", 8, 80,
            "Each row and column contains the flag, the L-shape and the right triangle once; each column turns its figures by the same amount (0°, 90°, 180°); each row has its own fill.",
            listOf("Use the rows for fill, the columns for direction.", "Which shape is missing from the bottom row?"),
            listOf("3×3 matrix", "three rules"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            val shapes = listOf(listOf(FLAG, L_SHAPE, RIGHT_TRIANGLE), listOf(L_SHAPE, RIGHT_TRIANGLE, FLAG), listOf(RIGHT_TRIANGLE, FLAG, L_SHAPE))
            fig(el(shapes[r][c], N, listOf(SOLID, STRIPE, OUT)[r], Sizes.M, rot = c * 90))
        },
        distractors = { a -> listOf(a.reshape(FLAG), a.spin(90), a.refill(SOLID), a.reshape(RIGHT_TRIANGLE)) },
    ),
    analogy(
        Meta(
            77, "Triple Change", 8, 80,
            "Three changes happen together: a half turn, solid and outlined fills trade places, and teal and coral swap colours.",
            listOf("List every difference between the first two figures.", "Check position, fill and colour."),
            listOf("analogy", "three rules"),
        ),
        examples = listOf(emblem),
        query = fig(el(FLAG, C, OUT, 0.34f, x = 0.35f, y = -0.35f), el(TRIANGLE, T, SOLID, 0.22f, x = -0.42f, y = 0.4f)),
        rule = Transform.Then(Transform.Rotate(180), Transform.InvertFill, Transform.SwapInks(T, C)),
        distractors = { a ->
            val q = fig(el(FLAG, C, OUT, 0.34f, x = 0.35f, y = -0.35f), el(TRIANGLE, T, SOLID, 0.22f, x = -0.42f, y = 0.4f))
            listOf(
                Transform.Then(Transform.Rotate(180), Transform.InvertFill).apply(q),
                Transform.Then(Transform.Rotate(180), Transform.SwapInks(T, C)).apply(q),
                Transform.Then(Transform.Reflect(Axis.HORIZONTAL), Transform.InvertFill, Transform.SwapInks(T, C)).apply(q),
            )
        },
    ),
    sequence(
        Meta(
            78, "Two Threads", 9, 85,
            "Two sequences are woven together. Circles go 2, 4, 6 (adding two); squares go 9, 8, 7 (taking one). The next figure continues the circle thread with 8.",
            listOf("Look at every other figure.", "Treat circles and squares as two separate sequences."),
            listOf("interleaved sequences"),
        ),
        frames = listOf(2 to CIRCLE, 9 to SQUARE, 4 to CIRCLE, 8 to SQUARE, 6 to CIRCLE, 7 to SQUARE).map { (n, s) -> cluster(n, s, if (s == CIRCLE) N else T) },
        answer = cluster(8, CIRCLE, N),
        distractors = listOf(cluster(6, SQUARE, T), cluster(6, CIRCLE, N), cluster(10, CIRCLE, N)),
    ),
    oddOneOut(
        Meta(
            79, "Majority Rule", 9, 85,
            "In four figures solid shapes outnumber outlined shapes. In the odd figure only one of the three shapes is solid.",
            listOf("Ignore shapes and colours; look only at fills.", "Compare how many shapes are solid with how many are outlined."),
            listOf("abstract property"),
        ),
        odd = trioOf(listOf(STAR, CIRCLE, TRIANGLE), listOf(T, N, G), listOf(OUT, SOLID, OUT)),
        others = listOf(
            trioOf(listOf(CIRCLE, SQUARE, TRIANGLE), listOf(N, G, T), listOf(SOLID, SOLID, OUT)),
            trioOf(listOf(DIAMOND, STAR, HEXAGON), listOf(T, N, G), listOf(SOLID, OUT, SOLID)),
            trioOf(listOf(SQUARE, CIRCLE, CROSS), listOf(G, T, N), listOf(SOLID, SOLID, SOLID)),
            trioOf(listOf(HEXAGON, DIAMOND, CROSS), listOf(G, N, T), listOf(SOLID, SOLID, SOLID)),
        ),
    ),
    matrix(
        Meta(
            80, "Row Totals", 9, 85,
            "Each row uses one shape, its third cell holds the total of the first two cells, and each row and column contains navy, teal and gold once.",
            listOf("Work out the count first.", "Then use rows and columns to settle the colour."),
            listOf("3×3 matrix", "arithmetic", "Latin square"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            val counts = listOf(listOf(1, 1, 2), listOf(3, 1, 4), listOf(2, 2, 4))
            val inks = listOf(listOf(N, T, G), listOf(G, N, T), listOf(T, G, N))
            dice(counts[r][c], listOf(TRIANGLE, SQUARE, HEXAGON)[r], inks[r][c])
        },
        distractors = { listOf(dice(4, HEXAGON, T), dice(3, HEXAGON, N), dice(4, SQUARE, N), dice(5, HEXAGON, N)) },
    ),
)

