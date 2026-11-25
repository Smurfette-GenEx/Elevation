package com.elevation.reasoning.puzzle.geometry

import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.ShapeKind
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.abs
import kotlin.math.sin

/** A 2D point in cell coordinates (-1..1, y down). */
data class Pt(val x: Float, val y: Float)

/**
 * Outline geometry of every [ShapeKind], in the shape's own unit frame (roughly -1..1).
 *
 * This is the single source of truth used both by the renderer (to build paths) and by the
 * validation engine (to decide whether two elements look identical). Curves are sampled
 * densely enough to be visually indistinguishable from true arcs.
 */
object ShapeGeometry {
    private const val CIRCLE_SEGMENTS = 96

    /** True when the outline is an open stroke (lines) rather than a closed area. */
    fun isStroke(kind: ShapeKind) = kind == ShapeKind.LINE

    /** Shapes that look identical under every rotation. */
    fun isFullyRotationSymmetric(kind: ShapeKind) = kind == ShapeKind.CIRCLE

    private val cache = HashMap<ShapeKind, List<Pt>>()

    fun outline(kind: ShapeKind): List<Pt> = synchronized(cache) { cache.getOrPut(kind) { build(kind) } }

    private fun regular(n: Int, startDeg: Double, r: Double = 1.0): List<Pt> = (0 until n).map { i ->
        val a = (startDeg + 360.0 * i / n) * PI / 180.0
        Pt((r * cos(a)).toFloat(), (r * sin(a)).toFloat())
    }

    private fun arc(cx: Double, cy: Double, r: Double, fromDeg: Double, toDeg: Double, segments: Int): List<Pt> =
        (0..segments).map { i ->
            val a = (fromDeg + (toDeg - fromDeg) * i / segments) * PI / 180.0
            Pt((cx + r * cos(a)).toFloat(), (cy + r * sin(a)).toFloat())
        }

    private fun build(kind: ShapeKind): List<Pt> = when (kind) {
        ShapeKind.CIRCLE -> regular(CIRCLE_SEGMENTS, 0.0)
        // Flat edge at the bottom; bounding box centred on the origin.
        ShapeKind.SEMICIRCLE -> arc(0.0, 0.5, 1.0, 180.0, 360.0, CIRCLE_SEGMENTS / 2)
        // Pie slice with its corner at the bottom-left; bounding box centred on the origin.
        ShapeKind.QUARTER -> listOf(Pt(-0.85f, 0.85f)) + arc(-0.85, 0.85, 1.7, 270.0, 360.0, CIRCLE_SEGMENTS / 4)
        ShapeKind.TRIANGLE -> regular(3, -90.0)
        ShapeKind.RIGHT_TRIANGLE -> listOf(Pt(-0.85f, -0.85f), Pt(0.85f, 0.85f), Pt(-0.85f, 0.85f))
        ShapeKind.SQUARE -> listOf(Pt(-0.8f, -0.8f), Pt(0.8f, -0.8f), Pt(0.8f, 0.8f), Pt(-0.8f, 0.8f))
        ShapeKind.RECTANGLE -> listOf(Pt(-1f, -0.5f), Pt(1f, -0.5f), Pt(1f, 0.5f), Pt(-1f, 0.5f))
        ShapeKind.DIAMOND -> listOf(Pt(0f, -1f), Pt(0.62f, 0f), Pt(0f, 1f), Pt(-0.62f, 0f))
        ShapeKind.PENTAGON -> regular(5, -90.0)
        ShapeKind.HEXAGON -> regular(6, 0.0)
        ShapeKind.HEPTAGON -> regular(7, -90.0)
        ShapeKind.OCTAGON -> regular(8, 22.5)
        ShapeKind.STAR -> (0 until 10).map { i ->
            val r = if (i % 2 == 0) 1.0 else 0.42
            val a = (-90.0 + 36.0 * i) * PI / 180.0
            Pt((r * cos(a)).toFloat(), (r * sin(a)).toFloat())
        }
        ShapeKind.CROSS -> {
            val w = 0.3f
            listOf(
                Pt(-w, -1f), Pt(w, -1f), Pt(w, -w), Pt(1f, -w), Pt(1f, w), Pt(w, w),
                Pt(w, 1f), Pt(-w, 1f), Pt(-w, w), Pt(-1f, w), Pt(-1f, -w), Pt(-w, -w),
            )
        }
        // Points up.
        ShapeKind.ARROW -> listOf(
            Pt(0f, -1f), Pt(0.72f, -0.12f), Pt(0.24f, -0.12f), Pt(0.24f, 1f),
            Pt(-0.24f, 1f), Pt(-0.24f, -0.12f), Pt(-0.72f, -0.12f),
        )
        // Points up.
        ShapeKind.CHEVRON -> listOf(
            Pt(0f, -0.75f), Pt(0.95f, 0.2f), Pt(0.6f, 0.55f), Pt(0f, -0.05f), Pt(-0.6f, 0.55f), Pt(-0.95f, 0.2f),
        )
        // Long vertical bar with a short foot to the right: chiral.
        ShapeKind.L_SHAPE -> listOf(
            Pt(-0.55f, -1f), Pt(-0.08f, -1f), Pt(-0.08f, 0.52f), Pt(0.55f, 0.52f), Pt(0.55f, 1f), Pt(-0.55f, 1f),
        )
        // Pole on the left with a pennant pointing right at the top: chiral.
        ShapeKind.FLAG -> listOf(
            Pt(-0.62f, -1f), Pt(-0.4f, -1f), Pt(0.7f, -0.55f), Pt(-0.4f, -0.1f), Pt(-0.4f, 1f), Pt(-0.62f, 1f),
        )
        ShapeKind.LINE -> listOf(Pt(0f, -1f), Pt(0f, 1f))
    }

    /** Applies mirror → rotation → scale → translation of [e] to a local point. */
    fun place(p: Pt, e: Element): Pt = placeLocal(p, e.mirrored, e.rotation, e.size, e.x, e.y)

    fun placeLocal(p: Pt, mirrored: Boolean, rotation: Int, scale: Float, tx: Float, ty: Float): Pt {
        val mx = if (mirrored) -p.x else p.x
        val a = rotation * PI / 180.0
        val c = cos(a)
        val s = sin(a)
        val rx = mx * c - p.y * s
        val ry = mx * s + p.y * c
        return Pt((rx * scale + tx).toFloat(), (ry * scale + ty).toFloat())
    }

    /** The element outline in cell coordinates. */
    fun placedOutline(e: Element): List<Pt> = outline(e.shape).map { place(it, e) }

    /** Axis-aligned bounds (minX, minY, maxX, maxY) of an element in cell coordinates. */
    fun bounds(e: Element): FloatArray {
        val pts = placedOutline(e)
        return floatArrayOf(pts.minOf { it.x }, pts.minOf { it.y }, pts.maxOf { it.x }, pts.maxOf { it.y })
    }

    /**
     * True when the shape's outline under orientation (m1, r1) covers the same point set as under
     * (m2, r2), within a small tolerance. Order-insensitive, so it detects symmetries.
     */
    internal fun sameOrientation(kind: ShapeKind, m1: Boolean, r1: Int, m2: Boolean, r2: Int): Boolean {
        val a = outline(kind).map { placeLocal(it, m1, r1, 1f, 0f, 0f) }
        val b = outline(kind).map { placeLocal(it, m2, r2, 1f, 0f, 0f) }
        val tol = 0.005f
        return a.all { p -> b.any { q -> abs(p.x - q.x) < tol && abs(p.y - q.y) < tol } } &&
            b.all { p -> a.any { q -> abs(p.x - q.x) < tol && abs(p.y - q.y) < tol } }
    }
}
