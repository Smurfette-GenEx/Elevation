package com.elevation.reasoning.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.elevation.reasoning.ui.theme.Brand

/** Thin, rounded progress bar that animates to its value. */
@Composable
fun AnimatedProgressBar(
    progress: Float,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.secondary,
    track: Color = MaterialTheme.colorScheme.surfaceVariant,
    height: Dp = 8.dp,
) {
    val value by animateFloatAsState(progress.coerceIn(0f, 1f), tween(700, easing = FastOutSlowInEasing), label = "progress")
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(height))
            .background(track),
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(value)
                .clip(RoundedCornerShape(height))
                .background(color),
        )
    }
}

/** Circular completion ring with the percentage in the middle. */
@Composable
fun ProgressRing(
    progress: Float,
    modifier: Modifier = Modifier,
    size: Dp = 56.dp,
    stroke: Dp = 5.dp,
    color: Color = MaterialTheme.colorScheme.secondary,
    showLabel: Boolean = true,
    animationMillis: Int = 900,
) {
    val anim = remember { Animatable(0f) }
    LaunchedEffect(progress) { anim.animateTo(progress.coerceIn(0f, 1f), tween(animationMillis, easing = FastOutSlowInEasing)) }
    val track = MaterialTheme.colorScheme.surfaceVariant
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val s = stroke.toPx()
            val arcSize = Size(this.size.width - s, this.size.height - s)
            val topLeft = Offset(s / 2, s / 2)
            drawArc(track, 0f, 360f, false, topLeft, arcSize, style = Stroke(s))
            drawArc(color, -90f, 360f * anim.value, false, topLeft, arcSize, style = Stroke(s, cap = StrokeCap.Round))
        }
        if (showLabel) {
            Text("${(progress * 100).toInt()}%", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

/**
 * Row of up to three stars. When [animate] is true the earned stars pop in one after another,
 * which doubles as the star-collection animation after a correct answer.
 */
@Composable
fun StarRow(
    earned: Int,
    modifier: Modifier = Modifier,
    max: Int = 3,
    starSize: Dp = 18.dp,
    animate: Boolean = false,
    contentDescription: String? = null,
) {
    Row(
        modifier.then(if (contentDescription != null) Modifier.semantics { this.contentDescription = contentDescription } else Modifier),
        horizontalArrangement = Arrangement.spacedBy(starSize / 6),
    ) {
        repeat(max) { i ->
            val on = i < earned
            val scale = remember { Animatable(if (animate && on) 0f else 1f) }
            LaunchedEffect(earned, animate) {
                if (animate && on) {
                    scale.snapTo(0f)
                    kotlinx.coroutines.delay(150L + i * 180L)
                    scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow))
                }
            }
            Icon(
                Icons.Filled.Star,
                contentDescription = null,
                tint = if (on) Brand.Gold else MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(starSize).scale(if (on) scale.value else 1f),
            )
        }
    }
}

/** Difficulty shown as five small bars plus a word; never colour alone. */
@Composable
fun DifficultyBadge(difficulty: Int, label: String, modifier: Modifier = Modifier) {
    val filled = ((difficulty + 1) / 2).coerceIn(1, 5)
    Row(
        modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 10.dp, vertical = 5.dp)
            .semantics(mergeDescendants = true) { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
            repeat(5) { i ->
                Box(
                    Modifier
                        .width(4.dp)
                        .height((5 + i * 2).dp)
                        .clip(RoundedCornerShape(1.dp))
                        .background(if (i < filled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outlineVariant),
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
