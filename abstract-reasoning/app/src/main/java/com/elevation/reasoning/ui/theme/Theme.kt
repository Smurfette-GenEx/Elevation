package com.elevation.reasoning.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.elevation.reasoning.data.ThemeMode

private val LightColors = lightColorScheme(
    primary = Brand.Navy,
    onPrimary = Brand.Ivory,
    primaryContainer = Color(0xFFDDE5EF),
    onPrimaryContainer = Brand.Navy,
    secondary = Brand.Teal,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDCEEEA),
    onSecondaryContainer = Color(0xFF1C4A43),
    tertiary = Brand.Gold,
    onTertiary = Brand.Navy,
    tertiaryContainer = Color(0xFFF4EAD2),
    onTertiaryContainer = Color(0xFF5A4615),
    background = Brand.Ivory,
    onBackground = Brand.DarkText,
    surface = Color(0xFFFFFEFB),
    onSurface = Brand.DarkText,
    surfaceVariant = Color(0xFFEDEBE4),
    onSurfaceVariant = Color(0xFF5B6370),
    surfaceContainer = Color(0xFFF1EFE9),
    surfaceContainerHigh = Color(0xFFEAE8E1),
    outline = Brand.Grey,
    outlineVariant = Color(0xFFDAD7CE),
    error = Color(0xFFB4533F),
)

private val DarkColors = darkColorScheme(
    primary = Brand.NightText,
    onPrimary = Brand.Navy,
    primaryContainer = Color(0xFF2B3B5C),
    onPrimaryContainer = Brand.NightText,
    secondary = Color(0xFF6CC0B3),
    onSecondary = Color(0xFF0D2B27),
    secondaryContainer = Color(0xFF1F4A45),
    onSecondaryContainer = Color(0xFFCDEDE7),
    tertiary = Brand.Gold,
    onTertiary = Brand.Navy,
    tertiaryContainer = Color(0xFF4A3D1E),
    onTertiaryContainer = Color(0xFFF4EAD2),
    background = Brand.NightBackground,
    onBackground = Brand.NightText,
    surface = Brand.NightSurface,
    onSurface = Brand.NightText,
    surfaceVariant = Brand.NightSurfaceHigh,
    onSurfaceVariant = Color(0xFFB4BCC8),
    surfaceContainer = Color(0xFF1A2741),
    surfaceContainerHigh = Brand.NightSurfaceHigh,
    outline = Color(0xFF6F7885),
    outlineVariant = Color(0xFF2E3D5B),
    error = Color(0xFFE08B78),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun AbstractReasoningTheme(mode: ThemeMode = ThemeMode.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    CompositionLocalProvider(LocalPuzzlePalette provides if (dark) PuzzlePalette.Dark else PuzzlePalette.Light) {
        MaterialTheme(
            colorScheme = if (dark) DarkColors else LightColors,
            typography = AppTypography,
            shapes = AppShapes,
            content = content,
        )
    }
}

/** True when the active colour scheme is the dark one. */
@Composable
fun isDarkScheme(): Boolean = MaterialTheme.colorScheme.background == Brand.NightBackground
