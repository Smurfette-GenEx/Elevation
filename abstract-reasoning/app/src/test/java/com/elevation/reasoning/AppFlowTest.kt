package com.elevation.reasoning

import android.graphics.Bitmap
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.elevation.reasoning.puzzle.content.PuzzleCatalog
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * End-to-end flow through the real activity: start the challenge, answer level 1 wrongly then
 * correctly, continue to level 2, and verify that progress was persisted. Screenshots are written
 * when -Dscreenshots=<dir> is given.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class AppFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private val container get() = (compose.activity.application as ReasoningApplication).container

    @Before
    fun reset() = runBlocking { container.progress.reset() }

    private fun shot(name: String) {
        val dir = System.getProperty("screenshots")?.takeIf { it.isNotBlank() } ?: return
        File(dir).mkdirs()
        compose.waitForIdle()
        val bmp = compose.runOnUiThread {
            val view = compose.activity.window.decorView
            Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888).also { view.draw(android.graphics.Canvas(it)) }
        }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test
    fun playFirstLevelEndToEnd() {
        shot("01_home_new")
        compose.onNodeWithText("Start challenge").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Taking Turns").assertExists()
        compose.onNodeWithTag("submit").assertIsNotEnabled()
        shot("02_puzzle_level1")

        val p = PuzzleCatalog.puzzle(1)
        val wrong = p.options.indices.first { it != p.correctIndex }
        compose.onNodeWithTag("option_$wrong").performScrollTo().performClick()
        compose.onNodeWithTag("submit").assertIsEnabled().performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Not quite").assertExists()
        shot("03_puzzle_wrong")
        compose.onNodeWithTag("retry").performClick()

        compose.onNodeWithTag("option_${p.correctIndex}").performScrollTo().performClick()
        compose.onNodeWithTag("submit").performClick()
        compose.mainClock.advanceTimeBy(1500)
        compose.waitForIdle()
        compose.onNodeWithTag("continue").assertExists()
        shot("04_puzzle_correct")

        val progress = runBlocking { container.progress.progress.first() }
        assertTrue(progress.record(1).completed)
        assertEquals(2, progress.record(1).attempts)
        assertEquals(1, progress.record(1).correctAnswers)
        assertTrue(progress.isUnlocked(2))

        compose.onNodeWithTag("continue").performClick()
        compose.waitForIdle()
        compose.onNodeWithText(PuzzleCatalog.puzzle(2).title).assertExists()
        shot("05_puzzle_level2")
    }

    @Test
    fun revealingTheSolutionNeverBlocksProgress() {
        compose.onNodeWithText("Start challenge").performClick()
        compose.waitForIdle()
        val p = PuzzleCatalog.puzzle(1)
        val wrong = p.options.indices.first { it != p.correctIndex }
        compose.onNodeWithTag("option_$wrong").performScrollTo().performClick()
        compose.onNodeWithTag("submit").performClick()
        compose.onNodeWithTag("reveal").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Here is the solution").assertExists()
        val progress = runBlocking { container.progress.progress.first() }
        assertTrue(progress.record(1).completed)
        assertEquals(0, progress.record(1).bestStars)
        assertTrue(progress.isUnlocked(2))
    }
}
