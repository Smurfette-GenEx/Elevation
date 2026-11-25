package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.engine.at
import com.elevation.reasoning.puzzle.engine.atRing
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.Ink
import com.elevation.reasoning.puzzle.model.ShapeKind
import com.elevation.reasoning.puzzle.model.ShapeKind.ARROW
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.FLAG
import com.elevation.reasoning.puzzle.model.ShapeKind.DIAMOND
import com.elevation.reasoning.puzzle.model.ShapeKind.HEXAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.OCTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.L_SHAPE
import com.elevation.reasoning.puzzle.model.ShapeKind.PENTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.STAR
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE
import com.elevation.reasoning.puzzle.model.Sizes

private fun quad(rot: Int, size: Float, ring: Int, ink: Ink) = fig(
    el(ARROW, N, size = size, rot = rot, tag = "arrow"),
    el(CIRCLE, ink, size = 0.1f, tag = "dot").atRing(ring),
    board = true,
)

private val gallery = fig(
    el(FLAG, N, SOLID, 0.3f, x = -0.42f, y = -0.42f),
    el(CIRCLE, T, OUT, 0.2f, x = 0.45f, y = -0.45f),
    el(SQUARE, G, SOLID, 0.18f, x = 0.45f, y = 0.45f),
    el(TRIANGLE, C, STRIPE, 0.22f, x = -0.42f, y = 0.42f),
)

private fun counted(shape: ShapeKind, dots: Int, outerInk: Ink, outerFill: Fill = OUT, dotInk: Ink = C) = fig(
    listOf(el(shape, outerInk, outerFill, Sizes.XL)) +
        rowOf(dots, CIRCLE, dotInk, size = 0.08f, y = if (shape == TRIANGLE) 0.15f else 0.05f, spacing = 0.2f),
)

private fun vessel(outer: ShapeKind, outerInk: Ink, a: ShapeKind, b: ShapeKind, innerInk: Ink) = fig(
    el(outer, outerInk, OUT, Sizes.XL),
    el(a, innerInk, SOLID, 0.2f, x = -0.25f),
    el(b, innerInk, SOLID, 0.18f, x = 0.26f, y = 0.12f),
)

private val specimenA = fig(el(FLAG, T, SOLID, 0.4f, x = -0.3f, y = -0.25f), el(CIRCLE, G, OUT, 0.2f, x = 0.45f, y = 0.45f))
private val specimenB = fig(el(L_SHAPE, G, OUT, 0.36f, x = 0.3f, y = 0.2f), el(TRIANGLE, T, SOLID, 0.2f, x = -0.45f, y = -0.45f))

private fun arrows(n: Int, rot: Int, ink: Ink) = cluster(n, ARROW, ink).let { f -> f.map { it.copy(rotation = rot) } }

private fun group(n: Int, shape: ShapeKind, rot: Int, ink: Ink = N): Figure =
    fig(diceLayouts.getValue(n).map { i -> val (x, y) = cellXY(i); el(shape, ink, size = 0.2f, rot = rot, x = x, y = y) })

private val board10a = fig(el(ARROW, N, size = 0.24f).at(0, 0), el(CIRCLE, C, size = 0.2f).at(2, 1), board = true)
private val board10b = fig(el(FLAG, T, size = 0.24f).at(1, 0), el(SQUARE, N, size = 0.2f).at(0, 1), board = true)
private val query10 = fig(el(L_SHAPE, C, size = 0.24f).at(2, 0), el(TRIANGLE, N, size = 0.22f).at(1, 1), board = true)
private val finalRule = Transform.Then(Transform.Shift(0, 1), Transform.Rotate(180), Transform.SwapInks(N, C))

/** Chapter 10 – Mastermind. */
internal val chapter10: List<PuzzleSpec> = listOf(
    sequence(
        Meta(
            91, "Four Clocks", 10, 120,
            "Four rules at once: the arrow turns 45° clockwise and grows a little every step; the dot walks one cell clockwise around the edge; and the dot's colour cycles coral → teal → gold.",
            listOf("There are four independent changes. List them before choosing.", "Check size, direction, position and colour for every option."),
            listOf("four rules"),
        ),
        frames = (0..5).map { quad(45 * it, 0.16f + 0.05f * it, it, listOf(C, T, G)[it % 3]) },
        answer = quad(270, 0.46f, 6, C),
        distractors = listOf(quad(225, 0.46f, 6, C), quad(270, 0.41f, 6, C), quad(270, 0.46f, 7, C), quad(270, 0.46f, 6, G)),
    ),
    matrix(
        Meta(
            92, "Double Cancel", 10, 120,
            "Lines cancel in both directions: in every row, and in every column, the third cell keeps only the lines that appear in exactly one of the first two cells.",
            listOf("Start with the top row, then check that the same rule works down the columns.", "Shared lines disappear; unique lines remain."),
            listOf("exclusive or", "rows and columns"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            listOf(
                listOf(segs(Seg.TOP, Seg.SLASH), segs(Seg.LEFT, Seg.SLASH, Seg.BOTTOM), segs(Seg.TOP, Seg.LEFT, Seg.BOTTOM)),
                listOf(segs(Seg.TOP, Seg.BACKSLASH), segs(Seg.TOP, Seg.RIGHT), segs(Seg.BACKSLASH, Seg.RIGHT)),
                listOf(
                    segs(Seg.SLASH, Seg.BACKSLASH),
                    segs(Seg.LEFT, Seg.SLASH, Seg.BOTTOM, Seg.TOP, Seg.RIGHT),
                    segs(Seg.TOP, Seg.LEFT, Seg.BOTTOM, Seg.BACKSLASH, Seg.RIGHT),
                ),
            )[r][c]
        },
        distractors = {
            listOf(
                segs(Seg.LEFT, Seg.BOTTOM, Seg.BACKSLASH, Seg.RIGHT),
                segs(Seg.TOP, Seg.LEFT, Seg.BOTTOM, Seg.BACKSLASH, Seg.RIGHT, Seg.SLASH),
                segs(Seg.TOP, Seg.LEFT, Seg.BOTTOM),
                segs(Seg.BACKSLASH, Seg.RIGHT),
            )
        },
    ),
    transformation(
        Meta(
            93, "The Long Program", 10, 130,
            "Follow all six instructions in order. The diagonal mirror and quarter turn combine into a left–right mirror; removing the circle and adding the central star change the pieces; gold and coral swap; finally every solid shape becomes outlined and vice versa — including the new star.",
            listOf("Shapes added late are affected only by later steps.", "Two of the geometric steps can be merged into one simpler move."),
            listOf("long deduction", "composition"),
        ),
        start = gallery,
        steps = listOf(
            Transform.Reflect(Axis.DIAGONAL_DOWN),
            Transform.Remove(CIRCLE),
            Transform.Rotate(90),
            Transform.SwapInks(G, C),
            Transform.Add(el(STAR, N, SOLID, 0.22f)),
            Transform.InvertFill,
        ),
        distractors = listOf(
            Transform.Then(Transform.Reflect(Axis.DIAGONAL_DOWN), Transform.Remove(CIRCLE), Transform.Rotate(90), Transform.SwapInks(G, C), Transform.InvertFill, Transform.Add(el(STAR, N, SOLID, 0.22f))).apply(gallery),
            Transform.Then(Transform.Reflect(Axis.DIAGONAL_DOWN), Transform.Remove(CIRCLE), Transform.Rotate(-90), Transform.SwapInks(G, C), Transform.Add(el(STAR, N, SOLID, 0.22f)), Transform.InvertFill).apply(gallery),
            Transform.Then(Transform.Reflect(Axis.DIAGONAL_DOWN), Transform.Remove(CIRCLE), Transform.Rotate(90), Transform.Add(el(STAR, N, SOLID, 0.22f)), Transform.InvertFill).apply(gallery),
        ),
    ),
    ruleDeduction(
        Meta(
            94, "Exact Census", 10, 120,
            "Valid figures are outlined polygons holding exactly as many coral dots as the polygon has sides. Counter-examples have the wrong number of dots, a solid polygon, or dots of the wrong colour.",
            listOf("Compare the dots with the shape that contains them.", "Fill and dot colour matter too."),
            listOf("rule induction", "relationship", "three rules"),
        ),
        follows = listOf(counted(TRIANGLE, 3, N), counted(SQUARE, 4, T), counted(PENTAGON, 5, G)),
        breaks = listOf(counted(HEXAGON, 5, N), counted(SQUARE, 4, T, SOLID), counted(TRIANGLE, 3, G, dotInk = T)),
        answer = counted(HEXAGON, 6, T),
        distractors = listOf(counted(HEXAGON, 5, T), counted(HEXAGON, 6, T, SOLID), counted(HEXAGON, 6, T, dotInk = T)),
    ),
    oddOneOut(
        Meta(
            95, "Hidden Agreement", 10, 120,
            "In four figures the small shapes inside share the colour of the large shape around them. In the odd figure the inner shapes are a different colour from their container.",
            listOf("Shapes, counts and positions all vary freely — they are distractions.", "Compare the inside with the outside of each figure."),
            listOf("abstract property"),
        ),
        odd = vessel(HEXAGON, G, TRIANGLE, CIRCLE, T),
        others = listOf(
            vessel(SQUARE, T, CIRCLE, STAR, T),
            vessel(PENTAGON, C, SQUARE, CIRCLE, C),
            vessel(HEXAGON, G, STAR, TRIANGLE, G),
            vessel(OCTAGON, N, TRIANGLE, DIAMOND, N),
        ),
    ),
    relation(
        Meta(
            96, "Name the Program", 10, 120,
            "Each figure is turned a quarter turn clockwise, its teal and gold parts swap colours, and solid and outlined fills trade places. Every other option fails on at least one of the two examples.",
            listOf("Check each option against both examples, not just the first.", "Look at position, colour and fill separately."),
            listOf("composite rule"),
        ),
        examples = listOf(specimenA, specimenB),
        rule = Transform.Then(Transform.Rotate(90), Transform.SwapInks(T, G), Transform.InvertFill),
        wrong = listOf(
            Transform.Then(Transform.Rotate(-90), Transform.SwapInks(T, G), Transform.InvertFill),
            Transform.Then(Transform.Reflect(Axis.DIAGONAL_DOWN), Transform.SwapInks(T, G), Transform.InvertFill),
            Transform.Then(Transform.Rotate(90), Transform.SwapInks(T, G)),
        ),
    ),
    sequence(
        Meta(
            97, "Spiral Growth", 10, 120,
            "Each count is the sum of the previous two (1, 1, 2, 3, 5 → 8); all arrows turn 90° clockwise every step; and the colour alternates navy and teal.",
            listOf("Three rules: count, direction and colour.", "The first two counts are equal — what kind of sequence starts that way?"),
            listOf("recursive sequence", "three rules"),
        ),
        frames = listOf(1, 1, 2, 3, 5).mapIndexed { i, n -> arrows(n, (90 * i) % 360, if (i % 2 == 0) N else T) },
        answer = arrows(8, 90, T),
        distractors = listOf(arrows(8, 0, T), arrows(7, 90, T), arrows(8, 90, N), arrows(10, 90, T)),
    ),
    matrix(
        Meta(
            98, "Composite Matrix", 10, 130,
            "Three rules: each row and column holds the flag, the L-shape and the arrow once; the third column's direction is the sum of the first two directions (measured clockwise from up); and every column has one more item than the column to its left.",
            listOf("Directions add along each row.", "The item count depends only on the column."),
            listOf("3×3 matrix", "three rules", "rotation arithmetic"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            val shapes = listOf(listOf(FLAG, L_SHAPE, ARROW), listOf(L_SHAPE, ARROW, FLAG), listOf(ARROW, FLAG, L_SHAPE))
            val rots = listOf(listOf(45, 90, 135), listOf(90, 135, 225), listOf(135, 180, 315))
            group(c + 1, shapes[r][c], rots[r][c])
        },
        distractors = { listOf(group(3, L_SHAPE, 270), group(3, L_SHAPE, 225), group(2, L_SHAPE, 315), group(3, FLAG, 315)) },
    ),
    analogy(
        Meta(
            99, "Three-Part Program", 10, 130,
            "Both examples apply the same program: move everything one cell down, turn the board half a turn, then swap navy and coral. Applied to the last board, the L-shape lands on the left edge.",
            listOf("Use both examples to rule out simpler programs.", "Find the move, the turn and the colour change."),
            listOf("analogy", "composition"),
        ),
        examples = listOf(board10a, board10b),
        query = query10,
        rule = finalRule,
        distractors = { _ ->
            listOf(
                Transform.Then(Transform.Shift(0, 1), Transform.Rotate(180)).apply(query10),
                Transform.Then(Transform.Rotate(180), Transform.SwapInks(N, C)).apply(query10),
                Transform.Then(Transform.Shift(0, 1), Transform.Reflect(Axis.HORIZONTAL), Transform.SwapInks(N, C)).apply(query10),
            )
        },
    ),
    matrix(
        Meta(
            100, "Mastermind", 10, 150,
            "Everything comes together: the number of arrows in the third column is the sum of the first two; each step to the right turns the arrows 90° clockwise and each step down adds 45°; and navy, teal and gold appear once in every row and column.",
            listOf("Count first, then direction, then colour.", "Direction depends on both the row and the column."),
            listOf("final challenge", "integration"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            val counts = listOf(listOf(1, 2, 3), listOf(2, 2, 4), listOf(3, 1, 4))
            val inks = listOf(listOf(N, T, G), listOf(T, G, N), listOf(G, N, T))
            group(counts[r][c], ARROW, 90 * c + 45 * r, inks[r][c])
        },
        distractors = { listOf(group(4, ARROW, 180, T), group(3, ARROW, 270, T), group(4, ARROW, 270, G), group(5, ARROW, 270, T)) },
    ),
)

