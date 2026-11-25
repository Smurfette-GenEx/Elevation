package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.engine.at
import com.elevation.reasoning.puzzle.engine.atRing
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.Ink
import com.elevation.reasoning.puzzle.model.ShapeKind
import com.elevation.reasoning.puzzle.model.ShapeKind.ARROW
import com.elevation.reasoning.puzzle.model.ShapeKind.CHEVRON
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.CROSS
import com.elevation.reasoning.puzzle.model.ShapeKind.DIAMOND
import com.elevation.reasoning.puzzle.model.ShapeKind.FLAG
import com.elevation.reasoning.puzzle.model.ShapeKind.HEPTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.HEXAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.L_SHAPE
import com.elevation.reasoning.puzzle.model.ShapeKind.OCTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.PENTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.RIGHT_TRIANGLE
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.STAR
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE
import com.elevation.reasoning.puzzle.model.Sizes

private fun satellites(k: Int, rot: Int, ink: Ink) = fig(
    listOf(el(ARROW, ink, size = 0.4f, rot = rot, tag = "arrow")) +
        (0 until k).map { el(CIRCLE, C, size = 0.11f).atRing(it) },
    board = true,
)

private fun rhythm(ring: Int, flag: Int) = fig(
    el(CIRCLE, C, size = 0.16f, tag = "dot").atRing(ring),
    el(FLAG, N, size = 0.34f, rot = flag, tag = "flag"),
    board = true,
)

/** Small shapes at lattice cells. */
internal fun placed(vararg items: Pair<Int, ShapeKind>, ink: Ink = N) =
    fig(items.sortedBy { it.first }.map { (i, s) -> val (x, y) = cellXY(i); el(s, ink, size = 0.2f, x = x, y = y) }, board = true)

private fun pinwheel(shape: ShapeKind, ink: Ink, slots: List<Int>, rots: List<Int>) =
    fig(slots.indices.map { i -> el(shape, ink, size = 0.24f, rot = rots[i]).atRing(slots[i]) })

private fun polygonPair(a: ShapeKind, ink: Ink) = fig(el(a, ink, OUT, Sizes.M))

private fun ticker(dots: Int, rot: Int) = fig(
    listOf(el(ARROW, T, size = 0.36f, rot = rot, y = -0.3f, tag = "arrow")) + rowOf(dots, CIRCLE, N, size = 0.09f, y = 0.6f, spacing = 0.24f),
)

private val traveller = fig(
    el(ARROW, T, size = 0.24f).at(0, 1),
    el(SQUARE, G, size = 0.2f).at(1, 0),
    board = true,
)

private val composite9 = fig(el(ARROW, N, size = 0.26f).at(0, 0), el(CIRCLE, C, size = 0.2f).at(1, 1), board = true)
private val composite9b = fig(el(FLAG, T, size = 0.26f).at(1, 0), el(SQUARE, G, size = 0.2f).at(0, 2), board = true)
private val query9 = fig(el(L_SHAPE, G, size = 0.26f).at(0, 1), el(TRIANGLE, C, size = 0.22f).at(1, 0), board = true)
private val shiftTurn = Transform.Then(Transform.Shift(1, 0), Transform.Rotate(90))

private fun rule3(shapes: List<ShapeKind>, inks: List<Ink>, fill: Fill) = trioOf(shapes, inks, shapes.map { fill })

/** Chapter 9 – Expert Challenges. */
internal val chapter09: List<PuzzleSpec> = listOf(
    sequence(
        Meta(
            81, "Satellites", 9, 90,
            "Three rules run in parallel: the arrow turns 90° clockwise, its colour cycles navy → teal → gold, and one more coral satellite joins the ring (filling clockwise from the top-left).",
            listOf("Track the arrow's direction, the arrow's colour and the satellites separately.", "Each rule moves forward by exactly one step per figure."),
            listOf("three rules"),
        ),
        frames = (0..4).map { satellites(it + 1, (it * 90) % 360, listOf(N, T, G)[it % 3]) },
        answer = satellites(6, 90, G),
        distractors = listOf(satellites(6, 90, T), satellites(5, 90, G), satellites(6, 180, G), satellites(7, 90, G)),
    ),
    matrix(
        Meta(
            82, "Four Dimensions", 9, 100,
            "Four rules: each row and column holds an arrow, a flag and a chevron once; colours form their own once-per-row-and-column pattern; each column has its own fill; and each row turns its figures 45° further than the row above.",
            listOf("Solve one attribute at a time: shape, colour, fill, direction.", "Direction depends only on the row; fill only on the column."),
            listOf("3×3 matrix", "four rules"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            val shapes = listOf(listOf(ARROW, FLAG, CHEVRON), listOf(FLAG, CHEVRON, ARROW), listOf(CHEVRON, ARROW, FLAG))
            val inks = listOf(listOf(N, T, G), listOf(G, N, T), listOf(T, G, N))
            fig(el(shapes[r][c], inks[r][c], listOf(SOLID, STRIPE, OUT)[c], Sizes.M, rot = 45 * r))
        },
        distractors = { a ->
            listOf(
                fig(el(FLAG, N, OUT, Sizes.M, rot = 45)),
                fig(el(FLAG, T, OUT, Sizes.M, rot = 90)),
                fig(el(CHEVRON, N, OUT, Sizes.M, rot = 90)),
                fig(el(FLAG, N, STRIPE, Sizes.M, rot = 90)),
            )
        },
    ),
    transformation(
        Meta(
            83, "Long Journey", 9, 110,
            "Moves and turns of the whole board both carry the pieces: after shifting right, turning, shifting up, mirroring and turning back, the arrow ends at the left-middle cell pointing down and the square at the bottom-middle; the last step empties their fills.",
            listOf("Track the two pieces' cells after every step.", "A turn of the board moves edge cells around the centre."),
            listOf("spatial composition", "six steps"),
        ),
        start = traveller,
        steps = listOf(
            Transform.Shift(1, 0),
            Transform.Rotate(90),
            Transform.Shift(0, -1),
            Transform.Reflect(Axis.VERTICAL),
            Transform.Rotate(-90),
            Transform.InvertFill,
        ),
        distractors = listOf(
            Transform.Then(Transform.Shift(1, 0), Transform.Rotate(90), Transform.Shift(0, -1), Transform.Reflect(Axis.VERTICAL), Transform.Rotate(90), Transform.InvertFill).apply(traveller),
            Transform.Then(Transform.Shift(1, 0), Transform.Rotate(90), Transform.Shift(0, -1), Transform.Rotate(-90), Transform.InvertFill).apply(traveller),
            Transform.Then(Transform.Shift(1, 0), Transform.Rotate(90), Transform.Shift(0, -1), Transform.Reflect(Axis.VERTICAL), Transform.Rotate(-90)).apply(traveller),
        ),
    ),
    sequence(
        Meta(
            84, "Uneven Steps", 9, 95,
            "The coral dot alternates between moving one cell and two cells clockwise around the edge (+1, +2, +1, +2…), while the flag turns 90° counter-clockwise every step.",
            listOf("Measure how far the dot moves each time.", "The step sizes repeat in a short rhythm."),
            listOf("irregular rhythm", "two rules"),
        ),
        frames = listOf(0, 1, 3, 4, 6, 7).mapIndexed { i, ring -> rhythm(ring, (360 - 90 * i) % 360) },
        answer = rhythm(1, 180),
        distractors = listOf(rhythm(0, 180), rhythm(1, 270), rhythm(2, 180), rhythm(1, 90)),
    ),
    analogy(
        Meta(
            85, "Slide and Spin", 9, 100,
            "Each board is slid one cell to the right and then turned a quarter turn clockwise. The slide happens before the turn, so pieces travel around the centre afterwards.",
            listOf("Use both examples to pin down the rule.", "Try one move, then one turn of the whole board."),
            listOf("analogy", "displacement", "rotation"),
        ),
        examples = listOf(composite9, composite9b),
        query = query9,
        rule = shiftTurn,
        distractors = { a ->
            listOf(
                Transform.Rotate(90).apply(query9),
                Transform.Then(Transform.Rotate(90), Transform.Shift(-1, 0)).apply(query9),
                Transform.Then(Transform.Shift(1, 0), Transform.Rotate(-90)).apply(query9),
            )
        },
    ),
    matrix(
        Meta(
            86, "Removal Order", 9, 95,
            "In every row the shapes shown in the middle cell are taken away from the first cell, leaving the third cell. In the bottom row the triangle and the diamond are removed.",
            listOf("Compare the first and last cells of the top row.", "The middle cell lists what disappears."),
            listOf("subtraction", "3×3 matrix"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            listOf(
                listOf(placed(0 to CIRCLE, 2 to SQUARE, 4 to TRIANGLE, 6 to STAR), placed(2 to SQUARE, 6 to STAR), placed(0 to CIRCLE, 4 to TRIANGLE)),
                listOf(placed(1 to DIAMOND, 3 to CIRCLE, 5 to CROSS, 7 to SQUARE), placed(1 to DIAMOND), placed(3 to CIRCLE, 5 to CROSS, 7 to SQUARE)),
                listOf(placed(0 to TRIANGLE, 2 to CIRCLE, 6 to SQUARE, 8 to DIAMOND), placed(0 to TRIANGLE, 8 to DIAMOND), placed(2 to CIRCLE, 6 to SQUARE)),
            )[r][c]
        },
        distractors = {
            listOf(
                placed(0 to TRIANGLE, 2 to CIRCLE, 6 to SQUARE),
                placed(0 to TRIANGLE, 8 to DIAMOND),
                placed(2 to SQUARE, 6 to CIRCLE),
                placed(2 to CIRCLE),
            )
        },
    ),
    ruleDeduction(
        Meta(
            87, "Three Conditions", 9, 100,
            "A figure obeys the rules when it has an odd number of shapes, includes at least one coral shape, and all its shapes share one fill. Each counter-example breaks exactly one condition.",
            listOf("Find what every top figure has in common — there are three things.", "Check count, colour and fill for each option."),
            listOf("rule induction", "three rules"),
        ),
        follows = listOf(
            rule3(listOf(CIRCLE, SQUARE, TRIANGLE), listOf(C, N, T), SOLID),
            rule3(listOf(STAR, DIAMOND, HEXAGON, CROSS, CIRCLE), listOf(G, C, N, C, T), OUT),
            fig(el(TRIANGLE, C, STRIPE, Sizes.M)),
        ),
        breaks = listOf(
            rule3(listOf(SQUARE, STAR, CIRCLE, DIAMOND), listOf(C, T, G, N), SOLID),
            rule3(listOf(HEXAGON, CIRCLE, STAR), listOf(N, T, G), OUT),
            trioOf(listOf(DIAMOND, TRIANGLE, SQUARE), listOf(C, N, G), listOf(SOLID, OUT, SOLID)),
        ),
        answer = rule3(listOf(CROSS, STAR, CIRCLE, TRIANGLE, SQUARE), listOf(T, C, N, G, N), STRIPE),
        distractors = listOf(
            rule3(listOf(CROSS, STAR, CIRCLE, TRIANGLE), listOf(T, C, N, G), STRIPE),
            rule3(listOf(CROSS, STAR, CIRCLE, TRIANGLE, SQUARE), listOf(T, G, N, G, N), STRIPE),
            trioOf(listOf(CROSS, STAR, CIRCLE, TRIANGLE, SQUARE), listOf(T, C, N, G, N), listOf(STRIPE, STRIPE, OUT, STRIPE, STRIPE)),
        ),
    ),
    oddOneOut(
        Meta(
            88, "Pinwheels", 9, 100,
            "Four figures look the same after a quarter turn — they are pinwheels. The odd figure only repeats after a full turn because its L-shapes alternate between two orientations.",
            listOf("Imagine turning each figure by 90°.", "Which figure would look different after the turn?"),
            listOf("rotational symmetry"),
        ),
        odd = pinwheel(L_SHAPE, N, listOf(0, 2, 4, 6), listOf(0, 90, 0, 90)),
        others = listOf(
            pinwheel(FLAG, N, listOf(1, 3, 5, 7), listOf(0, 90, 180, 270)),
            pinwheel(L_SHAPE, T, listOf(0, 2, 4, 6), listOf(0, 90, 180, 270)),
            pinwheel(RIGHT_TRIANGLE, G, listOf(1, 3, 5, 7), listOf(0, 90, 180, 270)),
            pinwheel(ARROW, C, listOf(1, 3, 5, 7), listOf(90, 180, 270, 0)),
        ),
    ),
    sequence(
        Meta(
            89, "Turn or Count", 9, 95,
            "Two actions alternate: turn the arrow 90° clockwise, then add a dot, then turn again, then add a dot… The last action was a turn, so the next action adds a fourth dot.",
            listOf("Only one thing changes between neighbouring figures.", "Which change happened last?"),
            listOf("alternating rules"),
        ),
        frames = listOf(1 to 0, 1 to 90, 2 to 90, 2 to 180, 3 to 180, 3 to 270).map { (d, r) -> ticker(d, r) },
        answer = ticker(4, 270),
        distractors = listOf(ticker(3, 0), ticker(4, 0), ticker(5, 270), ticker(4, 180)),
    ),
    matrix(
        Meta(
            90, "Side Arithmetic", 10, 110,
            "In every row the number of sides of the third shape is the total of the first two shapes' sides: 3+3=6, 4+3=7, 5+3=8. Colours follow a once-per-row-and-column pattern.",
            listOf("Count the sides of every shape in the top row.", "Then decide the colour from the row and column."),
            listOf("3×3 matrix", "arithmetic", "symbolic"),
        ),
        rows = 3, cols = 3,
        cell = { r, c ->
            val shapes = listOf(listOf(TRIANGLE, TRIANGLE, HEXAGON), listOf(SQUARE, TRIANGLE, HEPTAGON), listOf(PENTAGON, TRIANGLE, OCTAGON))
            val inks = listOf(listOf(N, T, G), listOf(T, G, N), listOf(G, N, T))
            polygonPair(shapes[r][c], inks[r][c])
        },
        distractors = { listOf(polygonPair(HEPTAGON, T), polygonPair(OCTAGON, G), polygonPair(HEXAGON, T), polygonPair(OCTAGON, N)) },
    ),
)

