package com.elevation.reasoning

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.elevation.reasoning.data.AppSettings
import com.elevation.reasoning.data.ThemeMode
import com.elevation.reasoning.puzzle.game.Scoring
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
import com.elevation.reasoning.ui.theme.AbstractReasoningTheme
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Renders every screen and one level of each question format, so layout can be reviewed on a
 * phone-sized and a small screen, in light and dark mode and with large text. Also acts as a
 * smoke test: any composition crash fails the build.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class ScreenGalleryTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val container get() = (compose.activity.application as ReasoningApplication).container

    @Before
    fun seedProgress() = runBlocking {
        container.progress.reset()
        container.progress.update { p ->
            (1..14).fold(p) { acc, l -> acc.withAnswer(l, true, Scoring.Attempt(20_000L + l * 1000, 40, l % 3, 0)) }
                .withAnswer(15, false, null)
        }
    }

    private fun render(name: String, mode: ThemeMode = ThemeMode.LIGHT, content: @Composable () -> Unit) {
        compose.setContent { AbstractReasoningTheme(mode) { androidx.compose.material3.Surface { content() } } }
        compose.mainClock.advanceTimeBy(3000)
        compose.waitForIdle()
        val dir = System.getProperty("screenshots")?.takeIf { it.isNotBlank() } ?: return
        File(dir).mkdirs()
        val bmp = compose.runOnUiThread {
            val v = compose.activity.window.decorView
            Bitmap.createBitmap(v.width, v.height, Bitmap.Config.ARGB_8888).also { v.draw(android.graphics.Canvas(it)) }
        }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun puzzle(level: Int, name: String, mode: ThemeMode = ThemeMode.LIGHT, settings: AppSettings = AppSettings()) = render(name, mode) {
        PuzzleScreen(PuzzleViewModel(level, container.puzzles, container.progress), settings, container.sounds, {}, { _, _ -> })
    }

    @Test fun levelMap() = render("10_levels") { LevelMapScreen(LevelMapViewModel(container.progress, container.puzzles), 1, {}, {}) }
    @Test fun results() = render("11_results") { ChapterResultsScreen(ResultsViewModel(1, container.progress, container.puzzles), AppSettings(), container.sounds, {}, {}, {}, {}) }
    @Test fun stats() = render("12_stats") { StatsScreen(StatsViewModel(container.progress, container.puzzles)) {} }
    @Test fun settings() = render("13_settings") { SettingsScreen(SettingsViewModel(container.settings, container.progress), AppSettings(), {}, {}, {}) }

    @Test fun matrix() = puzzle(39, "20_matrix")
    @Test fun transformation() = puzzle(30, "21_transformation")
    @Test fun relationText() = puzzle(58, "22_relation_text")
    @Test fun analogy() = puzzle(48, "23_analogy")
    @Test fun oddOneOut() = puzzle(44, "24_odd_one_out")
    @Test fun ruleDeduction() = puzzle(87, "25_rule_deduction")
    @Test fun longSequence() = puzzle(84, "26_long_sequence")
    @Test fun darkMatrix() = puzzle(100, "30_dark_matrix", ThemeMode.DARK)
    @Test fun colorAssist() = puzzle(43, "31_color_assist", settings = AppSettings(colorAssist = true))

    @Config(qualifiers = "w320dp-h568dp-hdpi")
    @Test fun smallScreen() = puzzle(65, "40_small_screen")

    @Config(qualifiers = "w411dp-h891dp-xxhdpi", fontScale = 1.4f)
    @Test fun largeText() = puzzle(92, "41_large_text")

    @Test fun allHundredLevelsCompose() {
        // Every level must compose without crashing.
        val level = androidx.compose.runtime.mutableIntStateOf(1)
        compose.setContent {
            val l = level.intValue
            androidx.compose.runtime.key(l) {
                AbstractReasoningTheme { PuzzleScreen(PuzzleViewModel(l, container.puzzles, container.progress), AppSettings(), container.sounds, {}, { _, _ -> }) }
            }
        }
        for (l in 1..100) {
            compose.runOnUiThread { level.intValue = l }
            compose.waitForIdle()
            compose.onNodeWithTag("submit").assertExists()
        }
    }
}
