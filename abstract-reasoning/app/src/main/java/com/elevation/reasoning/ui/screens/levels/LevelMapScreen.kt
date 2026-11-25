package com.elevation.reasoning.ui.screens.levels

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.elevation.reasoning.R
import com.elevation.reasoning.data.ProgressRepository
import com.elevation.reasoning.data.PuzzleRepository
import com.elevation.reasoning.puzzle.game.ChapterSummary
import com.elevation.reasoning.puzzle.game.LevelState
import com.elevation.reasoning.puzzle.model.Chapter
import com.elevation.reasoning.ui.components.AppCard
import com.elevation.reasoning.ui.components.ProgressRing
import com.elevation.reasoning.ui.components.StarRow
import com.elevation.reasoning.ui.theme.Brand
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class LevelNode(val level: Int, val state: LevelState, val stars: Int)
data class ChapterSection(val chapter: Chapter, val summary: ChapterSummary, val nodes: List<LevelNode>, val unlocked: Boolean)

class LevelMapViewModel(progress: ProgressRepository, puzzles: PuzzleRepository) : ViewModel() {
    val sections: StateFlow<List<ChapterSection>> = progress.progress.map { p ->
        puzzles.chapters.map { ch ->
            ChapterSection(
                chapter = ch,
                summary = p.chapterSummary(ch.number),
                nodes = ch.levels.map { LevelNode(it, p.state(it), p.record(it).bestStars) },
                unlocked = p.isUnlocked(ch.levels.first),
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LevelMapScreen(viewModel: LevelMapViewModel, initialChapter: Int, onBack: () -> Unit, onLevel: (Int) -> Unit) {
    val sections by viewModel.sections.collectAsStateWithLifecycle()
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = (initialChapter - 1).coerceAtLeast(0))
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back)) } },
                title = { Text(stringResource(R.string.title_levels), style = MaterialTheme.typography.titleLarge) },
            )
        },
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, end = 20.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            itemsIndexed(sections, key = { _, s -> s.chapter.number }) { _, section -> ChapterBlock(section, onLevel) }
        }
    }
}

@Composable
private fun ChapterBlock(section: ChapterSection, onLevel: (Int) -> Unit) {
    val ch = section.chapter
    AppCard(modifier = Modifier.alpha(if (section.unlocked) 1f else 0.6f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.chapter_number, ch.number).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary,
                )
                Spacer(Modifier.height(2.dp))
                Text(ch.title, style = MaterialTheme.typography.titleLarge)
                Text(ch.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Star, null, tint = Brand.Gold, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(
                        "${section.summary.stars} / ${section.summary.maxStars}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (section.unlocked) {
                ProgressRing(section.summary.completion, size = 56.dp)
            } else {
                Icon(Icons.Filled.Lock, stringResource(R.string.state_locked), tint = MaterialTheme.colorScheme.outline)
            }
        }
        Spacer(Modifier.height(16.dp))
        LevelPath(section.nodes, onLevel)
    }
}

/** Ten level nodes on a winding two-row path. */
@Composable
private fun LevelPath(nodes: List<LevelNode>, onLevel: (Int) -> Unit) {
    val lineColor = MaterialTheme.colorScheme.outlineVariant
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val perRow = 5
        val node = 48.dp
        val rowHeight = 80.dp
        val step = (maxWidth - node) / (perRow - 1)
        fun pos(i: Int): Pair<androidx.compose.ui.unit.Dp, androidx.compose.ui.unit.Dp> {
            val row = i / perRow
            val col = if (row % 2 == 0) i % perRow else perRow - 1 - i % perRow
            return step * col to rowHeight * row
        }
        Box(Modifier.fillMaxWidth().height(rowHeight * ((nodes.size + perRow - 1) / perRow) - (rowHeight - node) + 18.dp)) {
            Canvas(Modifier.matchParentSize()) {
                val half = node.toPx() / 2
                for (i in 0 until nodes.size - 1) {
                    val (x1, y1) = pos(i)
                    val (x2, y2) = pos(i + 1)
                    drawLine(lineColor, Offset(x1.toPx() + half, y1.toPx() + half), Offset(x2.toPx() + half, y2.toPx() + half), 3.dp.toPx(), StrokeCap.Round)
                }
            }
            nodes.forEachIndexed { i, n ->
                val (x, y) = pos(i)
                LevelNodeView(n, Modifier.offset(x, y), node, onLevel)
            }
        }
    }
}

@Composable
private fun LevelNodeView(n: LevelNode, modifier: Modifier, size: androidx.compose.ui.unit.Dp, onLevel: (Int) -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val (bg, fg, border) = when (n.state) {
        LevelState.LOCKED -> Triple(scheme.surfaceVariant, scheme.outline, null)
        LevelState.AVAILABLE -> Triple(scheme.surface, scheme.onSurface, BorderStroke(2.dp, scheme.secondary))
        LevelState.COMPLETED -> Triple(scheme.primary, scheme.onPrimary, null)
        LevelState.PERFECT -> Triple(scheme.primary, scheme.onPrimary, BorderStroke(2.5.dp, Brand.Gold))
    }
    val description = when (n.state) {
        LevelState.LOCKED -> stringResource(R.string.cd_level_locked, n.level)
        LevelState.AVAILABLE -> stringResource(R.string.cd_level_available, n.level)
        LevelState.COMPLETED, LevelState.PERFECT -> stringResource(R.string.cd_level_completed, n.level, n.stars)
    }
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            onClick = { onLevel(n.level) },
            enabled = n.state != LevelState.LOCKED,
            shape = CircleShape,
            color = bg,
            border = border,
            modifier = Modifier.size(size).semantics { contentDescription = description; role = Role.Button },
        ) {
            Box(contentAlignment = Alignment.Center) {
                if (n.state == LevelState.LOCKED) {
                    Icon(Icons.Filled.Lock, null, tint = fg, modifier = Modifier.size(18.dp))
                } else {
                    Text("${n.level}", style = MaterialTheme.typography.titleMedium, color = fg)
                }
            }
        }
        if (n.state == LevelState.COMPLETED || n.state == LevelState.PERFECT) {
            StarRow(n.stars, starSize = 10.dp, modifier = Modifier.padding(top = 3.dp))
        }
    }
}
