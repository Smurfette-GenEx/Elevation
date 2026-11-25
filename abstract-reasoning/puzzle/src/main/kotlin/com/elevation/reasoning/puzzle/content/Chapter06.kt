package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.engine.atRing
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Ink
import com.elevation.reasoning.puzzle.model.ShapeKind
import com.elevation.reasoning.puzzle.model.ShapeKind.ARROW
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.DIAMOND
import com.elevation.reasoning.puzzle.model.ShapeKind.FLAG
import com.elevation.reasoning.puzzle.model.ShapeKind.HEXAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.L_SHAPE
import com.elevation.reasoning.puzzle.model.ShapeKind.LINE
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE
import com.elevation.reasoning.puzzle.model.Sizes

private fun outward(ring: Int) = fig(el(ARROW, T, size = 0.24f, rot = 315 + 45 * ring).atRing(ring), board = true)

private fun outlines(vararg shapes: Pair<ShapeKind, Float>) = fig(shapes.map { (s, size) -> el(s, fill = OUT, size = size) })

/** Line segments around and across a square frame, used for XOR puzzles. */
internal enum class Seg { TOP, BOTTOM, LEFT, RIGHT, SLASH, BACKSLASH }

internal fun segs(vararg s: Seg, ink: Ink = N): Figure = fig(s.sortedBy { it.ordinal }.map { seg ->
    when (seg) {
        Seg.TOP -> el(LINE, ink, size = 0.62f, rot = 90, y = -0.62f)
        Seg.BOTTOM -> el(LINE, ink, size = 0.62f, rot = 90, y = 0.62f)
        Seg.LEFT -> el(LINE, ink, size = 0.62f, x = -0.62f)
        Seg.RIGHT -> el(LINE, ink, size = 0.62f, x = 0.62f)
        Seg.SLASH -> el(LINE, ink, size = 0.877f, rot = 45)
        Seg.BACKSLASH -> el(LINE, ink, size = 0.877f, rot = 135)
    }
})

private fun nest(circle: Float, square: Float, hexagon: Float): Figure {
    val items = listOf(
        el(CIRCLE, N, size = circle, tag = "circle"),
        el(SQUARE, T, size = square, tag = "square"),
        el(HEXAGON, G, size = hexagon, tag = "hexagon"),
    )
    return fig(items.sortedByDescending { it.size })
}

private const val BIG = 0.84f
private const val MID = 0.52f
private const val SMALL = 0.24f

private fun cycler(rot: Int, ink: Ink) = fig(el(FLAG, ink, size = Sizes.M, rot = rot))

private fun dial(ring: Int, line: Int) = fig(
    el(CIRCLE, C, size = 0.16f, tag = "dot").atRing(ring),
    el(LINE, size = 0.42f, rot = line, tag = "hand"),
    board = true,
)

private val machine = fig(
    el(FLAG, size = 0.34f, x = -0.38f, y = -0.38f),
    el(CIRCLE, T, size = 0.18f, x = 0.42f, y = 0.42f),
    el(SQUARE, G, size = 0.16f, x = 0.42f, y = -0.42f),
)

private fun Figure.without(shape: ShapeKind) = copy(elements = elements.filterNot { it.shape == shape })
private fun Figure.plus(e: Element) = copy(elements = elements + e)

/** Chapter 6 – Complex Transformations. */
internal val chapter06: List<PuzzleSpec> = listOf(
    sequence(
        Meta(
            51, "Facing Outwards", 6, 55,
            "The arrow moves one cell clockwise around the edge and turns 45° clockwise each step, so it always points away from the centre.",
            listOf("Where does the arrow point relative to the middle of the board?", "Moving and turning happen together, at the same pace."),
            listOf("rotation", "displacement"),
        ),
        frames = (0..3).map(::outward),
        answer = outward(4),
        distractors = listOf(
            fig(el(ARROW, T, size = 0.24f, rot = 90).atRing(4), board = true),
            fig(el(ARROW, T, size = 0.24f, rot = 135).atRing(3), board = true),
            fig(el(ARROW, T, size = 0.24f, rot = 315).atRing(4), board = true),
        ),
    ),
    matrix(
        Meta(
            52, "Merging Shapes", 6, 55,
            "In every row the third figure is the first two figures drawn on top of each other.",
            listOf("Look at what the third cell of the top row contains.", "Nothing is removed, and nothing new is added."),
            listOf("superposition", "3×3 matrix"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            val a = listOf(CIRCLE to 0.78f, TRIANGLE to 0.8f, SQUARE to 0.6f)[r]
            val b = listOf(SQUARE to 0.5f, DIAMOND to 0.46f, TRIANGLE to 0.42f)[r]
            when (c) {
                0 -> outlines(a)
                1 -> outlines(b)
                else -> outlines(a, b)
            }
        },
        distractors = {
            listOf(
                outlines(SQUARE to 0.6f),
                outlines(SQUARE to 0.6f, TRIANGLE to 0.42f, CIRCLE to 0.78f),
                outlines(SQUARE to 0.6f, DIAMOND to 0.46f),
                outlines(TRIANGLE to 0.42f),
            )
        },
    ),
    matrix(
        Meta(
            53, "Take Away", 7, 60,
            "In every row the dots in the middle cell are removed from the first cell; what remains appears in the third cell.",
            listOf("Compare the first and third cells of the top row.", "Which dots disappeared, and where were they shown?"),
            listOf("subtraction", "3×3 matrix"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            listOf(
                listOf(cells(setOf(0, 1, 2, 4)), cells(setOf(1, 4)), cells(setOf(0, 2))),
                listOf(cells(setOf(3, 4, 5, 7)), cells(setOf(3)), cells(setOf(4, 5, 7))),
                listOf(cells(setOf(0, 2, 4, 6, 8)), cells(setOf(4, 8)), cells(setOf(0, 2, 6))),
            )[r][c]
        },
        distractors = { listOf(cells(setOf(0, 2, 4, 6)), cells(setOf(0, 6, 8)), cells(setOf(0, 2, 6, 8)), cells(setOf(4, 8))) },
    ),
    matrix(
        Meta(
            54, "What Differs Remains", 7, 65,
            "Lines that appear in both of the first two cells cancel out; lines that appear in only one of them are kept in the third cell.",
            listOf("In the top row, which line is shared by the first two cells?", "Shared lines vanish; the rest survive."),
            listOf("exclusive or", "3×3 matrix"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            listOf(
                listOf(segs(Seg.TOP, Seg.LEFT), segs(Seg.TOP, Seg.RIGHT), segs(Seg.LEFT, Seg.RIGHT)),
                listOf(segs(Seg.SLASH, Seg.BOTTOM), segs(Seg.BOTTOM, Seg.BACKSLASH), segs(Seg.SLASH, Seg.BACKSLASH)),
                listOf(segs(Seg.TOP, Seg.SLASH, Seg.RIGHT), segs(Seg.SLASH, Seg.BOTTOM), segs(Seg.TOP, Seg.RIGHT, Seg.BOTTOM)),
            )[r][c]
        },
        distractors = {
            listOf(
                segs(Seg.TOP, Seg.SLASH, Seg.RIGHT, Seg.BOTTOM),
                segs(Seg.SLASH),
                segs(Seg.TOP, Seg.RIGHT),
                segs(Seg.TOP, Seg.BOTTOM),
            )
        },
    ),
    transformation(
        Meta(
            55, "Build and Rebuild", 7, 70,
            "Turn the group a quarter turn clockwise, remove the square, add a coral L-shape at the top edge, then mirror everything left–right — the new L-shape is mirrored too.",
            listOf("Steps that add or remove shapes change what later steps act on.", "After the final mirror, which way does the added L-shape face?"),
            listOf("composition", "addition", "subtraction"),
        ),
        start = machine,
        steps = listOf(
            Transform.Rotate(90),
            Transform.Remove(SQUARE),
            Transform.Add(el(L_SHAPE, C, size = 0.18f, y = -0.7f)),
            Transform.Reflect(Axis.VERTICAL),
        ),
        distractors = listOf(
            Transform.Reflect(Axis.VERTICAL).apply(machine.rotate90().without(SQUARE)).plus(el(L_SHAPE, C, size = 0.18f, y = -0.7f)),
            Transform.Reflect(Axis.VERTICAL).apply(machine.rotate90().plus(el(L_SHAPE, C, size = 0.18f, y = -0.7f))),
            machine.rotate90().without(SQUARE).plus(el(L_SHAPE, C, size = 0.18f, y = -0.7f)),
        ),
    ),
    sequence(
        Meta(
            56, "Inside Out", 7, 60,
            "The three nested shapes trade places in a cycle: at each step the outer shape becomes the inner one, and the others move one layer outwards.",
            listOf("Follow one shape, such as the navy circle, through the layers.", "The order of the layers repeats every three steps."),
            listOf("nesting", "cycle"),
        ),
        frames = listOf(
            nest(BIG, MID, SMALL), nest(SMALL, BIG, MID), nest(MID, SMALL, BIG),
            nest(BIG, MID, SMALL), nest(SMALL, BIG, MID),
        ),
        answer = nest(MID, SMALL, BIG),
        distractors = listOf(nest(BIG, MID, SMALL), nest(SMALL, BIG, MID), nest(MID, BIG, SMALL)),
    ),
    sequence(
        Meta(
            57, "Two Clocks", 7, 65,
            "Direction repeats every three steps (up, right, down) while colour repeats every four (navy, teal, gold, coral). Each cycle continues independently.",
            listOf("Find how often the direction repeats.", "Then, separately, find how often the colour repeats."),
            listOf("cycles", "two rules"),
        ),
        frames = listOf(0 to N, 90 to T, 180 to G, 0 to C, 90 to N, 180 to T).map { (r, c) -> cycler(r, c) },
        answer = cycler(0, G),
        distractors = listOf(cycler(0, N), cycler(270, G), cycler(180, G), cycler(0, C)),
    ),
    relation(
        Meta(
            58, "Order Matters", 7, 65,
            "Each figure is turned a quarter turn clockwise and then mirrored left–right. Doing the same two steps in the other order gives a different result.",
            listOf("Find a turn and a mirror that together produce the right-hand flag.", "Test the order of the two steps on the flag."),
            listOf("composition", "order of operations"),
        ),
        examples = listOf(fig(el(FLAG)), fig(el(ARROW, T, size = 0.4f, x = -0.4f, y = -0.3f), el(CIRCLE, G, size = 0.2f, x = 0.45f, y = 0.45f))),
        rule = Transform.Then(Transform.Rotate(90), Transform.Reflect(Axis.VERTICAL)),
        wrong = listOf(
            Transform.Then(Transform.Reflect(Axis.VERTICAL), Transform.Rotate(90)),
            Transform.Rotate(-90),
            Transform.Reflect(Axis.HORIZONTAL),
        ),
    ),
    matrix(
        Meta(
            59, "Clockwork", 7, 65,
            "Along each row the coral dot moves one cell clockwise around the edge while the hand turns 45° clockwise. Each row starts two cells and 45° further on.",
            listOf("Treat the dot and the hand as two separate rules.", "A line looks the same after a half turn."),
            listOf("3×3 matrix", "rotation", "displacement"),
        ),
        rows = 3, cols = 3,
        cell = { r, c -> dial(2 * r + c, 45 * (r + c)) },
        distractors = { listOf(dial(6, 135), dial(5, 0), dial(6, 90), dial(7, 0)) },
    ),
    transformation(
        Meta(
            60, "Assembly Line", 7, 75,
            "Turn the group a quarter turn clockwise, remove the gold square, swap navy and teal, then mirror top–bottom. Keep track of colours and positions separately.",
            listOf("Work through one step at a time; draw it if needed.", "A colour swap changes colours only, not positions."),
            listOf("composition", "colour", "reflection"),
        ),
        start = machine,
        steps = listOf(Transform.Rotate(90), Transform.Remove(SQUARE), Transform.SwapInks(N, T), Transform.Reflect(Axis.HORIZONTAL)),
        distractors = listOf(
            Transform.Then(Transform.Rotate(90), Transform.Remove(SQUARE), Transform.Reflect(Axis.HORIZONTAL)).apply(machine),
            Transform.Then(Transform.Rotate(90), Transform.Remove(SQUARE), Transform.SwapInks(N, T), Transform.Reflect(Axis.VERTICAL)).apply(machine),
            Transform.Then(Transform.Rotate(90), Transform.SwapInks(N, T), Transform.Reflect(Axis.HORIZONTAL)).apply(machine),
        ),
    ),
)

private fun Figure.rotate90() = Transform.Rotate(90).apply(this)
