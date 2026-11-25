package com.elevation.reasoning.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.elevation.reasoning.puzzle.engine.Axis
import com.elevation.reasoning.puzzle.engine.Transform
import com.elevation.reasoning.puzzle.model.Element
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.ui.render.drawFigure
import com.elevation.reasoning.ui.theme.PuzzlePalette
import kotlin.math.cos
import kotlin.math.sin

/** A compact glyph that pictures one transformation step (turn, mirror, swap, move, …). */
@Composable
fun StepIcon(step: Transform, palette: PuzzlePalette, modifier: Modifier = Modifier, size: Dp = 40.dp) {
    val ink = palette.primary
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val c = Offset(w / 2, w / 2)
        val stroke = w * 0.07f
        when (step) {
            is Transform.Rotate -> drawTurn(c, w * 0.32f, step.degrees, ink, stroke)
            is Transform.Reflect -> drawMirror(step.axis, ink, palette.teal, stroke)
            is Transform.SwapInks -> {
                drawCircle(palette.ink(step.a), w * 0.15f, Offset(w * 0.25f, w * 0.5f))
                drawCircle(palette.ink(step.b), w * 0.15f, Offset(w * 0.75f, w * 0.5f))
                drawArrowLine(Offset(w * 0.34f, w * 0.24f), Offset(w * 0.66f, w * 0.24f), ink, stroke * 0.8f)
                drawArrowLine(Offset(w * 0.66f, w * 0.76f), Offset(w * 0.34f, w * 0.76f), ink, stroke * 0.8f)
            }
            Transform.InvertFill -> {
                val r = w * 0.18f
                drawCircle(ink, r, Offset(w * 0.3f, w * 0.5f))
                drawCircle(ink, r - stroke / 2, Offset(w * 0.7f, w * 0.5f), style = Stroke(stroke))
                drawArrowLine(Offset(w * 0.42f, w * 0.18f), Offset(w * 0.58f, w * 0.18f), ink, stroke * 0.7f)
            }
            is Transform.Shift -> {
                val len = w * 0.34f
                val dx = step.dx.coerceIn(-1, 1)
                val dy = step.dy.coerceIn(-1, 1)
                drawArrowLine(c - Offset(dx * len, dy * len), c + Offset(dx * len, dy * len), ink, stroke)
            }
            is Transform.Scale -> {
                val big = w * 0.36f
                val small = w * 0.16f
                drawRect(ink, Offset(c.x - big, c.y - big), Size(big * 2, big * 2), style = Stroke(stroke * 0.7f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(w * 0.06f, w * 0.05f))))
                drawRect(ink, Offset(c.x - small, c.y - small), Size(small * 2, small * 2))
            }
            is Transform.Remove -> {
                drawGlyph(Element(step.shape, size = 0.5f), palette)
                drawLine(palette.wrong, Offset(w * 0.15f, w * 0.15f), Offset(w * 0.85f, w * 0.85f), stroke * 1.2f, StrokeCap.Round)
            }
            is Transform.Add -> {
                drawGlyph(step.element.copy(size = 0.55f, x = -0.15f, y = 0.15f), palette)
                val p = Offset(w * 0.8f, w * 0.2f)
                drawLine(palette.correct, p - Offset(w * 0.12f, 0f), p + Offset(w * 0.12f, 0f), stroke * 1.1f, StrokeCap.Round)
                drawLine(palette.correct, p - Offset(0f, w * 0.12f), p + Offset(0f, w * 0.12f), stroke * 1.1f, StrokeCap.Round)
            }
            is Transform.Then -> drawTurn(c, w * 0.32f, 90, ink, stroke)
        }
    }
}

private fun DrawScope.drawGlyph(e: Element, palette: PuzzlePalette) = drawFigure(Figure(e.copy(x = e.x, y = e.y)), palette)

private fun DrawScope.drawTurn(c: Offset, r: Float, degrees: Int, color: Color, stroke: Float) {
    val sweep = when {
        degrees > 0 -> degrees.coerceAtMost(300).toFloat()
        else -> degrees.coerceAtLeast(-300).toFloat()
    }.let { if (kotlin.math.abs(it) < 60f) it * 2 else it }
    val start = -90f
    drawArc(color, start, sweep, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2), style = Stroke(stroke, cap = StrokeCap.Round))
    val end = Math.toRadians((start + sweep).toDouble())
    val tip = Offset(c.x + r * cos(end).toFloat(), c.y + r * sin(end).toFloat())
    val dir = if (sweep > 0) 1f else -1f
    val tangent = Offset(-sin(end).toFloat() * dir, cos(end).toFloat() * dir)
    val normal = Offset(-tangent.y, tangent.x)
    val head = r * 0.42f
    val path = Path().apply {
        moveTo(tip.x + tangent.x * head * 0.6f, tip.y + tangent.y * head * 0.6f)
        lineTo(tip.x - tangent.x * head * 0.4f + normal.x * head * 0.5f, tip.y - tangent.y * head * 0.4f + normal.y * head * 0.5f)
        lineTo(tip.x - tangent.x * head * 0.4f - normal.x * head * 0.5f, tip.y - tangent.y * head * 0.4f - normal.y * head * 0.5f)
        close()
    }
    drawPath(path, color)
}

private fun DrawScope.drawMirror(axis: Axis, color: Color, accent: Color, stroke: Float) {
    val w = size.width
    val angle = axis.angleFromVertical.toFloat()
    rotate(angle, Offset(w / 2, w / 2)) {
        drawLine(accent, Offset(w / 2, w * 0.06f), Offset(w / 2, w * 0.94f), stroke * 0.8f, StrokeCap.Round, PathEffect.dashPathEffect(floatArrayOf(w * 0.08f, w * 0.06f)))
        val left = Path().apply { moveTo(w * 0.42f, w * 0.3f); lineTo(w * 0.42f, w * 0.7f); lineTo(w * 0.14f, w * 0.7f); close() }
        val right = Path().apply { moveTo(w * 0.58f, w * 0.3f); lineTo(w * 0.58f, w * 0.7f); lineTo(w * 0.86f, w * 0.7f); close() }
        drawPath(left, color)
        drawPath(right, color, style = Stroke(stroke * 0.7f))
    }
}

private fun DrawScope.drawArrowLine(from: Offset, to: Offset, color: Color, stroke: Float) {
    drawLine(color, from, to, stroke, StrokeCap.Round)
    val d = to - from
    val len = d.getDistance().coerceAtLeast(1f)
    val u = Offset(d.x / len, d.y / len)
    val n = Offset(-u.y, u.x)
    val head = size.width * 0.12f
    drawLine(color, to, to - u * head + n * head * 0.7f, stroke, StrokeCap.Round)
    drawLine(color, to, to - u * head - n * head * 0.7f, stroke, StrokeCap.Round)
}
