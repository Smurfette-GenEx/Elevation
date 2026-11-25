package com.elevation.reasoning.puzzle.game

import com.elevation.reasoning.puzzle.model.Puzzle

/** Persistent result of one level. */
data class LevelRecord(
    val level: Int,
    val bestStars: Int = 0,
    val completed: Boolean = false,
    /** Fastest correct solve, or null if never solved without reveal. */
    val bestTimeMillis: Long? = null,
    /** Every submitted answer, right or wrong. */
    val attempts: Int = 0,
    /** Correct submissions. */
    val correctAnswers: Int = 0,
    /** Time spent on the first successful completion (used for chapter totals). */
    val firstClearMillis: Long? = null,
    /** Sum of solve times over all correct submissions (for averages). */
    val totalSolveMillis: Long = 0,
)

enum class LevelState { LOCKED, AVAILABLE, COMPLETED, PERFECT }

/** Aggregate statistics shown on the statistics screen. */
data class Stats(
    val levelsCompleted: Int,
    val totalCorrect: Int,
    val totalAttempts: Int,
    val averageSolveMillis: Long?,
    val accuracy: Double?,
    val totalStars: Int,
    val perfectLevels: Int,
    val bestChapter: Int?,
    val bestChapterStars: Int,
)

/** Summary of a chapter for the results screen and level map. */
data class ChapterSummary(
    val chapter: Int,
    val completed: Int,
    val total: Int,
    val stars: Int,
    val maxStars: Int,
    val correct: Int,
    val attempts: Int,
    val totalTimeMillis: Long,
    val nextChapterUnlocked: Boolean,
) {
    val completion: Float get() = if (total == 0) 0f else completed.toFloat() / total
    val accuracy: Double? get() = if (attempts == 0) null else correct.toDouble() / attempts
}

/**
 * The player's progress across all levels. Immutable: every update returns a new instance.
 *
 * Unlocking is linear: a level is available once the previous level is completed (correctly
 * or by revealing the solution after a wrong answer), so a hard puzzle never blocks the game.
 */
data class GameProgress(val records: Map<Int, LevelRecord> = emptyMap(), val levelCount: Int = 100) {

    fun record(level: Int) = records[level] ?: LevelRecord(level)

    fun state(level: Int): LevelState {
        val r = record(level)
        return when {
            r.completed && r.bestStars == Scoring.MAX_STARS -> LevelState.PERFECT
            r.completed -> LevelState.COMPLETED
            isUnlocked(level) -> LevelState.AVAILABLE
            else -> LevelState.LOCKED
        }
    }

    fun isUnlocked(level: Int) = level == 1 || record(level - 1).completed || record(level).completed

    /** The level to resume: the first unlocked level that is not completed, or the last level. */
    val continueLevel: Int
        get() = (1..levelCount).firstOrNull { isUnlocked(it) && !record(it).completed } ?: levelCount

    val hasStarted: Boolean get() = records.values.any { it.attempts > 0 || it.completed }

    /** Records a submitted answer. Wrong answers count towards accuracy but never lock anything. */
    fun withAnswer(level: Int, correct: Boolean, attempt: Scoring.Attempt?): GameProgress {
        val r = record(level)
        val updated = if (!correct) {
            r.copy(attempts = r.attempts + 1)
        } else {
            val time = attempt?.elapsedMillis ?: 0L
            val stars = attempt?.let { Scoring.stars(it) } ?: 0
            r.copy(
                attempts = r.attempts + 1,
                correctAnswers = r.correctAnswers + 1,
                completed = true,
                bestStars = maxOf(r.bestStars, stars),
                bestTimeMillis = if (attempt?.revealed == true) r.bestTimeMillis else minOf(r.bestTimeMillis ?: Long.MAX_VALUE, time),
                firstClearMillis = r.firstClearMillis ?: time,
                totalSolveMillis = r.totalSolveMillis + time,
            )
        }
        return copy(records = records + (level to updated))
    }

    /** Marks a level as completed with zero stars after the player chose to see the solution. */
    fun withReveal(level: Int, elapsedMillis: Long): GameProgress {
        val r = record(level)
        val updated = r.copy(completed = true, firstClearMillis = r.firstClearMillis ?: elapsedMillis)
        return copy(records = records + (level to updated))
    }

    fun chapterSummary(chapter: Int): ChapterSummary {
        val levels = ((chapter - 1) * Puzzle.LEVELS_PER_CHAPTER + 1)..(chapter * Puzzle.LEVELS_PER_CHAPTER)
        val rs = levels.map { record(it) }
        val nextFirst = levels.last + 1
        return ChapterSummary(
            chapter = chapter,
            completed = rs.count { it.completed },
            total = levels.count(),
            stars = rs.sumOf { it.bestStars },
            maxStars = levels.count() * Scoring.MAX_STARS,
            correct = rs.sumOf { it.correctAnswers },
            attempts = rs.sumOf { it.attempts },
            totalTimeMillis = rs.sumOf { it.firstClearMillis ?: 0L },
            nextChapterUnlocked = nextFirst <= levelCount && isUnlocked(nextFirst),
        )
    }

    fun stats(chapterCount: Int = levelCount / Puzzle.LEVELS_PER_CHAPTER): Stats {
        val rs = records.values
        val correct = rs.sumOf { it.correctAnswers }
        val attempts = rs.sumOf { it.attempts }
        val solveTime = rs.sumOf { it.totalSolveMillis }
        val chapters = (1..chapterCount).map { chapterSummary(it) }.filter { it.completed > 0 }
        val best = chapters.maxWithOrNull(compareBy<ChapterSummary> { it.stars }.thenBy { it.accuracy ?: 0.0 })
        return Stats(
            levelsCompleted = rs.count { it.completed },
            totalCorrect = correct,
            totalAttempts = attempts,
            averageSolveMillis = if (correct == 0) null else solveTime / correct,
            accuracy = if (attempts == 0) null else correct.toDouble() / attempts,
            totalStars = rs.sumOf { it.bestStars },
            perfectLevels = rs.count { it.completed && it.bestStars == Scoring.MAX_STARS },
            bestChapter = best?.chapter,
            bestChapterStars = best?.stars ?: 0,
        )
    }
}

/**
 * Compact, versioned text encoding of [GameProgress] for local storage. Each level is one
 * `level:stars:completed:bestTime:attempts:correct:firstClear:totalSolve` entry; unknown or
 * malformed entries are skipped so that a corrupt value can never crash the app.
 */
object ProgressCodec {
    private const val VERSION = "v1"

    fun encode(p: GameProgress): String = VERSION + "|" + p.records.values.sortedBy { it.level }.joinToString(";") { r ->
        listOf(r.level, r.bestStars, if (r.completed) 1 else 0, r.bestTimeMillis ?: -1, r.attempts, r.correctAnswers, r.firstClearMillis ?: -1, r.totalSolveMillis)
            .joinToString(":")
    }

    fun decode(s: String?, levelCount: Int = 100): GameProgress {
        if (s.isNullOrBlank() || !s.startsWith("$VERSION|")) return GameProgress(levelCount = levelCount)
        val records = s.removePrefix("$VERSION|").split(';').mapNotNull { entry ->
            val f = entry.split(':').mapNotNull { it.toLongOrNull() }
            if (f.size != 8) return@mapNotNull null
            val level = f[0].toInt()
            if (level !in 1..levelCount) return@mapNotNull null
            LevelRecord(
                level = level,
                bestStars = f[1].toInt().coerceIn(0, Scoring.MAX_STARS),
                completed = f[2] == 1L,
                bestTimeMillis = f[3].takeIf { it >= 0 },
                attempts = f[4].toInt().coerceAtLeast(0),
                correctAnswers = f[5].toInt().coerceAtLeast(0),
                firstClearMillis = f[6].takeIf { it >= 0 },
                totalSolveMillis = f[7].coerceAtLeast(0),
            )
        }
        return GameProgress(records.associateBy { it.level }, levelCount)
    }
}
