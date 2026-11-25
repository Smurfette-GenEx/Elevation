package com.elevation.reasoning.puzzle.content

import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.engine.atRing
import com.elevation.reasoning.puzzle.engine.refill
import com.elevation.reasoning.puzzle.engine.reshape
import com.elevation.reasoning.puzzle.engine.resize
import com.elevation.reasoning.puzzle.model.ShapeKind.CIRCLE
import com.elevation.reasoning.puzzle.model.ShapeKind.ARROW
import com.elevation.reasoning.puzzle.model.ShapeKind.HEXAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.HEPTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.OCTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.PENTAGON
import com.elevation.reasoning.puzzle.model.ShapeKind.SQUARE
import com.elevation.reasoning.puzzle.model.ShapeKind.TRIANGLE
import com.elevation.reasoning.puzzle.model.Sizes

/** Chapter 1 – Visual Foundations: one attribute changes at a time. */
internal val chapter01: List<PuzzleSpec> = listOf(
    sequence(
        Meta(
            1, "Taking Turns", 1, 20,
            "Two shapes take turns: circle, square, circle, square… After a circle always comes a square.",
            listOf("Look only at the shape of each figure.", "Two shapes alternate; which one has just appeared?"),
            listOf("alternation", "shape"),
        ),
        frames = listOf(CIRCLE, SQUARE, CIRCLE, SQUARE, CIRCLE).map { fig(el(it)) },
        answer = fig(el(SQUARE)),
        distractors = listOf(fig(el(CIRCLE)), fig(el(TRIANGLE)), fig(el(SQUARE, fill = OUT))),
    ),
    sequence(
        Meta(
            2, "Colour Wheel", 1, 20,
            "The colour cycles navy → teal → gold and then starts again. Teal is followed by gold.",
            listOf("The shape never changes — watch the colour.", "Three colours repeat in the same order."),
            listOf("cycle", "colour"),
        ),
        frames = listOf(N, T, G, N, T).map { fig(el(SQUARE, it)) },
        answer = fig(el(SQUARE, G)),
        distractors = listOf(fig(el(SQUARE, N)), fig(el(SQUARE, T)), fig(el(CIRCLE, G))),
    ),
    sequence(
        Meta(
            3, "Growing Circle", 1, 20,
            "The circle grows by the same amount at every step, so the next circle is one step larger than the last.",
            listOf("Compare the size of neighbouring circles.", "The growth is steady: each step adds the same amount."),
            listOf("progression", "size"),
        ),
        frames = listOf(0.2f, 0.35f, 0.5f, 0.65f).map { fig(el(CIRCLE, size = it)) },
        answer = fig(el(CIRCLE, size = 0.8f)),
        distractors = listOf(fig(el(CIRCLE, size = 0.65f)), fig(el(CIRCLE, size = 0.5f)), fig(el(HEXAGON, size = 0.8f))),
    ),
    sequence(
        Meta(
            4, "Counting Up", 1, 20,
            "One dot is added at every step: 1, 2, 3, 4… so the next figure has five dots.",
            listOf("Count the dots in each figure.", "How many dots are added each time?"),
            listOf("quantity", "counting"),
        ),
        frames = (1..4).map { dice(it) },
        answer = dice(5),
        distractors = listOf(dice(6), dice(4), dice(5, SQUARE)),
    ),
    sequence(
        Meta(
            5, "Quarter Turns", 2, 25,
            "The arrow turns a quarter turn (90°) clockwise at every step: right, down, left, up… then right again.",
            listOf("Follow the direction the arrow points.", "Each step is the same turn in the same direction."),
            listOf("rotation"),
        ),
        frames = listOf(90, 180, 270, 0).map { fig(el(ARROW, rot = it)) },
        answer = fig(el(ARROW, rot = 90)),
        distractors = listOf(fig(el(ARROW, rot = 0)), fig(el(ARROW, rot = 180)), fig(el(ARROW, rot = 270))),
    ),
    sequence(
        Meta(
            6, "Fill Rhythm", 2, 25,
            "The fill repeats solid → striped → outlined. After striped comes outlined.",
            listOf("The triangle itself never changes — look inside it.", "Three fills repeat in order."),
            listOf("cycle", "fill"),
        ),
        frames = listOf(SOLID, STRIPE, OUT, SOLID, STRIPE).map { fig(el(TRIANGLE, fill = it)) },
        answer = fig(el(TRIANGLE, fill = OUT)),
        distractors = listOf(fig(el(TRIANGLE, fill = SOLID)), fig(el(TRIANGLE, fill = STRIPE)), fig(el(SQUARE, fill = OUT))),
    ),
    sequence(
        Meta(
            7, "One More Side", 2, 30,
            "Each shape has one more side than the one before: 3, 4, 5, 6 — so the next shape has 7 sides (a heptagon).",
            listOf("Count the straight edges of each shape.", "Triangle, square, pentagon, hexagon… what has one more side?"),
            listOf("progression", "sides"),
        ),
        frames = listOf(TRIANGLE, SQUARE, PENTAGON, HEXAGON).map { fig(el(it)) },
        answer = fig(el(HEPTAGON)),
        distractors = listOf(fig(el(OCTAGON)), fig(el(HEXAGON)), fig(el(CIRCLE))),
    ),
    oddOneOut(
        Meta(
            8, "Straight Edges", 2, 30,
            "Every figure is a polygon made of straight edges — except the circle, which has none.",
            listOf("Think about what each outline is made of.", "Edges can be straight or curved."),
            listOf("classification"),
        ),
        odd = fig(el(CIRCLE)),
        others = listOf(fig(el(TRIANGLE)), fig(el(SQUARE)), fig(el(PENTAGON)), fig(el(HEXAGON))),
    ),
    sequence(
        Meta(
            9, "Corner to Corner", 2, 30,
            "The dot jumps clockwise from corner to corner: top-left, top-right, bottom-right, bottom-left, then top-left again.",
            listOf("Watch where the dot is on the 3×3 board.", "It only visits corners, always turning the same way."),
            listOf("position", "movement"),
        ),
        frames = listOf(0, 2, 4, 6).map { fig(el(CIRCLE, size = Sizes.S).atRing(it), board = true) },
        answer = fig(el(CIRCLE, size = Sizes.S).atRing(0), board = true),
        distractors = listOf(2, 6).map { fig(el(CIRCLE, size = Sizes.S).atRing(it), board = true) } +
            fig(el(CIRCLE, size = Sizes.S), board = true),
    ),
    analogy(
        Meta(
            10, "Big to Small", 3, 35,
            "Each figure shrinks and loses its fill: a large solid shape becomes a small outlined copy of the same shape.",
            listOf("Compare the left and right circle: what changed?", "Two things change: size and fill. The shape stays the same."),
            listOf("relationship", "size", "fill"),
        ),
        examples = listOf(fig(el(CIRCLE))),
        query = fig(el(SQUARE)),
        rule = Transform.Then(Transform.Scale(0.5f), Transform.InvertFill),
        distractors = { a ->
            listOf(a.refill(SOLID), a.resize(Sizes.L), a.reshape(CIRCLE))
        },
    ),
)

