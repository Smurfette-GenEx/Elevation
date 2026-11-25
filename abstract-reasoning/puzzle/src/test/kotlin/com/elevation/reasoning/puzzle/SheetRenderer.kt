package com.elevation.reasoning.puzzle

import com.elevation.reasoning.puzzle.content.PuzzleCatalog
import com.elevation.reasoning.puzzle.geometry.ShapeGeometry
import com.elevation.reasoning.puzzle.model.AnswerOption
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.Ink
import com.elevation.reasoning.puzzle.model.Puzzle
import com.elevation.reasoning.puzzle.model.PuzzleBody
import org.junit.Test
import java.awt.BasicStroke
import java.awt.Color
import java.awt.Font
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.geom.Path2D
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

/**
 * Debug tool: renders puzzles to PNG contact sheets with plain Java2D, using the same geometry
 * as the app. Run with -Dsheets=<output dir> (and optionally -Dlevels=1,2,3).
 */
class SheetRenderer {
    private val cell = 120

    @Test
    fun render() {
        val out = System.getProperty("sheets")?.takeIf { it.isNotBlank() } ?: return
        val only = System.getProperty("levels")?.takeIf { it.isNotBlank() }?.split(",")?.map { it.trim().toInt() }?.toSet()
        File(out).mkdirs()
        PuzzleCatalog.puzzles.filter { only == null || it.level in only }.chunked(5).forEach { group ->
            val rows = group.map { rowFigures(it) }
            val w = 20 + rows.maxOf { (body, opts) -> maxOf(body.size, opts.size) } * (cell + 10)
            val h = group.size * (2 * cell + 70)
            val img = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
            val g = img.createGraphics()
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g.color = Color.WHITE
            g.fillRect(0, 0, w, h)
            group.forEachIndexed { gi, p ->
                val y0 = gi * (2 * cell + 70)
                val (body, opts) = rows[gi]
                g.color = Color.BLACK
                g.font = Font("SansSerif", Font.BOLD, 13)
                g.drawString("L${p.level} ${p.title} [${p.type.name}]  answer=${'A' + p.correctIndex}", 10, y0 + 16)
                body.forEachIndexed { i, (label, f) -> drawCell(g, f, 10 + i * (cell + 10), y0 + 24, label) }
                opts.forEachIndexed { i, (label, f) ->
                    drawCell(g, f, 10 + i * (cell + 10), y0 + 34 + cell, label, highlight = i == p.correctIndex)
                }
            }
            ImageIO.write(img, "png", File(out, "levels_%03d.png".format(group.first().level)))
        }
    }

    private fun rowFigures(p: Puzzle): Pair<List<Pair<String, Figure?>>, List<Pair<String, Figure?>>> {
        val body: List<Pair<String, Figure?>> = when (val b = p.body) {
            is PuzzleBody.Sequence -> b.frames.map { "" to it } + ("?" to null)
            is PuzzleBody.Matrix -> b.cells.mapIndexed { i, f -> "r${i / b.cols}c${i % b.cols}" to f }
            is PuzzleBody.Transformation -> listOf("start" to b.start) + b.steps.map { it.label to null }
            PuzzleBody.OddOneOut -> emptyList()
            is PuzzleBody.Relationship -> b.examples.flatMap { listOf("A" to it.first, "→B" to it.second) } + listOfNotNull(b.query?.let { "query" to it })
            is PuzzleBody.RuleDeduction -> b.follows.map { "✓" to it } + b.breaks.map { "✗" to it }
        }
        val opts = p.options.mapIndexed { i, o ->
            when (o) {
                is AnswerOption.FigureOption -> "${'A' + i}" to o.figure
                is AnswerOption.TransformOption -> "${'A' + i}: ${o.label}" to null
            }
        }
        return body to opts
    }

    private fun ink(i: Ink) = when (i) {
        Ink.PRIMARY -> Color(0x17233B)
        Ink.TEAL -> Color(0x4E9C91)
        Ink.GOLD -> Color(0xB08A35)
        Ink.CORAL -> Color(0xC0614F)
    }

    private fun drawCell(g: Graphics2D, f: Figure?, x: Int, y: Int, label: String, highlight: Boolean = false) {
        g.color = if (highlight) Color(0xE6F2EF) else Color(0xF7F6F2)
        g.fillRect(x, y, cell, cell)
        g.color = Color(0xCCCCCC)
        g.drawRect(x, y, cell, cell)
        g.color = Color.DARK_GRAY
        g.font = Font("SansSerif", Font.PLAIN, 9)
        g.drawString(label.take(28), x + 2, y + cell - 3)
        if (f == null) return
        val half = cell / 2.0 * 0.9
        val cx = x + cell / 2.0
        val cy = y + cell / 2.0
        if (f.board) {
            g.color = Color(0xDDDDDD)
            for (i in 0..8) {
                val px = cx + (i % 3 - 1) * 0.62 * half
                val py = cy + (i / 3 - 1) * 0.62 * half
                g.fillOval((px - 2).toInt(), (py - 2).toInt(), 4, 4)
            }
        }
        for (e in f.elements) {
            val pts = ShapeGeometry.placedOutline(e)
            val path = Path2D.Double()
            pts.forEachIndexed { i, p ->
                val px = cx + p.x * half
                val py = cy + p.y * half
                if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
            }
            val stroke = ShapeGeometry.isStroke(e.shape)
            if (!stroke) path.closePath()
            g.color = ink(e.ink)
            g.stroke = BasicStroke(if (stroke) 3f else 2f)
            when {
                stroke -> g.draw(path)
                e.fill == Fill.SOLID -> g.fill(path)
                e.fill == Fill.OUTLINE -> g.draw(path)
                else -> {
                    val clip = g.clip
                    g.clip(path)
                    var yy = y.toDouble()
                    g.stroke = BasicStroke(1.5f)
                    while (yy < y + cell) { g.drawLine(x, yy.toInt(), x + cell, yy.toInt()); yy += 5 }
                    g.clip = clip
                    g.stroke = BasicStroke(2f)
                    g.draw(path)
                }
            }
        }
    }
}
