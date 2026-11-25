package com.elevation.reasoning.ui.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.elevation.reasoning.AppContainer
import com.elevation.reasoning.data.AppSettings
import com.elevation.reasoning.ui.appViewModel
import com.elevation.reasoning.ui.screens.about.AboutScreen
import com.elevation.reasoning.ui.screens.home.HomeScreen
import com.elevation.reasoning.ui.screens.home.HomeViewModel
import com.elevation.reasoning.ui.screens.levels.LevelMapScreen
import com.elevation.reasoning.ui.screens.levels.LevelMapViewModel
import com.elevation.reasoning.ui.screens.puzzle.PuzzleScreen
import com.elevation.reasoning.ui.screens.puzzle.PuzzleViewModel
import com.elevation.reasoning.ui.screens.results.ChapterResultsScreen
import com.elevation.reasoning.ui.screens.results.ResultsViewModel
import com.elevation.reasoning.ui.screens.settings.SettingsScreen
import com.elevation.reasoning.ui.screens.settings.SettingsViewModel
import com.elevation.reasoning.ui.screens.stats.StatsScreen
import com.elevation.reasoning.ui.screens.stats.StatsViewModel

object Routes {
    const val HOME = "home"
    const val LEVELS = "levels?chapter={chapter}"
    const val PUZZLE = "puzzle/{level}"
    const val RESULTS = "results/{chapter}"
    const val SETTINGS = "settings"
    const val STATS = "stats"
    const val ABOUT = "about"

    fun levels(chapter: Int = 1) = "levels?chapter=$chapter"
    fun puzzle(level: Int) = "puzzle/$level"
    fun results(chapter: Int) = "results/$chapter"
}

@Composable
fun AppNavHost(
    container: AppContainer,
    settings: AppSettings,
    onLanguageChanged: () -> Unit,
    nav: NavHostController = rememberNavController(),
) {
    val duration = 280
    androidx.compose.material3.Surface(color = MaterialTheme.colorScheme.background, contentColor = MaterialTheme.colorScheme.onBackground) {
    NavHost(
        navController = nav,
        startDestination = Routes.HOME,
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        enterTransition = { fadeIn(tween(duration)) + slideInHorizontally(tween(duration)) { it / 8 } },
        exitTransition = { fadeOut(tween(duration / 2)) },
        popEnterTransition = { fadeIn(tween(duration)) + slideInHorizontally(tween(duration)) { -it / 8 } },
        popExitTransition = { fadeOut(tween(duration / 2)) + slideOutHorizontally(tween(duration)) { it / 8 } },
    ) {
        composable(Routes.HOME) {
            HomeScreen(
                viewModel = appViewModel { HomeViewModel(container.progress, container.puzzles) },
                onPlay = { nav.navigate(Routes.puzzle(it)) },
                onLevels = { nav.navigate(Routes.levels()) },
                onStats = { nav.navigate(Routes.STATS) },
                onSettings = { nav.navigate(Routes.SETTINGS) },
                onAbout = { nav.navigate(Routes.ABOUT) },
            )
        }
        composable(Routes.LEVELS, arguments = listOf(navArgument("chapter") { type = NavType.IntType; defaultValue = 1 })) { entry ->
            val chapter = entry.arguments?.getInt("chapter") ?: 1
            LevelMapScreen(
                viewModel = appViewModel { LevelMapViewModel(container.progress, container.puzzles) },
                initialChapter = chapter,
                onBack = { nav.popBackStack() },
                onLevel = { nav.navigate(Routes.puzzle(it)) },
            )
        }
        composable(Routes.PUZZLE, arguments = listOf(navArgument("level") { type = NavType.IntType })) { entry ->
            val level = (entry.arguments?.getInt("level") ?: 1).coerceIn(1, container.puzzles.levelCount)
            PuzzleScreen(
                viewModel = appViewModel(key = "puzzle-$level") { PuzzleViewModel(level, container.puzzles, container.progress) },
                settings = settings,
                sounds = container.sounds,
                onBack = { nav.popBackStack() },
                onContinue = { finished, lastInChapter ->
                    val route = if (lastInChapter) Routes.results(container.puzzles.chapterOf(finished).number) else Routes.puzzle(finished + 1)
                    nav.navigate(route) { popUpTo(Routes.PUZZLE) { inclusive = true } }
                },
            )
        }
        composable(Routes.RESULTS, arguments = listOf(navArgument("chapter") { type = NavType.IntType })) { entry ->
            val chapter = (entry.arguments?.getInt("chapter") ?: 1).coerceIn(1, container.puzzles.chapters.size)
            ChapterResultsScreen(
                viewModel = appViewModel(key = "results-$chapter") { ResultsViewModel(chapter, container.progress, container.puzzles) },
                settings = settings,
                sounds = container.sounds,
                onNextChapter = { first -> nav.navigate(Routes.puzzle(first)) { popUpTo(Routes.RESULTS) { inclusive = true } } },
                onReplay = { first -> nav.navigate(Routes.puzzle(first)) { popUpTo(Routes.RESULTS) { inclusive = true } } },
                onLevels = { nav.navigate(Routes.levels(chapter)) { popUpTo(Routes.HOME) } },
                onHome = { nav.popBackStack(Routes.HOME, inclusive = false) },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                viewModel = appViewModel { SettingsViewModel(container.settings, container.progress) },
                settings = settings,
                onBack = { nav.popBackStack() },
                onAbout = { nav.navigate(Routes.ABOUT) },
                onLanguageChanged = onLanguageChanged,
            )
        }
        composable(Routes.STATS) {
            StatsScreen(viewModel = appViewModel { StatsViewModel(container.progress, container.puzzles) }, onBack = { nav.popBackStack() })
        }
        composable(Routes.ABOUT) { AboutScreen(onBack = { nav.popBackStack() }) }
    }
    }
}
