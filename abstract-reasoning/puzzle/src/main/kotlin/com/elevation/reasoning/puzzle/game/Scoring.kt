package com.elevation.reasoning.puzzle.game

/**
 * Star rules for a solved level.
 *
 *  - 3 stars: correct within the target time, with no hints and no wrong attempts.
 *  - 2 stars: correct with one "assist" (one hint or one wrong attempt) or taking up to twice the target time.
 *  - 1 star: correct after several assists or taking longer.
 *  - 0 stars: the solution was revealed; the level still counts as completed so progress is never blocked.
 */
object Scoring {
    const val MAX_STARS = 3

    data class Attempt(
        val elapsedMillis: Long,
        val targetSeconds: Int,
        val hintsUsed: Int,
        val wrongAttempts: Int,
        val revealed: Boolean = false,
    )

    fun stars(a: Attempt): Int {
        if (a.revealed) return 0
        val assists = a.hintsUsed + a.wrongAttempts
        val target = a.targetSeconds * 1000L
        return when {
            assists == 0 && a.elapsedMillis <= target -> 3
            assists <= 1 && a.elapsedMillis <= 2 * target -> 2
            else -> 1
        }
    }
}
