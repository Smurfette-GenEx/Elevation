package com.elevation.reasoning.puzzle

import com.elevation.reasoning.puzzle.game.GameProgress
import com.elevation.reasoning.puzzle.game.LevelState
import com.elevation.reasoning.puzzle.game.ProgressCodec
import com.elevation.reasoning.puzzle.game.Scoring
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GameProgressTest {
    private fun attempt(ms: Long, target: Int = 30, hints: Int = 0, wrong: Int = 0) = Scoring.Attempt(ms, target, hints, wrong)

    @Test
    fun starRules() {
        assertEquals(3, Scoring.stars(attempt(20_000)))
        assertEquals(2, Scoring.stars(attempt(45_000)))
        assertEquals(2, Scoring.stars(attempt(20_000, hints = 1)))
        assertEquals(2, Scoring.stars(attempt(20_000, wrong = 1)))
        assertEquals(1, Scoring.stars(attempt(20_000, hints = 2)))
        assertEquals(1, Scoring.stars(attempt(90_000)))
        assertEquals(1, Scoring.stars(attempt(50_000, hints = 1, wrong = 1)))
        assertEquals(0, Scoring.stars(Scoring.Attempt(1000, 30, 0, 0, revealed = true)))
    }

    @Test
    fun onlyTheFirstLevelStartsUnlocked() {
        val p = GameProgress()
        assertEquals(LevelState.AVAILABLE, p.state(1))
        assertEquals(LevelState.LOCKED, p.state(2))
        assertEquals(1, p.continueLevel)
        assertFalse(p.hasStarted)
    }

    @Test
    fun wrongAnswersNeverLockButCountAsAttempts() {
        val p = GameProgress().withAnswer(1, correct = false, attempt = null)
        assertEquals(LevelState.AVAILABLE, p.state(1))
        assertEquals(1, p.record(1).attempts)
        assertEquals(LevelState.LOCKED, p.state(2))
    }

    @Test
    fun solvingUnlocksTheNextLevelAndKeepsBestScore() {
        var p = GameProgress().withAnswer(1, true, attempt(10_000))
        assertEquals(LevelState.PERFECT, p.state(1))
        assertEquals(LevelState.AVAILABLE, p.state(2))
        p = p.withAnswer(1, true, attempt(100_000, hints = 3))
        assertEquals(3, p.record(1).bestStars)
        assertEquals(10_000L, p.record(1).bestTimeMillis)
        assertEquals(2, p.continueLevel)
    }

    @Test
    fun revealingCompletesWithoutStars() {
        val p = GameProgress().withAnswer(1, false, null).withReveal(1, 5_000)
        assertEquals(LevelState.COMPLETED, p.state(1))
        assertEquals(0, p.record(1).bestStars)
        assertNull(p.record(1).bestTimeMillis)
        assertTrue(p.isUnlocked(2))
    }

    @Test
    fun chapterSummaryAndStats() {
        var p = GameProgress()
        for (l in 1..10) p = p.withAnswer(l, true, attempt(10_000))
        p = p.withAnswer(11, false, null)
        val s = p.chapterSummary(1)
        assertEquals(10, s.completed)
        assertEquals(30, s.stars)
        assertEquals(1.0, s.accuracy!!, 1e-9)
        assertTrue(s.nextChapterUnlocked)
        val stats = p.stats()
        assertEquals(10, stats.levelsCompleted)
        assertEquals(30, stats.totalStars)
        assertEquals(10.0 / 11.0, stats.accuracy!!, 1e-9)
        assertEquals(10_000L, stats.averageSolveMillis)
        assertEquals(1, stats.bestChapter)
    }

    @Test
    fun codecRoundTripsAndSurvivesGarbage() {
        val p = GameProgress().withAnswer(1, true, attempt(12_345, hints = 1)).withAnswer(2, false, null).withReveal(2, 999)
        assertEquals(p, ProgressCodec.decode(ProgressCodec.encode(p)))
        assertEquals(GameProgress(), ProgressCodec.decode("not a progress string"))
        assertEquals(GameProgress(), ProgressCodec.decode(null))
        val partial = ProgressCodec.decode("v1|1:3:1:1000:1:1:1000:1000;garbage;999:1:1:1:1:1:1:1")
        assertEquals(setOf(1), partial.records.keys)
    }
}
