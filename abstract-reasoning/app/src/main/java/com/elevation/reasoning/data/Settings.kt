package com.elevation.reasoning.data

/** Interface language. SYSTEM follows the device setting. */
enum class AppLanguage(val tag: String?) { SYSTEM(null), ENGLISH("en"), FRENCH("fr") }

enum class ThemeMode { SYSTEM, LIGHT, DARK }

data class AppSettings(
    val language: AppLanguage = AppLanguage.SYSTEM,
    val soundEnabled: Boolean = true,
    val hapticsEnabled: Boolean = true,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val showTimer: Boolean = true,
    val colorAssist: Boolean = false,
)
