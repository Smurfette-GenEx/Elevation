package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.engine.atRing
import com.elevation.reasoning.puzzle.model.Lattice
import com.elevation.reasoning.puzzle.model.ShapeKind.ARROW
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.FLAG
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE

private fun trio(order: List<com.elevation.reasoning.puzzle.model.ShapeKind>) =
    fig(order.mapIndexed { i, s -> el(s, size = 0.26f, x = Lattice.x(i), tag = s.name) })

private fun twoRows(circles: Int, squares: Int): com.elevation.reasoning.puzzle.model.Figure =
    fig(rowOf(circles, CIRCLE, size = 0.13f, y = -0.4f, spacing = 0.34f) + rowOf(squares, SQUARE, T, size = 0.12f, y = 0.4f, spacing = 0.34f))

private fun runner(a: Int, b: Int, aShape: com.elevation.reasoning.puzzle.model.ShapeKind = CIRCLE): com.elevation.reasoning.puzzle.model.Figure = fig(
    el(aShape, T, size = 0.24f, tag = "a").atRing(a),
    el(SQUARE, G, size = 0.22f, tag = "b").atRing(b),
    board = true,
)

private fun twoArrows(top: Int, bottom: Int) = fig(
    el(ARROW, size = 0.36f, rot = top, y = -0.45f, tag = "top"),
    el(ARROW, T, size = 0.36f, rot = bottom, y = 0.45f, tag = "bottom"),
)

private fun row4(circles: Int, lastOutlined: Boolean = false): com.elevation.reasoning.puzzle.model.Figure =
    fig((0 until 4).map { i ->
        val shape = if (i < circles) CIRCLE else TRIANGLE
        val fill = if (lastOutlined && i == 3) OUT else SOLID
        el(shape, fill = fill, size = 0.17f, x = (i - 1.5f) * 0.44f)
    })

private fun orbit(ring: Int, rot: Int): com.elevation.reasoning.puzzle.model.Figure =
    fig(el(ARROW, T, size = 0.25f, rot = rot).atRing(ring), board = true)

/** Chapter 2 – Sequences and Transformations. */
internal val chapter02: List<PuzzleSpec> = listOf(
    sequence(
        Meta(
            11, "Backwards Turn", 3, 30,
            "The arrow turns 45° counter-clockwise at every step: up, up-left, left, down-left… so next it points straight down.",
            listOf("Which way is the arrow turning: clockwise or counter-clockwise?", "Each step is an eighth of a turn."),
            listOf("rotation", "counter-clockwise"),
        ),
        frames = listOf(0, 315, 270, 225).map { fig(el(ARROW, rot = it)) },
        answer = fig(el(ARROW, rot = 180)),
        distractors = listOf(135, 0, 225).map { fig(el(ARROW, rot = it)) },
    ),
    sequence(
        Meta(
            12, "Musical Chairs", 3, 35,
            "Every shape moves one place to the left at each step, and the shape on the far left wraps around to the right.",
            listOf("Follow a single shape, such as the circle.", "Shapes leaving on one side come back on the other."),
            listOf("position", "cycle"),
        ),
        frames = listOf(
            listOf(CIRCLE, SQUARE, TRIANGLE),
            listOf(SQUARE, TRIANGLE, CIRCLE),
            listOf(TRIANGLE, CIRCLE, SQUARE),
            listOf(CIRCLE, SQUARE, TRIANGLE),
        ).map(::trio),
        answer = trio(listOf(SQUARE, TRIANGLE, CIRCLE)),
        distractors = listOf(
            trio(listOf(CIRCLE, SQUARE, TRIANGLE)),
            trio(listOf(TRIANGLE, CIRCLE, SQUARE)),
            trio(listOf(SQUARE, CIRCLE, TRIANGLE)),
        ),
    ),
    transformation(
        Meta(
            13, "Turn, Then Flip", 3, 40,
            "Turning the flag 90° clockwise lays the pole along the top with the pennant hanging down at the right end; mirroring left–right then moves the pennant to the left end.",
            listOf("Do one step at a time and picture the flag after each.", "After the turn the pennant hangs down at one end. Which end is it on after the mirror?"),
            listOf("rotation", "reflection", "order of operations"),
        ),
        start = fig(el(FLAG)),
        steps = listOf(Transform.Rotate(90), Transform.Reflect(Axis.VERTICAL)),
        distractors = listOf(
            Transform.Rotate(90).apply(fig(el(FLAG))),
            Transform.Reflect(Axis.VERTICAL).apply(fig(el(FLAG))),
            Transform.Then(Transform.Reflect(Axis.VERTICAL), Transform.Rotate(90)).apply(fig(el(FLAG))),
        ),
    ),
    relation(
        Meta(
            14, "Which Way?", 3, 35,
            "Both figures turn a quarter turn counter-clockwise: the arrow goes from pointing up to pointing left.",
            listOf("Look at where the tip of the arrow ends up.", "Is the turn clockwise or counter-clockwise, and by how much?"),
            listOf("rotation", "counter-clockwise"),
        ),
        examples = listOf(fig(el(ARROW)), fig(el(FLAG, T))),
        rule = Transform.Rotate(-90),
        wrong = listOf(Transform.Rotate(90), Transform.Rotate(180), Transform.Reflect(Axis.VERTICAL)),
    ),
    sequence(
        Meta(
            15, "Passing Each Other", 4, 40,
            "The teal circle moves one cell clockwise around the board's edge each step, while the gold square moves one cell counter-clockwise.",
            listOf("Track the circle and the square separately.", "They travel around the edge in opposite directions."),
            listOf("movement", "two rules"),
        ),
        frames = listOf(0 to 3, 1 to 2, 2 to 1, 3 to 0).map { (a, b) -> runner(a, b) },
        answer = runner(4, 7),
        distractors = listOf(runner(4, 0), runner(2, 7), fig(el(CIRCLE, G, size = 0.24f).atRing(7), el(SQUARE, T, size = 0.22f).atRing(4), board = true)),
    ),
    sequence(
        Meta(
            16, "Spin and Switch", 4, 35,
            "Two rules work together: the arrow turns 90° clockwise each step, and its colour alternates navy, teal, navy, teal.",
            listOf("Treat direction and colour as two separate patterns.", "The colour flips every step; the arrow turns a quarter turn."),
            listOf("rotation", "alternation", "two rules"),
        ),
        frames = listOf(0 to N, 90 to T, 180 to N, 270 to T).map { (r, c) -> fig(el(ARROW, c, rot = r)) },
        answer = fig(el(ARROW, N, rot = 0)),
        distractors = listOf(fig(el(ARROW, T, rot = 0)), fig(el(ARROW, N, rot = 90)), fig(el(ARROW, T, rot = 90))),
    ),
    sequence(
        Meta(
            17, "Rise and Fall", 4, 35,
            "The navy circles increase by one while the teal squares decrease by one, so the total always stays five.",
            listOf("Count the circles and the squares separately.", "One group grows exactly as fast as the other shrinks."),
            listOf("quantity", "two rules"),
        ),
        frames = (1..4).map { twoRows(it, 5 - it) },
        answer = twoRows(5, 0),
        distractors = listOf(twoRows(4, 1), twoRows(5, 1), twoRows(0, 5)),
    ),
    sequence(
        Meta(
            18, "Opposite Spins", 4, 40,
            "The top arrow turns 90° clockwise each step while the bottom arrow turns 90° counter-clockwise.",
            listOf("Follow the top arrow on its own, then the bottom arrow.", "The two arrows turn by the same amount but in opposite directions."),
            listOf("rotation", "counter-clockwise", "two rules"),
        ),
        frames = listOf(0 to 90, 90 to 0, 180 to 270, 270 to 180).map { (t, b) -> twoArrows(t, b) },
        answer = twoArrows(0, 90),
        distractors = listOf(twoArrows(0, 270), twoArrows(180, 90), twoArrows(90, 90)),
    ),
    sequence(
        Meta(
            19, "Replacement", 4, 35,
            "At each step one more triangle, from left to right, is replaced by a circle. Next all four are circles.",
            listOf("Count circles and triangles.", "Each step replaces exactly one shape."),
            listOf("replacement", "quantity"),
        ),
        frames = (0..3).map { row4(it) },
        answer = row4(4),
        distractors = listOf(row4(3), fig(row4(1).elements.reversed().mapIndexed { i, e -> e.copy(x = (i - 1.5f) * 0.44f) }), row4(4, lastOutlined = true)),
    ),
    sequence(
        Meta(
            20, "Orbit", 5, 45,
            "Two rules combine: the arrow moves one cell clockwise around the edge, and it turns 90° clockwise at every step.",
            listOf("Separate the movement from the turning.", "Position: one cell along the edge. Direction: a quarter turn."),
            listOf("movement", "rotation", "two rules"),
        ),
        frames = (0..3).map { orbit(it, it * 90) },
        answer = orbit(4, 0),
        distractors = listOf(orbit(4, 90), orbit(3, 0), orbit(4, 270)),
    ),
)

