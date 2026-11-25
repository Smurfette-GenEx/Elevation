package com.elevation.reasoning.ui.screens.results

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.elevation.reasoning.R
import com.elevation.reasoning.data.AppSettings
import com.elevation.reasoning.data.ProgressRepository
import com.elevation.reasoning.data.PuzzleRepository
import com.elevation.reasoning.feedback.Sound
import com.elevation.reasoning.feedback.SoundPlayer
import com.elevation.reasoning.puzzle.game.ChapterSummary
import com.elevation.reasoning.puzzle.model.Chapter
import com.elevation.reasoning.ui.components.AchievementBadge
import com.elevation.reasoning.ui.components.AppCard
import com.elevation.reasoning.ui.components.PrimaryButton
import com.elevation.reasoning.ui.components.ProgressRing
import com.elevation.reasoning.ui.components.QuietButton
import com.elevation.reasoning.ui.components.ResultRow
import com.elevation.reasoning.ui.components.SecondaryButton
import com.elevation.reasoning.ui.components.StarRow
import com.elevation.reasoning.ui.theme.Brand
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class ResultsUiState(val chapter: Chapter, val summary: ChapterSummary?, val nextChapter: Chapter?)

class ResultsViewModel(chapterNumber: Int, progress: ProgressRepository, puzzles: PuzzleRepository) : ViewModel() {
    private val chapter = puzzles.chapters[chapterNumber - 1]
    private val next = puzzles.chapters.getOrNull(chapterNumber)
    val state: StateFlow<ResultsUiState> = progress.progress
        .map { ResultsUiState(chapter, it.chapterSummary(chapterNumber), next) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ResultsUiState(chapter, null, next))
}

@Composable
fun ChapterResultsScreen(
    viewModel: ResultsViewModel,
    settings: AppSettings,
    sounds: SoundPlayer,
    onNextChapter: (firstLevel: Int) -> Unit,
    onReplay: (firstLevel: Int) -> Unit,
    onLevels: () -> Unit,
    onHome: () -> Unit,
) {
    val s by viewModel.state.collectAsStateWithLifecycle()
    val summary = s.summary ?: return
    val done = summary.completed == summary.total
    LaunchedEffect(Unit) { if (done && settings.soundEnabled) sounds.play(Sound.LEVEL_COMPLETE) }
    val reveal = remember { Animatable(0f) }
    LaunchedEffect(Unit) { reveal.animateTo(1f, tween(600)) }

    Column(
        Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(12.dp))
        Box(contentAlignment = Alignment.Center) {
            ProgressRing(summary.completion, size = 132.dp, stroke = 10.dp, showLabel = false, animationMillis = 1400)
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${(summary.completion * 100).toInt()}%", style = MaterialTheme.typography.headlineMedium)
                Text(stringResource(R.string.label_complete), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(20.dp))
        Text(
            stringResource(R.string.chapter_number, s.chapter.number).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.secondary,
        )
        Text(
            stringResource(if (done) R.string.results_title_done else R.string.results_title_progress, s.chapter.title),
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(10.dp))
        // Chapter rating: one star per third of the chapter's stars collected.
        StarRow(earned = (summary.stars * 3) / summary.maxStars, max = 3, starSize = 30.dp, animate = true)
        Spacer(Modifier.height(4.dp))
        Text(
            stringResource(R.string.results_stars, summary.stars, summary.maxStars),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.alpha(reveal.value),
        )
        Spacer(Modifier.height(20.dp))
        AppCard(modifier = Modifier.alpha(reveal.value)) {
            ResultRow(stringResource(R.string.results_correct), "${summary.correct}")
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            ResultRow(stringResource(R.string.results_accuracy), summary.accuracy?.let { "${(it * 100).toInt()}%" } ?: "—")
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            ResultRow(stringResource(R.string.results_total_time), formatDuration(summary.totalTimeMillis))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            ResultRow(stringResource(R.string.results_completion), "${summary.completed} / ${summary.total}")
        }
        Spacer(Modifier.height(16.dp))
        if (s.nextChapter != null) {
            AppCard {
                AchievementBadge(
                    icon = if (summary.nextChapterUnlocked) Icons.Filled.Star else Icons.Filled.Lock,
                    title = stringResource(if (summary.nextChapterUnlocked) R.string.results_next_unlocked else R.string.results_next_locked),
                    subtitle = stringResource(R.string.results_next_name, s.nextChapter!!.number, s.nextChapter!!.title),
                    tint = if (summary.nextChapterUnlocked) Brand.Teal else MaterialTheme.colorScheme.outline,
                )
            }
        } else if (done) {
            AppCard {
                AchievementBadge(Icons.Filled.Star, stringResource(R.string.results_finale_title), stringResource(R.string.results_finale_body), Brand.Gold)
            }
        }
        Spacer(Modifier.height(24.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            val next = s.nextChapter
            if (next != null && summary.nextChapterUnlocked) {
                PrimaryButton(stringResource(R.string.action_next_chapter), onClick = { onNextChapter(next.levels.first) })
            }
            SecondaryButton(stringResource(R.string.action_replay_chapter), onClick = { onReplay(s.chapter.levels.first) })
            SecondaryButton(stringResource(R.string.title_levels), onClick = onLevels)
            QuietButton(stringResource(R.string.action_home), onClick = onHome, modifier = Modifier.align(Alignment.CenterHorizontally))
        }
    }
}

fun formatDuration(ms: Long): String {
    val total = ms / 1000
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}
