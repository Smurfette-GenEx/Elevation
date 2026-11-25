package com.elevation.reasoning.puzzle.geometry

import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.ShapeKind
import kotlin.math.roundToInt

/**
 * Canonical, appearance-based identity for elements and figures.
 *
 * Two elements are visually identical when they would paint exactly the same pixels:
 * a square rotated by 90° equals the unrotated square, and a mirrored arrow equals the
 * original arrow. Puzzle validation relies on this to reject duplicate options and
 * invisible transformations.
 */
object Canonical {

    /** The smallest positive rotation (degrees) that maps the shape onto itself; 0 = any rotation. */
    fun rotationPeriod(kind: ShapeKind): Int = periodCache.getOrPut(kind) {
        if (ShapeGeometry.isFullyRotationSymmetric(kind)) return@getOrPut 0
        (10..360).firstOrNull { d -> 360 % d == 0 && ShapeGeometry.sameOrientation(kind, false, 0, false, d) } ?: 360
    }

    /** True when the shape has at least one axis of mirror symmetry (a mirrored copy is just a rotation). */
    fun isAchiral(kind: ShapeKind): Boolean = mirrorEquivalent(kind, 0) != null

    private val periodCache = java.util.concurrent.ConcurrentHashMap<ShapeKind, Int>()
    private val mirrorCache = java.util.concurrent.ConcurrentHashMap<Pair<ShapeKind, Int>, Int>()

    /** For a mirrored element at [rotation], the unmirrored rotation that looks identical, or null. */
    private fun mirrorEquivalent(kind: ShapeKind, rotation: Int): Int? {
        val key = kind to normalize(rotation)
        val cached = mirrorCache[key]
        if (cached != null) return cached.takeIf { it >= 0 }
        val found = (0 until 360).firstOrNull { ShapeGeometry.sameOrientation(kind, true, rotation, false, it) }
        mirrorCache[key] = found ?: -1
        return found
    }

    fun normalize(deg: Int): Int = ((deg % 360) + 360) % 360

    /** Canonical (mirrored, rotation) pair: mirrors folded into rotations where possible, rotation reduced by symmetry. */
    fun orientation(e: Element): Pair<Boolean, Int> {
        val period = rotationPeriod(e.shape)
        if (period == 0) return false to 0
        var mirrored = e.mirrored
        var rot = normalize(e.rotation)
        if (mirrored) {
            val eq = mirrorEquivalent(e.shape, rot)
            if (eq != null) {
                mirrored = false
                rot = eq
            }
        }
        return mirrored to (rot % period)
    }

    private fun r2(v: Float) = (v * 100).roundToInt()

    /** Visual identity of an element (tags ignored). */
    fun key(e: Element): String {
        val (m, r) = orientation(e)
        val fill = if (ShapeGeometry.isStroke(e.shape)) Fill.OUTLINE else e.fill
        return "${e.shape}|${e.ink}|$fill|${r2(e.size)}|${r2(e.x)},${r2(e.y)}|${if (m) "m" else ""}$r"
    }

    /** Visual identity of a figure: order-insensitive set of element keys plus the board flag. */
    fun key(f: Figure): String = (if (f.board) "B:" else "") + f.elements.map { key(it) }.sorted().joinToString(" + ")

    fun same(a: Figure, b: Figure) = key(a) == key(b)
}
