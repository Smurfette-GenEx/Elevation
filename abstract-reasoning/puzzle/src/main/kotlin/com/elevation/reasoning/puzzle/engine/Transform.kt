package com.elevation.reasoning.puzzle.engine

import com.elevation.reasoning.puzzle.geometry.Canonical
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.Ink
import com.elevation.reasoning.puzzle.model.Lattice
import com.elevation.reasoning.puzzle.model.ShapeKind
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/** Mirror axes through the centre of a cell. */
enum class Axis(val label: String, val angleFromVertical: Int) {
    VERTICAL("left–right", 0),
    HORIZONTAL("top–bottom", 90),
    DIAGONAL_DOWN("across the ╲ diagonal", 135),
    DIAGONAL_UP("across the ╱ diagonal", 45),
}

/**
 * A whole-figure transformation. Transformations are pure functions on [Figure]s and are
 * used to build puzzle content, to drive "transformation logic" questions, and by the
 * validator to check "visual relationship" questions.
 */
sealed interface Transform {
    val label: String
    fun apply(f: Figure): Figure

    /** Rotates every element and its position about the cell centre, clockwise for positive [degrees]. */
    data class Rotate(val degrees: Int) : Transform {
        override val label: String
            get() = when {
                degrees == 180 || degrees == -180 -> "Rotate 180° (half turn)"
                degrees > 0 -> "Rotate $degrees° clockwise"
                degrees < 0 -> "Rotate ${-degrees}° counter-clockwise"
                else -> "No rotation"
            }

        override fun apply(f: Figure) = f.map { e ->
            val (x, y) = rotatePoint(e.x, e.y, degrees)
            e.copy(x = x, y = y, rotation = Canonical.normalize(e.rotation + degrees))
        }
    }

    /** Mirrors the whole figure across [axis]. */
    data class Reflect(val axis: Axis) : Transform {
        override val label: String get() = "Mirror ${axis.label}"

        override fun apply(f: Figure) = f.map { e -> reflectElement(e, axis.angleFromVertical) }
    }

    /** Swaps two inks wherever they appear. */
    data class SwapInks(val a: Ink, val b: Ink) : Transform {
        override val label: String get() = "Swap ${a.displayName} and ${b.displayName}"
        override fun apply(f: Figure) = f.map { e ->
            when (e.ink) {
                a -> e.copy(ink = b)
                b -> e.copy(ink = a)
                else -> e
            }
        }
    }

    /** Solid shapes become outlined and outlined shapes become solid. */
    data object InvertFill : Transform {
        override val label: String get() = "Invert fill"
        override fun apply(f: Figure) = f.map { e ->
            when (e.fill) {
                Fill.SOLID -> e.copy(fill = Fill.OUTLINE)
                Fill.OUTLINE -> e.copy(fill = Fill.SOLID)
                Fill.STRIPED -> e
            }
        }
    }

    /** Moves every element by whole lattice steps (positive dx = right, positive dy = down). */
    data class Shift(val dx: Int, val dy: Int) : Transform {
        override val label: String
            get() = buildList {
                if (dy < 0) add("up ${-dy}")
                if (dy > 0) add("down $dy")
                if (dx < 0) add("left ${-dx}")
                if (dx > 0) add("right $dx")
            }.joinToString(", ", prefix = "Move ")

        override fun apply(f: Figure) = f.map { e ->
            e.copy(x = e.x + dx * Lattice.STEP, y = e.y + dy * Lattice.STEP)
        }
    }

    /** Scales every element's size (positions are kept). */
    data class Scale(val factor: Float) : Transform {
        override val label: String get() = if (factor > 1f) "Enlarge" else "Shrink"
        override fun apply(f: Figure) = f.map { e -> e.copy(size = e.size * factor) }
    }

    /** Removes every element of the given shape. */
    data class Remove(val shape: ShapeKind) : Transform {
        override val label: String get() = "Remove every ${shape.displayName}"
        override fun apply(f: Figure) = f.copy(elements = f.elements.filterNot { it.shape == shape })
    }

    /** Adds an element on top of the figure. */
    data class Add(val element: Element) : Transform {
        override val label: String get() = "Add a ${element.ink.displayName} ${element.shape.displayName}"
        override fun apply(f: Figure) = f.copy(elements = f.elements + element)
    }

    /** Applies several transformations in order. */
    data class Then(val steps: List<Transform>) : Transform {
        constructor(vararg steps: Transform) : this(steps.toList())
        override val label: String get() = steps.joinToString(", then ") { it.label.replaceFirstChar(Char::lowercase) }
            .replaceFirstChar(Char::uppercase)

        override fun apply(f: Figure) = steps.fold(f) { acc, t -> t.apply(acc) }
    }

    companion object {
        internal fun rotatePoint(x: Float, y: Float, degrees: Int): Pair<Float, Float> {
            val a = degrees * PI / 180.0
            val c = cos(a)
            val s = sin(a)
            return snap((x * c - y * s).toFloat()) to snap((x * s + y * c).toFloat())
        }

        /** Removes floating point noise so that rotated lattice positions stay exactly on the lattice. */
        internal fun snap(v: Float): Float {
            val r = (v * 1000).roundToInt() / 1000f
            return if (abs(r) < 1e-4f) 0f else r
        }

        /**
         * Reflection across a line through the origin at [phi] degrees clockwise from vertical.
         * For an element drawn as R(θ)·M^m, reflecting gives R(2φ − θ)·M^(m+1).
         */
        internal fun reflectElement(e: Element, phi: Int): Element {
            // Reflect the position: R(2φ)·Mx applied to (x, y).
            val (x, y) = rotatePoint(-e.x, e.y, 2 * phi)
            return e.copy(
                x = x,
                y = y,
                mirrored = !e.mirrored,
                rotation = Canonical.normalize(2 * phi - e.rotation),
            )
        }
    }
}
