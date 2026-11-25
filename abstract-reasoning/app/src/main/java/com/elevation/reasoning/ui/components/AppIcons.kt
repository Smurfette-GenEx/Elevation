package com.elevation.reasoning.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/** Small outline icons drawn in the same geometric language as the puzzles. */
object AppIcons {
    private fun icon(name: String, block: PathBuilder.() -> Unit): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            path(
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.8f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
                pathBuilder = block,
            )
        }.build()

    private fun filled(name: String, block: PathBuilder.() -> Unit): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            path(fill = SolidColor(Color.Black), pathBuilder = block)
        }.build()

    val Hint: ImageVector by lazy {
        icon("hint") {
            moveTo(9f, 18f); lineTo(15f, 18f)
            moveTo(10f, 21f); lineTo(14f, 21f)
            moveTo(9f, 15f)
            curveTo(9f, 13f, 6f, 11.5f, 6f, 8.5f)
            curveTo(6f, 5.2f, 8.7f, 3f, 12f, 3f)
            curveTo(15.3f, 3f, 18f, 5.2f, 18f, 8.5f)
            curveTo(18f, 11.5f, 15f, 13f, 15f, 15f)
            close()
        }
    }

    val Timer: ImageVector by lazy {
        icon("timer") {
            moveTo(12f, 21f)
            curveTo(7.6f, 21f, 4f, 17.4f, 4f, 13f)
            curveTo(4f, 8.6f, 7.6f, 5f, 12f, 5f)
            curveTo(16.4f, 5f, 20f, 8.6f, 20f, 13f)
            curveTo(20f, 17.4f, 16.4f, 21f, 12f, 21f)
            close()
            moveTo(12f, 13f); lineTo(12f, 9f)
            moveTo(10f, 2.5f); lineTo(14f, 2.5f)
        }
    }

    val Levels: ImageVector by lazy {
        icon("levels") {
            moveTo(4f, 4f); lineTo(10f, 4f); lineTo(10f, 10f); lineTo(4f, 10f); close()
            moveTo(14f, 4f); lineTo(20f, 4f); lineTo(20f, 10f); lineTo(14f, 10f); close()
            moveTo(4f, 14f); lineTo(10f, 14f); lineTo(10f, 20f); lineTo(4f, 20f); close()
            moveTo(14f, 14f); lineTo(20f, 14f); lineTo(20f, 20f); lineTo(14f, 20f); close()
        }
    }

    val Stats: ImageVector by lazy {
        icon("stats") {
            moveTo(5f, 20f); lineTo(5f, 12f)
            moveTo(10f, 20f); lineTo(10f, 6f)
            moveTo(15f, 20f); lineTo(15f, 10f)
            moveTo(20f, 20f); lineTo(20f, 4f)
        }
    }

    val Play: ImageVector by lazy {
        filled("play") { moveTo(8f, 5f); lineTo(19f, 12f); lineTo(8f, 19f); close() }
    }
}
