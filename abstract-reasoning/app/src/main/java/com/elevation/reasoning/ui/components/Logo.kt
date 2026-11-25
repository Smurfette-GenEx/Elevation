package com.elevation.reasoning.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.elevation.reasoning.ui.theme.Brand

/**
 * The app mark: a navy tile holding a 2×2 matrix — three solved cells and one waiting cell —
 * echoing the core "complete the pattern" idea.
 */
@Composable
fun AppLogo(modifier: Modifier = Modifier, size: Dp = 72.dp) {
    Canvas(modifier.size(size)) {
        val s = this.size.width
        drawRoundRect(Brand.Navy, cornerRadius = CornerRadius(s * 0.24f))
        val cell = s * 0.25f
        val gap = s * 0.08f
        val start = (s - 2 * cell - gap) / 2
        fun origin(i: Int) = Offset(start + (i % 2) * (cell + gap), start + (i / 2) * (cell + gap))
        // Cell 0: teal circle.
        drawCircle(Brand.Teal, cell / 2, origin(0) + Offset(cell / 2, cell / 2))
        // Cell 1: gold triangle.
        val o1 = origin(1)
        drawPath(Path().apply {
            moveTo(o1.x + cell / 2, o1.y + cell * 0.08f)
            lineTo(o1.x + cell * 0.95f, o1.y + cell * 0.9f)
            lineTo(o1.x + cell * 0.05f, o1.y + cell * 0.9f)
            close()
        }, Brand.Gold)
        // Cell 2: ivory square.
        val o2 = origin(2)
        drawRect(Brand.Ivory, o2 + Offset(cell * 0.1f, cell * 0.1f), Size(cell * 0.8f, cell * 0.8f))
        // Cell 3: the missing piece, an outlined slot.
        val o3 = origin(3)
        drawRoundRect(
            Brand.MutedBlue,
            o3 + Offset(cell * 0.08f, cell * 0.08f),
            Size(cell * 0.84f, cell * 0.84f),
            CornerRadius(cell * 0.18f),
            style = Stroke(s * 0.025f),
        )
    }
}
