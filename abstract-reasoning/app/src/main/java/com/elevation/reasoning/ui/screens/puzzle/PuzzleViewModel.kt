package com.elevation.reasoning.ui.screens.puzzle

import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.elevation.reasoning.data.ProgressRepository
import com.elevation.reasoning.data.PuzzleRepository
import com.elevation.reasoning.feedback.Haptic
import com.elevation.reasoning.feedback.Sound
import com.elevation.reasoning.puzzle.game.Scoring
import com.elevation.reasoning.puzzle.model.Chapter
import com.elevation.reasoning.puzzle.model.Puzzle
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class Phase { ANSWERING, CORRECT, WRONG, REVEALED }

/** One-off feedback the screen turns into sound and haptics, according to the user's settings. */
sealed interface FeedbackEvent {
    data class Play(val sound: Sound, val haptic: Haptic?) : FeedbackEvent
}

data class PuzzleUiState(
    val puzzle: Puzzle,
    val chapter: Chapter,
    val levelCount: Int,
    val selected: Int? = null,
    val phase: Phase = Phase.ANSWERING,
    /** Options already tried and found wrong; they stay disabled. */
    val eliminated: Set<Int> = emptySet(),
    val hintsShown: Int = 0,
    val wrongAttempts: Int = 0,
    val elapsedMillis: Long = 0,
    val starsEarned: Int = 0,
    val previousBestStars: Int = 0,
    val newBestTime: Boolean = false,
    val chapterCompleted: Int = 0,
) {
    val canSubmit: Boolean get() = phase == Phase.ANSWERING && selected != null && selected !in eliminated
    val hintsRemaining: Int get() = puzzle.hints.size - hintsShown
    val isLastInChapter: Boolean get() = puzzle.levelInChapter == Puzzle.LEVELS_PER_CHAPTER || puzzle.level == levelCount
    val finished: Boolean get() = phase == Phase.CORRECT || phase == Phase.REVEALED
}

/**
 * State machine for a single level: select → submit → correct / wrong → (retry | reveal) → continue.
 * Elapsed time only runs while the screen is visible and the player is still answering.
 */
class PuzzleViewModel(
    level: Int,
    puzzles: PuzzleRepository,
    private val progress: ProgressRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(
        PuzzleUiState(puzzle = puzzles.puzzle(level), chapter = puzzles.chapterOf(level), levelCount = puzzles.levelCount),
    )
    val state: StateFlow<PuzzleUiState> = _state.asStateFlow()

    private val _events = MutableSharedFlow<FeedbackEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<FeedbackEvent> = _events

    private var ticker: Job? = null
    private var accumulated = 0L
    private var resumedAt: Long? = null

    init {
        viewModelScope.launch {
            val p = progress.progress.first()
            val ch = _state.value.chapter
            _state.update {
                it.copy(
                    previousBestStars = p.record(level).bestStars,
                    chapterCompleted = ch.levels.count { l -> p.record(l).completed },
                )
            }
        }
    }

    /** Called by the screen when it becomes visible or hidden, so time is never counted in the background. */
    fun setActive(active: Boolean) {
        if (active) {
            if (resumedAt == null) resumedAt = SystemClock.elapsedRealtime()
            if (ticker == null) {
                ticker = viewModelScope.launch {
                    while (true) {
                        if (_state.value.phase == Phase.ANSWERING || _state.value.phase == Phase.WRONG) {
                            _state.update { it.copy(elapsedMillis = currentElapsed()) }
                        }
                        delay(250)
                    }
                }
            }
        } else {
            resumedAt?.let { accumulated += SystemClock.elapsedRealtime() - it }
            resumedAt = null
            ticker?.cancel()
            ticker = null
        }
    }

    private fun currentElapsed(): Long = accumulated + (resumedAt?.let { SystemClock.elapsedRealtime() - it } ?: 0L)

    fun select(index: Int) {
        val s = _state.value
        if (s.phase != Phase.ANSWERING || index in s.eliminated || index !in s.puzzle.options.indices) return
        if (s.selected != index) _events.tryEmit(FeedbackEvent.Play(Sound.SELECT, Haptic.TICK))
        _state.update { it.copy(selected = index) }
    }

    fun showHint() {
        val s = _state.value
        if (s.phase != Phase.ANSWERING || s.hintsRemaining <= 0) return
        _state.update { it.copy(hintsShown = it.hintsShown + 1) }
    }

    fun submit() {
        val s = _state.value
        if (!s.canSubmit) return
        val choice = s.selected ?: return
        val elapsed = currentElapsed()
        if (s.puzzle.isCorrect(choice)) {
            val attempt = Scoring.Attempt(elapsed, s.puzzle.targetSeconds, s.hintsShown, s.wrongAttempts)
            val stars = Scoring.stars(attempt)
            _state.update { it.copy(phase = Phase.CORRECT, starsEarned = stars, elapsedMillis = elapsed) }
            _events.tryEmit(FeedbackEvent.Play(Sound.CORRECT, Haptic.CONFIRM))
            viewModelScope.launch {
                var newBest = false
                progress.update { p ->
                    val before = p.record(s.puzzle.level).bestTimeMillis
                    newBest = before != null && elapsed < before
                    p.withAnswer(s.puzzle.level, true, attempt)
                }
                val after = progress.progress.first()
                _state.update {
                    it.copy(
                        newBestTime = newBest,
                        chapterCompleted = it.chapter.levels.count { l -> after.record(l).completed },
                    )
                }
                delay(650)
                _events.emit(FeedbackEvent.Play(Sound.LEVEL_COMPLETE, null))
            }
        } else {
            _state.update {
                it.copy(phase = Phase.WRONG, eliminated = it.eliminated + choice, wrongAttempts = it.wrongAttempts + 1)
            }
            _events.tryEmit(FeedbackEvent.Play(Sound.WRONG, Haptic.REJECT))
            viewModelScope.launch { progress.update { it.withAnswer(s.puzzle.level, false, null) } }
        }
    }

    fun retry() {
        if (_state.value.phase != Phase.WRONG) return
        _state.update { it.copy(phase = Phase.ANSWERING, selected = null) }
    }

    /** Shows the solution. The level counts as completed (no stars) so the player is never stuck. */
    fun reveal() {
        val s = _state.value
        if (s.phase != Phase.WRONG) return
        val elapsed = currentElapsed()
        _state.update { it.copy(phase = Phase.REVEALED, selected = it.puzzle.correctIndex, elapsedMillis = elapsed) }
        viewModelScope.launch {
            progress.update { it.withReveal(s.puzzle.level, elapsed) }
            val after = progress.progress.first()
            _state.update { it.copy(chapterCompleted = it.chapter.levels.count { l -> after.record(l).completed }) }
        }
    }

    override fun onCleared() {
        ticker?.cancel()
    }
}
