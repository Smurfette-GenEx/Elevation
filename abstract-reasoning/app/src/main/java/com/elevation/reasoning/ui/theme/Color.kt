package com.elevation.reasoning.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.elevation.reasoning.puzzle.model.Ink

/** Brand palette. */
object Brand {
    val Navy = Color(0xFF17233B)
    val Ivory = Color(0xFFF7F6F2)
    val MutedBlue = Color(0xFF7895B5)
    val Teal = Color(0xFF4E9C91)
    val Gold = Color(0xFFD6B66C)
    val DarkText = Color(0xFF202A38)
    val Grey = Color(0xFF8B929C)
    val Coral = Color(0xFFC0614F)

    val NightBackground = Color(0xFF0E1522)
    val NightSurface = Color(0xFF17233B)
    val NightSurfaceHigh = Color(0xFF22304A)
    val NightText = Color(0xFFEDEAE2)
}

/**
 * Colours used to paint puzzle figures. Inks are tuned per theme so that each one keeps a clearly
 * different luminance on the cell background (puzzles never depend on hue alone).
 */
@Immutable
data class PuzzlePalette(
    val paper: Color,
    val paperBorder: Color,
    val guide: Color,
    val primary: Color,
    val teal: Color,
    val gold: Color,
    val coral: Color,
    val correct: Color,
    val wrong: Color,
) {
    fun ink(i: Ink): Color = when (i) {
        Ink.PRIMARY -> primary
        Ink.TEAL -> teal
        Ink.GOLD -> gold
        Ink.CORAL -> coral
    }

    companion object {
        val Light = PuzzlePalette(
            paper = Color(0xFFFFFEFB),
            paperBorder = Color(0xFFE4E1D8),
            guide = Color(0xFFD9D6CC),
            primary = Brand.Navy,
            teal = Color(0xFF3F8C81),
            gold = Color(0xFFB08A35),
            coral = Brand.Coral,
            correct = Color(0xFF3F8C81),
            wrong = Color(0xFFB4533F),
        )
        val Dark = PuzzlePalette(
            paper = Color(0xFF1B2840),
            paperBorder = Color(0xFF2C3B58),
            guide = Color(0xFF34466A),
            primary = Brand.NightText,
            teal = Color(0xFF6CC0B3),
            gold = Color(0xFFE0C27A),
            coral = Color(0xFFE08B78),
            correct = Color(0xFF6CC0B3),
            wrong = Color(0xFFE08B78),
        )
    }
}

val LocalPuzzlePalette = staticCompositionLocalOf { PuzzlePalette.Light }
