package com.elevation.reasoning.ui.screens.puzzle

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.elevation.reasoning.R
import com.elevation.reasoning.data.AppSettings
import com.elevation.reasoning.feedback.Haptics
import com.elevation.reasoning.feedback.SoundPlayer
import com.elevation.reasoning.puzzle.model.AnswerOption
import com.elevation.reasoning.puzzle.model.PuzzleType
import com.elevation.reasoning.ui.components.AnimatedProgressBar
import com.elevation.reasoning.ui.components.AppIcons
import com.elevation.reasoning.ui.components.DifficultyBadge
import com.elevation.reasoning.ui.components.PrimaryButton
import com.elevation.reasoning.ui.components.SecondaryButton
import com.elevation.reasoning.ui.components.StarRow
import com.elevation.reasoning.ui.components.StepIcon
import com.elevation.reasoning.ui.render.FigureCanvas
import com.elevation.reasoning.ui.theme.LocalPuzzlePalette

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PuzzleScreen(
    viewModel: PuzzleViewModel,
    settings: AppSettings,
    sounds: SoundPlayer,
    onBack: () -> Unit,
    onContinue: (finishedLevel: Int, lastInChapter: Boolean) -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val view = LocalView.current
    val currentSettings by rememberUpdatedState(settings)

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.setActive(true) }
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { viewModel.setActive(false) }
    LaunchedEffect(viewModel) {
        viewModel.events.collect { e ->
            if (e is FeedbackEvent.Play) {
                if (currentSettings.soundEnabled) sounds.play(e.sound)
                if (currentSettings.hapticsEnabled && e.haptic != null) Haptics.perform(view, e.haptic)
            }
        }
    }

    val p = state.puzzle
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back)) }
                },
                title = {
                    Column {
                        Text(
                            stringResource(R.string.puzzle_header, p.chapter, p.level),
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            state.chapter.title,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    if (settings.showTimer) TimerChip(state.elapsedMillis, p.targetSeconds)
                    Spacer(Modifier.width(8.dp))
                },
            )
        },
        bottomBar = {
            ActionPanel(
                state = state,
                onHint = viewModel::showHint,
                onSubmit = viewModel::submit,
                onRetry = viewModel::retry,
                onReveal = viewModel::reveal,
                onContinue = { onContinue(p.level, state.isLastInChapter) },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            ChapterProgress(state)
            Spacer(Modifier.height(18.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    typeLabel(p.type),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.weight(1f),
                )
                DifficultyBadge(p.difficulty, difficultyLabel(p.difficulty))
            }
            Spacer(Modifier.height(6.dp))
            Text(p.title, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(6.dp))
            Text(p.prompt, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(18.dp))
            PuzzleBodyView(p.body, settings.colorAssist)
            HintList(state)
            Spacer(Modifier.height(22.dp))
            Text(
                stringResource(if (p.type == PuzzleType.ODD_ONE_OUT) R.string.label_pick_odd else R.string.label_choose_answer),
                style = MaterialTheme.typography.titleSmall,
            )
            Spacer(Modifier.height(10.dp))
            OptionsGrid(state, settings.colorAssist, viewModel::select)
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ChapterProgress(state: PuzzleUiState) {
    val within = state.puzzle.levelInChapter
    Column(Modifier.semantics(mergeDescendants = true) {}) {
        Row {
            Text(
                stringResource(R.string.level_of_chapter, within, 10),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            Text(
                stringResource(R.string.chapter_completed_count, state.chapterCompleted),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(6.dp))
        AnimatedProgressBar(within / 10f, height = 6.dp)
    }
}

@Composable
private fun TimerChip(elapsedMillis: Long, targetSeconds: Int) {
    val secs = elapsedMillis / 1000
    val over = secs > targetSeconds
    val text = "%d:%02d".format(secs / 60, secs % 60)
    val label = stringResource(R.string.cd_timer, text, targetSeconds)
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.semantics { contentDescription = label },
    ) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                AppIcons.Timer,
                null,
                modifier = Modifier.size(16.dp),
                tint = if (over) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(6.dp))
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun HintList(state: PuzzleUiState) {
    val hints = state.puzzle.hints.take(state.hintsShown)
    AnimatedVisibility(visible = hints.isNotEmpty(), enter = expandVertically() + fadeIn()) {
        Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            hints.forEachIndexed { i, h ->
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(Modifier.padding(14.dp)) {
                        Icon(AppIcons.Hint, null, tint = MaterialTheme.colorScheme.onTertiaryContainer, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(
                                stringResource(R.string.hint_number, i + 1),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onTertiaryContainer,
                            )
                            Text(h, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onTertiaryContainer)
                        }
                    }
                }
            }
        }
    }
}

private enum class OptionLook { NORMAL, SELECTED, CORRECT, WRONG, ELIMINATED, DIMMED }

private fun lookFor(state: PuzzleUiState, i: Int): OptionLook = when (state.phase) {
    Phase.ANSWERING -> when {
        i in state.eliminated -> OptionLook.ELIMINATED
        i == state.selected -> OptionLook.SELECTED
        else -> OptionLook.NORMAL
    }
    Phase.WRONG -> when {
        i == state.selected -> OptionLook.WRONG
        i in state.eliminated -> OptionLook.ELIMINATED
        else -> OptionLook.NORMAL
    }
    Phase.CORRECT, Phase.REVEALED -> when {
        i == state.puzzle.correctIndex -> OptionLook.CORRECT
        i in state.eliminated -> OptionLook.ELIMINATED
        else -> OptionLook.DIMMED
    }
}

@Composable
private fun OptionsGrid(state: PuzzleUiState, colorAssist: Boolean, onSelect: (Int) -> Unit) {
    val options = state.puzzle.options
    val textOptions = options.all { it is AnswerOption.TransformOption }
    if (textOptions) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            options.forEachIndexed { i, o ->
                OptionCard(i, o, lookFor(state, i), colorAssist, state.phase == Phase.ANSWERING, Modifier.fillMaxWidth(), onSelect)
            }
        }
        return
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val perRow = if (options.size == 4) 2 else 3
        val gap = 10.dp
        val width = ((maxWidth - gap * (perRow - 1)) / perRow).coerceAtMost(if (perRow == 2) 150.dp else 118.dp)
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(gap), horizontalAlignment = Alignment.CenterHorizontally) {
            options.indices.chunked(perRow).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    row.forEach { i ->
                        OptionCard(i, options[i], lookFor(state, i), colorAssist, state.phase == Phase.ANSWERING, Modifier.width(width), onSelect)
                    }
                }
            }
        }
    }
}

@Composable
private fun OptionCard(
    index: Int,
    option: AnswerOption,
    look: OptionLook,
    colorAssist: Boolean,
    interactive: Boolean,
    modifier: Modifier,
    onSelect: (Int) -> Unit,
) {
    val palette = LocalPuzzlePalette.current
    val scheme = MaterialTheme.colorScheme
    val letter = ('A' + index).toString()
    val borderColor by animateColorAsState(
        when (look) {
            OptionLook.SELECTED -> scheme.primary
            OptionLook.CORRECT -> palette.correct
            OptionLook.WRONG -> palette.wrong
            else -> scheme.outlineVariant
        },
        label = "border",
    )
    val scale by animateFloatAsState(if (look == OptionLook.SELECTED || look == OptionLook.CORRECT) 1.03f else 1f, tween(160), label = "scale")
    val alpha = when (look) {
        OptionLook.ELIMINATED -> 0.35f
        OptionLook.DIMMED -> 0.55f
        else -> 1f
    }
    val enabled = interactive && look != OptionLook.ELIMINATED
    val stateText = when (look) {
        OptionLook.SELECTED -> stringResource(R.string.state_selected)
        OptionLook.CORRECT -> stringResource(R.string.state_correct)
        OptionLook.WRONG, OptionLook.ELIMINATED -> stringResource(R.string.state_wrong)
        else -> ""
    }
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = if (look == OptionLook.SELECTED) scheme.primaryContainer.copy(alpha = 0.35f) else scheme.surface,
        border = BorderStroke(if (look == OptionLook.NORMAL || look == OptionLook.DIMMED || look == OptionLook.ELIMINATED) 1.dp else 2.5.dp, borderColor),
        modifier = modifier
            .testTag("option_$index")
            .scale(scale)
            .alpha(alpha)
            .heightIn(min = 56.dp)
            .selectable(selected = look == OptionLook.SELECTED, enabled = enabled, role = Role.RadioButton) { onSelect(index) }
            .semantics { stateDescription = stateText },
    ) {
        when (option) {
            is AnswerOption.FigureOption -> Column {
                Row(Modifier.fillMaxWidth().height(32.dp), verticalAlignment = Alignment.CenterVertically) {
                    OptionLetter(letter, look, Modifier)
                    Spacer(Modifier.weight(1f))
                    OptionMark(look, Modifier)
                }
                FigureCanvas(
                    option.figure,
                    Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, bottom = 10.dp),
                    colorAssist = colorAssist,
                )
            }
            is AnswerOption.TransformOption -> Row(
                Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OptionLetter(letter, look, Modifier)
                Spacer(Modifier.width(10.dp))
                val steps = (option.transform as? com.elevation.reasoning.puzzle.engine.Transform.Then)?.steps ?: listOf(option.transform)
                steps.forEach { StepIcon(it, palette, size = 28.dp) }
                Spacer(Modifier.width(12.dp))
                Text(option.label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                OptionMark(look, Modifier)
            }
        }
    }
}

@Composable
private fun OptionLetter(letter: String, look: OptionLook, modifier: Modifier) {
    val bg = if (look == OptionLook.SELECTED) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val fg = if (look == OptionLook.SELECTED) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(shape = CircleShape, color = bg, modifier = modifier.padding(6.dp).size(24.dp)) {
        Box(contentAlignment = Alignment.Center) { Text(letter, style = MaterialTheme.typography.labelMedium, color = fg) }
    }
}

@Composable
private fun OptionMark(look: OptionLook, modifier: Modifier) {
    val palette = LocalPuzzlePalette.current
    val (icon, tint) = when (look) {
        OptionLook.CORRECT -> Icons.Filled.Check to palette.correct
        OptionLook.WRONG -> Icons.Filled.Close to palette.wrong
        else -> return
    }
    Surface(shape = CircleShape, color = tint, modifier = modifier.padding(6.dp).size(24.dp)) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.padding(3.dp))
    }
}

@Composable
private fun ActionPanel(
    state: PuzzleUiState,
    onHint: () -> Unit,
    onSubmit: () -> Unit,
    onRetry: () -> Unit,
    onReveal: () -> Unit,
    onContinue: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 12.dp,
        shape = MaterialTheme.shapes.large.copy(bottomStart = androidx.compose.foundation.shape.CornerSize(0.dp), bottomEnd = androidx.compose.foundation.shape.CornerSize(0.dp)),
    ) {
        AnimatedContent(
            targetState = state.phase,
            transitionSpec = { (slideInVertically { it / 3 } + fadeIn()) togetherWith (slideOutVertically { it / 3 } + fadeOut()) },
            label = "panel",
            modifier = Modifier.navigationBarsPadding(),
        ) { phase ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp)) {
                when (phase) {
                    Phase.ANSWERING -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        SecondaryButton(
                            text = if (state.hintsRemaining > 0) stringResource(R.string.action_hint_count, state.hintsShown + 1, state.puzzle.hints.size) else stringResource(R.string.action_no_hints),
                            onClick = onHint,
                            enabled = state.hintsRemaining > 0,
                            icon = AppIcons.Hint,
                            modifier = Modifier.weight(1f),
                        )
                        PrimaryButton(
                            text = stringResource(R.string.action_check),
                            onClick = onSubmit,
                            enabled = state.canSubmit,
                            modifier = Modifier.weight(1f).testTag("submit"),
                        )
                    }
                    Phase.WRONG -> {
                        FeedbackHeader(good = false, title = stringResource(R.string.feedback_wrong_title), subtitle = stringResource(R.string.feedback_wrong_body))
                        Spacer(Modifier.height(14.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            SecondaryButton(stringResource(R.string.action_show_solution), onReveal, Modifier.weight(1f).testTag("reveal"))
                            PrimaryButton(stringResource(R.string.action_try_again), onRetry, Modifier.weight(1f).testTag("retry"))
                        }
                    }
                    Phase.CORRECT, Phase.REVEALED -> {
                        if (phase == Phase.CORRECT) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                FeedbackHeader(
                                    good = true,
                                    title = stringResource(if (state.starsEarned == 3) R.string.feedback_perfect_title else R.string.feedback_correct_title),
                                    subtitle = timeSummary(state),
                                    modifier = Modifier.weight(1f),
                                )
                                StarRow(
                                    state.starsEarned,
                                    starSize = 26.dp,
                                    animate = true,
                                    contentDescription = pluralStringResource(R.plurals.stars_earned, state.starsEarned, state.starsEarned),
                                )
                            }
                        } else {
                            FeedbackHeader(good = true, title = stringResource(R.string.feedback_revealed_title), subtitle = stringResource(R.string.feedback_revealed_body))
                        }
                        Spacer(Modifier.height(12.dp))
                        Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp)) {
                                Text(stringResource(R.string.label_why), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.height(4.dp))
                                Text(state.puzzle.explanation, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                        PrimaryButton(
                            text = stringResource(if (state.isLastInChapter) R.string.action_see_results else R.string.action_continue),
                            onClick = onContinue,
                            modifier = Modifier.testTag("continue"),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun timeSummary(state: PuzzleUiState): String {
    val secs = state.elapsedMillis / 1000
    val time = "%d:%02d".format(secs / 60, secs % 60)
    return if (state.newBestTime) stringResource(R.string.feedback_time_best, time) else stringResource(R.string.feedback_time, time)
}

@Composable
private fun FeedbackHeader(good: Boolean, title: String, subtitle: String, modifier: Modifier = Modifier) {
    val palette = LocalPuzzlePalette.current
    val tint = if (good) palette.correct else palette.wrong
    Row(modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = tint, modifier = Modifier.size(36.dp)) {
            Icon(if (good) Icons.Filled.Check else Icons.Filled.Close, null, tint = Color.White, modifier = Modifier.padding(7.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun typeLabel(type: PuzzleType): String = stringResource(
    when (type) {
        PuzzleType.SEQUENCE -> R.string.type_sequence
        PuzzleType.MATRIX -> R.string.type_matrix
        PuzzleType.TRANSFORMATION -> R.string.type_transformation
        PuzzleType.ODD_ONE_OUT -> R.string.type_odd
        PuzzleType.RELATIONSHIP -> R.string.type_relationship
        PuzzleType.MULTI_RULE -> R.string.type_multi_rule
    },
).uppercase()

@Composable
fun difficultyLabel(d: Int): String = stringResource(
    when {
        d <= 2 -> R.string.difficulty_easy
        d <= 4 -> R.string.difficulty_medium
        d <= 6 -> R.string.difficulty_hard
        d <= 8 -> R.string.difficulty_expert
        else -> R.string.difficulty_master
    },
)
