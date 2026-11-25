package com.elevation.reasoning.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.elevation.reasoning.R
import com.elevation.reasoning.data.ProgressRepository
import com.elevation.reasoning.data.PuzzleRepository
import com.elevation.reasoning.puzzle.game.GameProgress
import com.elevation.reasoning.ui.components.AnimatedProgressBar
import com.elevation.reasoning.ui.components.AppCard
import com.elevation.reasoning.ui.components.AppIcons
import com.elevation.reasoning.ui.components.AppLogo
import com.elevation.reasoning.ui.components.PrimaryButton
import com.elevation.reasoning.ui.components.SecondaryButton
import com.elevation.reasoning.ui.components.SectionLabel
import com.elevation.reasoning.ui.components.StarRow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class HomeUiState(
    val loaded: Boolean = false,
    val started: Boolean = false,
    val continueLevel: Int = 1,
    val completed: Int = 0,
    val stars: Int = 0,
    val levelCount: Int = 100,
    val currentChapterTitle: String = "",
)

class HomeViewModel(progress: ProgressRepository, private val puzzles: PuzzleRepository) : ViewModel() {
    val state: StateFlow<HomeUiState> = progress.progress.map { p: GameProgress ->
        val stats = p.stats()
        HomeUiState(
            loaded = true,
            started = p.hasStarted,
            continueLevel = p.continueLevel,
            completed = stats.levelsCompleted,
            stars = stats.totalStars,
            levelCount = puzzles.levelCount,
            currentChapterTitle = puzzles.chapterOf(p.continueLevel).title,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState())
}

@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    onPlay: (Int) -> Unit,
    onLevels: () -> Unit,
    onStats: () -> Unit,
    onSettings: () -> Unit,
    onAbout: () -> Unit,
) {
    val s by viewModel.state.collectAsStateWithLifecycle()
    Column(
        Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            IconButton(onClick = onAbout) { Icon(Icons.Filled.Info, stringResource(R.string.title_about)) }
            IconButton(onClick = onSettings) { Icon(Icons.Filled.Settings, stringResource(R.string.title_settings)) }
        }
        Spacer(Modifier.height(16.dp))
        AppLogo(size = 76.dp)
        Spacer(Modifier.height(24.dp))
        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(6.dp))
        Text(
            stringResource(R.string.home_tagline),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.secondary,
        )
        Spacer(Modifier.height(14.dp))
        Text(
            stringResource(if (s.started) R.string.home_welcome_back else R.string.home_welcome),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(28.dp))

        AppCard {
            SectionLabel(stringResource(R.string.label_overall_progress))
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text("${s.completed}", style = MaterialTheme.typography.headlineMedium)
                Text(
                    " / ${s.levelCount} " + stringResource(R.string.label_levels_lower),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                Spacer(Modifier.weight(1f))
                StarRow(1, max = 1, starSize = 18.dp)
                Spacer(Modifier.width(4.dp))
                Text("${s.stars} / ${s.levelCount * 3}", style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(12.dp))
            AnimatedProgressBar(s.completed / s.levelCount.toFloat())
            if (s.started) {
                Spacer(Modifier.height(12.dp))
                Text(
                    stringResource(R.string.home_next_up, s.continueLevel, s.currentChapterTitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(24.dp))

        if (s.started) {
            PrimaryButton(stringResource(R.string.action_continue_level, s.continueLevel), onClick = { onPlay(s.continueLevel) }, icon = AppIcons.Play)
            Spacer(Modifier.height(12.dp))
            SecondaryButton(stringResource(R.string.action_start_challenge_over), onClick = { onPlay(1) })
        } else {
            PrimaryButton(stringResource(R.string.action_start_challenge), onClick = { onPlay(1) }, icon = AppIcons.Play, enabled = s.loaded)
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SecondaryButton(stringResource(R.string.title_levels), onClick = onLevels, icon = AppIcons.Levels, modifier = Modifier.weight(1f))
            SecondaryButton(stringResource(R.string.title_stats), onClick = onStats, icon = AppIcons.Stats, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(24.dp))
    }
}
