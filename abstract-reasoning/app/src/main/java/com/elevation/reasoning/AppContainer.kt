package com.elevation.reasoning

import android.content.Context
import com.elevation.reasoning.data.BuiltInPuzzleRepository
import com.elevation.reasoning.data.ProgressRepository
import com.elevation.reasoning.data.PuzzleRepository
import com.elevation.reasoning.data.SettingsRepository
import com.elevation.reasoning.feedback.SoundPlayer

/** Manual dependency container: the app is small enough that a DI framework would add only weight. */
class AppContainer(context: Context) {
    val puzzles: PuzzleRepository = BuiltInPuzzleRepository()
    val progress = ProgressRepository(context.applicationContext, puzzles.levelCount)
    val settings = SettingsRepository(context.applicationContext)
    val sounds by lazy { SoundPlayer() }
}
