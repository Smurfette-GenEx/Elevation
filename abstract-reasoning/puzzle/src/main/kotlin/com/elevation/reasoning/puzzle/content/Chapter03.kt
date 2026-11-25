package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.engine.at
import com.elevation.reasoning.puzzle.engine.atRing
import com.elevation.reasoning.puzzle.engine.reflect
import com.elevation.reasoning.puzzle.engine.rotate
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.ShapeKind.ARROW
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.DIAMOND
import com.elevation.reasoning.puzzle.model.ShapeKind.FLAG
import com.elevation.reasoning.puzzle.model.ShapeKind.HEXAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.L_SHAPE
import com.elevation.reasoning.puzzle.model.ShapeKind.PENTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE
import com.elevation.reasoning.puzzle.model.Sizes

private fun withDots(shape: com.elevation.reasoning.puzzle.model.ShapeKind, size: Float, d1: Pair<Float, Float>, d2: Pair<Float, Float>, sy: Float = 0f) = fig(
    el(shape, size = size, y = sy),
    el(CIRCLE, T, size = Sizes.DOT, x = d1.first, y = d1.second),
    el(CIRCLE, T, size = Sizes.DOT, x = d2.first, y = d2.second),
)

private fun stepper(c: Int, s: Int) = fig(
    el(CIRCLE, T, size = 0.24f, tag = "c").at(c, 0),
    el(SQUARE, G, size = 0.22f, tag = "s").at(1, s),
    board = true,
)

private val tromino = fig(
    el(SQUARE, size = 0.24f, tag = "a").at(0, 0),
    el(SQUARE, size = 0.24f, tag = "b").at(1, 0),
    el(CIRCLE, C, size = 0.24f, tag = "c").at(0, 1),
    board = true,
)

private fun pair(cx: Float, cy: Float, tx: Float, ty: Float) = fig(
    el(TRIANGLE, size = Sizes.S, x = tx, y = ty),
    el(CIRCLE, T, size = 0.2f, x = cx, y = cy),
)

private val composite = fig(
    el(FLAG, size = 0.34f, x = -0.4f, y = -0.4f),
    el(CIRCLE, T, size = 0.18f, x = 0.45f, y = 0.45f),
    el(TRIANGLE, G, size = 0.2f, x = 0.45f, y = -0.45f),
)

/** Chapter 3 – Spatial Reasoning. */
internal val chapter03: List<PuzzleSpec> = listOf(
    relation(
        Meta(
            21, "Mirror Image", 4, 35,
            "Each right-hand figure is the left-hand figure seen in a vertical mirror: left and right swap, top and bottom stay put.",
            listOf("Which parts stayed where they were, and which moved?", "The tops stay at the top, so this is not a turn."),
            listOf("reflection"),
        ),
        examples = listOf(fig(el(FLAG)), fig(el(L_SHAPE, T))),
        rule = Transform.Reflect(Axis.VERTICAL),
        wrong = listOf(Transform.Reflect(Axis.HORIZONTAL), Transform.Rotate(180), Transform.Rotate(90)),
    ),
    oddOneOut(
        Meta(
            22, "Balance", 4, 40,
            "Four figures are mirror-symmetric about a vertical line through their centre. In the diamond figure the two dots sit on opposite diagonal corners, so its left and right halves do not match.",
            listOf("Imagine folding each figure down the middle.", "Do the left and right halves match exactly?"),
            listOf("symmetry"),
        ),
        odd = withDots(DIAMOND, Sizes.L, -0.6f to -0.6f, 0.6f to 0.6f),
        others = listOf(
            withDots(TRIANGLE, Sizes.L, -0.6f to 0.68f, 0.6f to 0.68f, sy = 0.05f),
            withDots(SQUARE, Sizes.M, -0.62f to -0.62f, 0.62f to -0.62f),
            withDots(PENTAGON, Sizes.L, -0.78f to 0f, 0.78f to 0f),
            withDots(HEXAGON, Sizes.M, -0.62f to 0.62f, 0.62f to 0.62f),
        ),
    ),
    analogy(
        Meta(
            23, "Upside Down", 4, 40,
            "The pair is reflected in a horizontal mirror: everything at the top moves to the bottom and shapes flip vertically, while left and right stay put.",
            listOf("Compare which corner each shape is in before and after.", "Left stays left; top becomes bottom."),
            listOf("reflection", "position"),
        ),
        examples = listOf(fig(el(FLAG, size = 0.34f, x = -0.4f, y = -0.4f), el(CIRCLE, T, size = 0.2f, x = 0.42f, y = 0.42f))),
        query = fig(el(L_SHAPE, size = 0.34f, x = 0.4f, y = -0.35f), el(TRIANGLE, G, size = 0.22f, x = -0.42f, y = 0.42f)),
        rule = Transform.Reflect(Axis.HORIZONTAL),
        distractors = { a ->
            val q = a.reflect(Axis.HORIZONTAL)
            listOf(q, q.reflect(Axis.VERTICAL), q.rotate(180))
        },
    ),
    transformation(
        Meta(
            24, "Turn the Board", 5, 50,
            "Rotating the whole board carries the arrow with it: from the top-middle it travels to the right-middle and points right. Moving down puts it in the bottom-right corner, and the mirror sends it to the bottom-left, pointing left.",
            listOf("When the whole board turns, the arrow's position turns too.", "Track position and direction separately after each step."),
            listOf("rotation", "position", "reflection"),
        ),
        start = fig(el(ARROW, T, size = 0.26f).at(1, 0), board = true),
        steps = listOf(Transform.Rotate(90), Transform.Shift(0, 1), Transform.Reflect(Axis.VERTICAL)),
        distractors = listOf(
            fig(el(ARROW, T, size = 0.26f, rot = 270).at(2, 2), board = true),
            fig(el(ARROW, T, size = 0.26f, rot = 90).at(0, 2), board = true),
            fig(el(ARROW, T, size = 0.26f, rot = 270).at(0, 0), board = true),
        ),
    ),
    sequence(
        Meta(
            25, "Crossing Paths", 5, 45,
            "The teal circle moves one cell right each step and the gold square one cell down; both wrap around to the other side of the board when they reach the edge.",
            listOf("Follow each shape separately.", "When a shape leaves the board it re-enters on the opposite side."),
            listOf("movement", "wrap-around"),
        ),
        frames = listOf(0 to 1, 1 to 2, 2 to 0, 0 to 1).map { (c, s) -> stepper(c, s) },
        answer = stepper(1, 2),
        distractors = listOf(stepper(2, 2), stepper(1, 1), fig(el(CIRCLE, T, size = 0.24f).at(1, 0), el(SQUARE, G, size = 0.22f).at(2, 2), board = true)),
    ),
    sequence(
        Meta(
            26, "Turning Block", 5, 45,
            "The whole group of three pieces turns a quarter turn clockwise around the centre of the board at every step.",
            listOf("Follow the coral circle around the board.", "The pieces keep their arrangement; only the group turns."),
            listOf("rotation", "orientation"),
        ),
        frames = listOf(0, 90, 180).map { tromino.rotate(it) },
        answer = tromino.rotate(270),
        distractors = listOf(tromino.rotate(90), tromino, tromino.rotate(270).reflect(Axis.VERTICAL)),
    ),
    relation(
        Meta(
            27, "Half Turn", 5, 45,
            "Both figures are turned upside down by a half turn (180°). The arrow alone cannot tell a half turn from a top–bottom mirror, but the flag can: its pennant points left afterwards, so it was turned rather than mirrored.",
            listOf("Use the flag: which way does the pennant point afterwards?", "A mirror never changes which way a pennant faces along the mirror line."),
            listOf("rotation", "reflection"),
        ),
        examples = listOf(fig(el(ARROW)), fig(el(FLAG, T))),
        rule = Transform.Rotate(180),
        wrong = listOf(Transform.Reflect(Axis.HORIZONTAL), Transform.Reflect(Axis.VERTICAL), Transform.Rotate(90)),
    ),
    transformation(
        Meta(
            28, "Back Where It Started?", 5, 50,
            "Turn, mirror, turn: the two quarter turns cancel out through the mirror, so the overall effect is a single left–right mirror of the original flag.",
            listOf("Apply the steps one by one with care.", "Compare your result with the original flag: what single change would do the same?"),
            listOf("rotation", "reflection", "composition"),
        ),
        start = fig(el(FLAG, G)),
        steps = listOf(Transform.Rotate(90), Transform.Reflect(Axis.VERTICAL), Transform.Rotate(90)),
        distractors = listOf(fig(el(FLAG, G)), fig(el(FLAG, G)).rotate(180), fig(el(FLAG, G)).reflect(Axis.HORIZONTAL)),
    ),
    oddOneOut(
        Meta(
            29, "Above and Below", 5, 45,
            "In four figures the circle is higher than the triangle. In one figure the circle sits below the triangle.",
            listOf("Ignore left and right; compare heights.", "Where is the circle relative to the triangle?"),
            listOf("relative position"),
        ),
        odd = pair(-0.35f, 0.45f, 0.3f, -0.3f),
        others = listOf(
            pair(0.35f, -0.4f, -0.3f, 0.35f),
            pair(-0.4f, -0.35f, 0.3f, 0.3f),
            pair(-0.25f, -0.45f, 0.1f, 0.4f),
            pair(0.3f, -0.45f, 0.35f, 0.35f),
        ),
    ),
    transformation(
        Meta(
            30, "Three Moves, One Turn", 6, 60,
            "Mirror left–right, turn 90° counter-clockwise, then mirror top–bottom. Combined, these three moves are equivalent to a single quarter turn counter-clockwise.",
            listOf("Track the flag through each step, then place the two small shapes.", "Two mirrors applied one after the other always add up to a turn."),
            listOf("composition", "reflection", "rotation"),
        ),
        start = composite,
        steps = listOf(Transform.Reflect(Axis.VERTICAL), Transform.Rotate(-90), Transform.Reflect(Axis.HORIZONTAL)),
        distractors = listOf(composite.rotate(90), composite.rotate(180), composite.reflect(Axis.DIAGONAL_DOWN)),
    ),
)
