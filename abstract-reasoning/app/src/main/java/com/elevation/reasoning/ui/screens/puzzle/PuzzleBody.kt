package com.elevation.reasoning.ui.screens.puzzle

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.elevation.reasoning.R
import com.elevation.reasoning.puzzle.model.Figure
import com.elevation.reasoning.puzzle.model.PuzzleBody
import com.elevation.reasoning.ui.components.SectionLabel
import com.elevation.reasoning.ui.components.StepIcon
import com.elevation.reasoning.ui.render.FigureCanvas
import com.elevation.reasoning.ui.theme.LocalPuzzlePalette

private val CellGap = 8.dp

/** A figure on its own paper tile. A null figure is the "?" placeholder for the unknown answer. */
@Composable
fun PuzzleCell(figure: Figure?, size: Dp, colorAssist: Boolean, modifier: Modifier = Modifier, label: String? = null) {
    val palette = LocalPuzzlePalette.current
    val unknown = stringResource(R.string.cd_missing_cell)
    Box(
        modifier
            .size(size)
            .clip(MaterialTheme.shapes.small)
            .background(palette.paper)
            .then(
                if (figure == null) {
                    Modifier
                        .semantics { contentDescription = unknown }
                        .drawDashedBorder(palette.guide)
                } else {
                    Modifier.border(BorderStroke(1.dp, palette.paperBorder), MaterialTheme.shapes.small)
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (figure != null) {
            FigureCanvas(figure, Modifier.padding(size * 0.05f), colorAssist = colorAssist)
        } else {
            Text("?", style = MaterialTheme.typography.headlineMedium, color = palette.guide, fontWeight = FontWeight.Light)
        }
        if (label != null) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.TopStart).padding(6.dp),
            )
        }
    }
}

private fun Modifier.drawDashedBorder(color: androidx.compose.ui.graphics.Color) = drawBehind {
    drawRoundRect(
        color = color,
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(10.dp.toPx()),
        style = Stroke(width = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 6.dp.toPx()))),
    )
}

/** Renders the question part of a puzzle according to its format. */
@Composable
fun PuzzleBodyView(body: PuzzleBody, colorAssist: Boolean, modifier: Modifier = Modifier) {
    when (body) {
        is PuzzleBody.Sequence -> SequenceView(body, colorAssist, modifier)
        is PuzzleBody.Matrix -> MatrixView(body, colorAssist, modifier)
        is PuzzleBody.Transformation -> TransformationView(body, colorAssist, modifier)
        is PuzzleBody.Relationship -> RelationshipView(body, colorAssist, modifier)
        is PuzzleBody.RuleDeduction -> RuleView(body, colorAssist, modifier)
        PuzzleBody.OddOneOut -> Unit
    }
}

@Composable
private fun SequenceView(body: PuzzleBody.Sequence, colorAssist: Boolean, modifier: Modifier) {
    val items: List<Figure?> = body.frames + listOf(null)
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val perRow = if (items.size <= 4) items.size else (items.size + 1) / 2
        val cell = ((maxWidth - CellGap * (perRow - 1)) / perRow).coerceAtMost(120.dp)
        Column(verticalArrangement = Arrangement.spacedBy(CellGap), horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            items.chunked(perRow).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(CellGap)) {
                    row.forEach { PuzzleCell(it, cell, colorAssist) }
                }
            }
        }
    }
}

@Composable
private fun MatrixView(body: PuzzleBody.Matrix, colorAssist: Boolean, modifier: Modifier) {
    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val cell = ((maxWidth - CellGap * (body.cols - 1)) / body.cols).coerceAtMost(if (body.cols == 2) 132.dp else 104.dp)
        Column(verticalArrangement = Arrangement.spacedBy(CellGap)) {
            for (r in 0 until body.rows) {
                Row(horizontalArrangement = Arrangement.spacedBy(CellGap)) {
                    for (c in 0 until body.cols) PuzzleCell(body.cells[r * body.cols + c], cell, colorAssist)
                }
            }
        }
    }
}

@Composable
private fun TransformationView(body: PuzzleBody.Transformation, colorAssist: Boolean, modifier: Modifier) {
    val palette = LocalPuzzlePalette.current
    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        SectionLabel(stringResource(R.string.label_start))
        Spacer(Modifier.height(8.dp))
        PuzzleCell(body.start, 120.dp, colorAssist)
        Spacer(Modifier.height(14.dp))
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            body.steps.forEachIndexed { i, step ->
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${i + 1}",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.width(22.dp),
                        )
                        StepIcon(step, palette, size = 34.dp)
                        Spacer(Modifier.width(14.dp))
                        Text(step.label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun RelationshipView(body: PuzzleBody.Relationship, colorAssist: Boolean, modifier: Modifier) {
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val cell = ((maxWidth - 56.dp) / 2).coerceAtMost(116.dp)
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(CellGap), horizontalAlignment = Alignment.CenterHorizontally) {
            body.examples.forEach { (a, b) -> PairRow(a, b, cell, colorAssist) }
            body.query?.let { PairRow(it, null, cell, colorAssist) }
        }
    }
}

@Composable
private fun PairRow(a: Figure, b: Figure?, cell: Dp, colorAssist: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        PuzzleCell(a, cell, colorAssist)
        Icon(
            Icons.AutoMirrored.Filled.ArrowForward,
            contentDescription = stringResource(R.string.cd_becomes),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 12.dp).size(24.dp),
        )
        PuzzleCell(b, cell, colorAssist)
    }
}

@Composable
private fun RuleView(body: PuzzleBody.RuleDeduction, colorAssist: Boolean, modifier: Modifier) {
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val n = maxOf(body.follows.size, body.breaks.size)
        val cell = ((maxWidth - CellGap * (n - 1)) / n).coerceAtMost(104.dp)
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            RuleGroup(stringResource(R.string.label_follows_rules), true, body.follows, cell, colorAssist)
            RuleGroup(stringResource(R.string.label_breaks_rules), false, body.breaks, cell, colorAssist)
        }
    }
}

@Composable
private fun RuleGroup(title: String, good: Boolean, figures: List<Figure>, cell: Dp, colorAssist: Boolean) {
    val palette = LocalPuzzlePalette.current
    val tint = if (good) palette.correct else palette.wrong
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = tint.copy(alpha = 0.15f), modifier = Modifier.size(22.dp)) {
                Icon(if (good) Icons.Filled.Check else Icons.Filled.Close, null, tint = tint, modifier = Modifier.padding(3.dp))
            }
            Spacer(Modifier.width(8.dp))
            Text(title, style = MaterialTheme.typography.titleSmall)
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(CellGap)) { figures.forEach { PuzzleCell(it, cell, colorAssist) } }
    }
}

