package com.elevation.reasoning.ui.screens.stats

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.elevation.reasoning.R
import com.elevation.reasoning.data.ProgressRepository
import com.elevation.reasoning.data.PuzzleRepository
import com.elevation.reasoning.puzzle.game.ChapterSummary
import com.elevation.reasoning.puzzle.game.Stats
import com.elevation.reasoning.puzzle.model.Chapter
import com.elevation.reasoning.ui.components.AnimatedProgressBar
import com.elevation.reasoning.ui.components.AppCard
import com.elevation.reasoning.ui.components.SectionLabel
import com.elevation.reasoning.ui.components.StarRow
import com.elevation.reasoning.ui.components.StatTile
import com.elevation.reasoning.ui.screens.results.formatDuration
import com.elevation.reasoning.ui.theme.Brand
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class PersonalBest(val level: Int, val title: String, val millis: Long, val stars: Int)

data class StatsUiState(
    val stats: Stats? = null,
    val chapters: List<Pair<Chapter, ChapterSummary>> = emptyList(),
    val bests: List<PersonalBest> = emptyList(),
)

class StatsViewModel(progress: ProgressRepository, puzzles: PuzzleRepository) : ViewModel() {
    val state: StateFlow<StatsUiState> = progress.progress.map { p ->
        StatsUiState(
            stats = p.stats(),
            chapters = puzzles.chapters.map { it to p.chapterSummary(it.number) },
            bests = p.records.values.filter { it.bestTimeMillis != null }
                .sortedByDescending { it.level }
                .take(8)
                .map { PersonalBest(it.level, puzzles.puzzle(it.level).title, it.bestTimeMillis!!, it.bestStars) },
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), StatsUiState())
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatsScreen(viewModel: StatsViewModel, onBack: () -> Unit) {
    val s by viewModel.state.collectAsStateWithLifecycle()
    val stats = s.stats
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back)) } },
                title = { Text(stringResource(R.string.title_stats), style = MaterialTheme.typography.titleLarge) },
            )
        },
    ) { padding ->
        if (stats == null) return@Scaffold
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile(stringResource(R.string.stats_levels_completed), "${stats.levelsCompleted}", Modifier.weight(1f))
                StatTile(stringResource(R.string.stats_total_stars), "${stats.totalStars}", Modifier.weight(1f), accent = Brand.Gold)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile(stringResource(R.string.stats_accuracy), stats.accuracy?.let { "${(it * 100).toInt()}%" } ?: "—", Modifier.weight(1f))
                StatTile(stringResource(R.string.stats_avg_time), stats.averageSolveMillis?.let { formatDuration(it) } ?: "—", Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile(stringResource(R.string.stats_correct), "${stats.totalCorrect}", Modifier.weight(1f))
                StatTile(stringResource(R.string.stats_perfect), "${stats.perfectLevels}", Modifier.weight(1f))
            }
            StatTile(
                stringResource(R.string.stats_best_chapter),
                stats.bestChapter?.let { n -> s.chapters.firstOrNull { it.first.number == n }?.first?.title?.let { "$n · $it" } } ?: "—",
                Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(4.dp))
            SectionLabel(stringResource(R.string.stats_by_chapter))
            AppCard {
                s.chapters.forEachIndexed { i, (ch, sum) ->
                    if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(vertical = 8.dp))
                    Column(Modifier.semantics(mergeDescendants = true) {}) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("${ch.number}. ${ch.title}", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${sum.stars}/${sum.maxStars}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.height(6.dp))
                        AnimatedProgressBar(sum.stars / sum.maxStars.toFloat(), height = 5.dp, color = Brand.Gold)
                    }
                }
            }
            if (s.bests.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                SectionLabel(stringResource(R.string.stats_personal_bests))
                AppCard {
                    s.bests.forEachIndexed { i, b ->
                        if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(vertical = 8.dp))
                        Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
                            Text("${b.level}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.width(40.dp))
                            Text(b.title, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            StarRow(b.stars, starSize = 12.dp)
                            Spacer(Modifier.width(10.dp))
                            Text(formatDuration(b.millis), style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
