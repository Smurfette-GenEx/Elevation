package com.elevation.reasoning.puzzle.model

/**
 * Puzzle inks. They are abstract roles rather than hard-coded colors so that the
 * renderer can map them to a light or dark palette. Each ink has a distinct
 * luminance and a single-letter [code] used by the color-assist mode, so puzzle
 * logic never depends on hue alone.
 */
enum class Ink(val displayName: String, val code: Char) {
    PRIMARY("navy", 'N'),
    TEAL("teal", 'T'),
    GOLD("gold", 'G'),
    CORAL("coral", 'C'),
}

/** How the inside of a shape is painted. Stripes are drawn in screen space, so they never rotate. */
enum class Fill(val displayName: String) {
    SOLID("solid"),
    OUTLINE("outlined"),
    STRIPED("striped"),
}

/**
 * Every drawable shape. [sides] is the number of straight edges for the shapes where
 * "number of sides" is a meaningful puzzle attribute, otherwise null.
 */
enum class ShapeKind(val displayName: String, val sides: Int?, val curved: Boolean = false) {
    CIRCLE("circle", null, curved = true),
    SEMICIRCLE("semicircle", null, curved = true),
    QUARTER("quarter circle", null, curved = true),
    TRIANGLE("triangle", 3),
    RIGHT_TRIANGLE("right triangle", 3),
    SQUARE("square", 4),
    RECTANGLE("rectangle", 4),
    DIAMOND("diamond", 4),
    PENTAGON("pentagon", 5),
    HEXAGON("hexagon", 6),
    HEPTAGON("heptagon", 7),
    OCTAGON("octagon", 8),
    STAR("star", null),
    CROSS("cross", null),
    ARROW("arrow", null),
    CHEVRON("chevron", null),
    L_SHAPE("L-shape", null),
    FLAG("flag", null),
    LINE("line", null),
}

/** Standard element sizes (half-extent of the element in cell units, where a cell spans -1..1). */
object Sizes {
    const val XL = 0.84f
    const val L = 0.68f
    const val M = 0.5f
    const val S = 0.3f
    const val XS = 0.2f
    const val DOT = 0.12f
}

/** The 3×3 lattice used for positional puzzles. */
object Lattice {
    const val STEP = 0.62f
    val coords = floatArrayOf(-STEP, 0f, STEP)

    /** Perimeter slots in clockwise order starting at the top-left corner. */
    val ring: List<Pair<Int, Int>> = listOf(
        0 to 0, 1 to 0, 2 to 0, 2 to 1, 2 to 2, 1 to 2, 0 to 2, 0 to 1,
    )

    fun x(col: Int) = coords[col]
    fun y(row: Int) = coords[row]
}

/**
 * One drawable element of a figure.
 *
 * Geometry convention: the cell spans -1..1 on both axes, y grows downwards and
 * [rotation] is in degrees clockwise. The element is first mirrored left–right
 * (when [mirrored]) in its own frame, then rotated, then translated to ([x], [y]).
 *
 * [tag] is invisible metadata naming the element's identity across frames
 * ("the gold dot"). It never affects rendering or visual equality; the solver
 * uses it to track an element through a sequence.
 */
data class Element(
    val shape: ShapeKind,
    val ink: Ink = Ink.PRIMARY,
    val fill: Fill = Fill.SOLID,
    val size: Float = Sizes.L,
    val rotation: Int = 0,
    val mirrored: Boolean = false,
    val x: Float = 0f,
    val y: Float = 0f,
    val tag: String? = null,
)

/**
 * A single puzzle cell: an ordered list of elements (later elements are drawn on top).
 * [board] draws a faint 3×3 guide so that positional changes are easy to read.
 */
data class Figure(
    val elements: List<Element>,
    val board: Boolean = false,
) {
    constructor(vararg elements: Element, board: Boolean = false) : this(elements.toList(), board)

    fun map(transform: (Element) -> Element) = copy(elements = elements.map(transform))
}
