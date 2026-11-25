package com.elevation.reasoning.ui.render

import com.elevation.reasoning.puzzle.geometry.Canonical
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.ShapeKind

/** Plain-language descriptions of figures for screen readers. */
object FigureDescriber {

    fun describe(f: Figure): String {
        if (f.elements.isEmpty()) return "empty cell"
        val groups = f.elements.groupBy { Triple(it.shape, it.ink, it.fill) to Canonical.orientation(it) }
        val parts = groups.map { (_, items) ->
            val e = items.first()
            val count = if (items.size > 1) "${items.size} " else ""
            val plural = if (items.size > 1) "s" else ""
            val fill = if (e.shape == ShapeKind.LINE) "" else "${e.fill.displayName} "
            val base = "$count${sizeWord(e)}${e.ink.displayName} $fill${e.shape.displayName}$plural"
            val dir = direction(e)
            val pos = if (items.size == 1 && (e.x != 0f || e.y != 0f)) " at the ${position(e)}" else ""
            base + dir + pos
        }
        return parts.joinToString("; ")
    }

    private fun sizeWord(e: Element) = when {
        e.size >= 0.75f -> "large "
        e.size <= 0.22f -> "small "
        else -> ""
    }

    private fun direction(e: Element): String {
        val period = Canonical.rotationPeriod(e.shape)
        if (period == 0) return ""
        val (m, r) = Canonical.orientation(e)
        val mirror = if (m) ", mirrored" else ""
        return if (r == 0) mirror else ", turned $r° clockwise$mirror"
    }

    private fun position(e: Element): String {
        val v = when {
            e.y < -0.25f -> "top"
            e.y > 0.25f -> "bottom"
            else -> ""
        }
        val h = when {
            e.x < -0.25f -> "left"
            e.x > 0.25f -> "right"
            else -> ""
        }
        return listOf(v, h).filter { it.isNotEmpty() }.joinToString("-").ifEmpty { "centre" }
    }
}
