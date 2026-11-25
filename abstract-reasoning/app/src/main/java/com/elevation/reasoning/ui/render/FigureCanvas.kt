package com.elevation.reasoning.ui.render

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.sp
import com.elevation.reasoning.puzzle.geometry.ShapeGeometry
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.Fill
import com.elevation.reasoning.puzzle.model.Lattice
import com.elevation.reasoning.puzzle.model.ShapeKind
import com.elevation.reasoning.ui.theme.LocalPuzzlePalette
import com.elevation.reasoning.ui.theme.PuzzlePalette
import kotlin.math.max
import kotlin.math.min

/**
 * Draws a [Figure] as crisp vector graphics, scaled to the available square.
 *
 * The figure's cell coordinates (-1..1) are mapped onto the canvas with a small margin, so every
 * figure is centred and proportioned identically regardless of screen size or density.
 */
@Composable
fun FigureCanvas(
    figure: Figure,
    modifier: Modifier = Modifier,
    colorAssist: Boolean = false,
    description: String? = null,
) {
    val palette = LocalPuzzlePalette.current
    val measurer = rememberTextMeasurer()
    val label = description ?: remember(figure) { FigureDescriber.describe(figure) }
    Canvas(
        modifier
            .aspectRatio(1f)
            .semantics { contentDescription = label },
    ) {
        drawFigure(figure, palette, if (colorAssist) measurer else null)
    }
}

/** Paints a figure into the current draw scope. Shared by cells, options and previews. */
fun DrawScope.drawFigure(figure: Figure, palette: PuzzlePalette, assistMeasurer: TextMeasurer? = null) {
    val half = min(size.width, size.height) / 2f * 0.9f
    val cx = size.width / 2f
    val cy = size.height / 2f
    fun map(x: Float, y: Float) = Offset(cx + x * half, cy + y * half)
    val stroke = max(1.5f, half * 0.045f)

    if (figure.board) {
        val r = max(1.5f, half * 0.025f)
        for (row in 0..2) for (col in 0..2) {
            drawCircle(palette.guide, r, map(Lattice.x(col), Lattice.y(row)))
        }
    }

    for (e in figure.elements) {
        val color = palette.ink(e.ink)
        val elementStroke = min(stroke, max(1.2f, e.size * half * 0.16f))
        when {
            e.shape == ShapeKind.LINE -> {
                val pts = ShapeGeometry.placedOutline(e)
                drawLine(color, map(pts[0].x, pts[0].y), map(pts[1].x, pts[1].y), strokeWidth = stroke * 1.3f, cap = StrokeCap.Round)
            }
            e.shape == ShapeKind.CIRCLE -> {
                val center = map(e.x, e.y)
                val radius = e.size * half
                when (e.fill) {
                    Fill.SOLID -> drawCircle(color, radius, center)
                    Fill.OUTLINE -> drawCircle(color, radius - elementStroke / 2, center, style = Stroke(elementStroke))
                    Fill.STRIPED -> {
                        val path = Path().apply { addOval(androidx.compose.ui.geometry.Rect(center, radius)) }
                        drawStripes(path, color, elementStroke)
                        drawCircle(color, radius - elementStroke / 2, center, style = Stroke(elementStroke))
                    }
                }
            }
            else -> {
                val pts = ShapeGeometry.placedOutline(e)
                val path = Path().apply {
                    pts.forEachIndexed { i, p -> val o = map(p.x, p.y); if (i == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y) }
                    close()
                }
                when (e.fill) {
                    Fill.SOLID -> drawPath(path, color)
                    Fill.OUTLINE -> drawPath(path, color, style = Stroke(elementStroke, join = StrokeJoin.Round))
                    Fill.STRIPED -> {
                        drawStripes(path, color, elementStroke)
                        drawPath(path, color, style = Stroke(elementStroke, join = StrokeJoin.Round))
                    }
                }
            }
        }
        if (assistMeasurer != null && e.shape != ShapeKind.LINE && e.size >= 0.18f) {
            drawInkCode(e, palette, assistMeasurer, map(e.x, e.y), half)
        }
    }
}

private fun DrawScope.drawStripes(path: Path, color: Color, width: Float) {
    clipPath(path) {
        val gap = max(width * 2.6f, 5f)
        var y = 0f
        while (y < size.height) {
            drawLine(color, Offset(0f, y), Offset(size.width, y), strokeWidth = width * 0.75f)
            y += gap
        }
    }
}

/** Colour-assist mode: a small letter (N, T, G, C) in the middle of larger shapes. */
private fun DrawScope.drawInkCode(e: Element, palette: PuzzlePalette, measurer: TextMeasurer, center: Offset, half: Float) {
    val fontSize = (e.size * half * 0.55f).coerceIn(9f, 22f)
    val onSolid = e.fill == Fill.SOLID
    val textColor = if (onSolid) palette.paper else palette.ink(e.ink)
    val layout = measurer.measure(
        e.ink.code.toString(),
        TextStyle(color = textColor, fontSize = (fontSize / density).sp, fontWeight = FontWeight.Bold),
    )
    drawText(layout, topLeft = Offset(center.x - layout.size.width / 2f, center.y - layout.size.height / 2f))
}
