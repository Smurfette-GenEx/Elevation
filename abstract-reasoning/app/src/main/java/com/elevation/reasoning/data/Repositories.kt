package com.elevation.reasoning.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.elevation.reasoning.puzzle.content.PuzzleCatalog
import com.elevation.reasoning.puzzle.game.GameProgress
import com.elevation.reasoning.puzzle.game.ProgressCodec
import com.elevation.reasoning.puzzle.model.Chapter
import com.elevation.reasoning.puzzle.model.Puzzle
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.store: DataStore<Preferences> by preferencesDataStore(name = "abstract_reasoning")

/**
 * Source of puzzle content. The shipped game uses the built-in catalogue; the interface leaves room
 * for downloadable packs, daily challenges or generated assessments later.
 */
interface PuzzleRepository {
    val chapters: List<Chapter>
    val levelCount: Int
    fun puzzle(level: Int): Puzzle
    fun chapterOf(level: Int): Chapter
}

class BuiltInPuzzleRepository : PuzzleRepository {
    override val chapters: List<Chapter> get() = PuzzleCatalog.chapters
    override val levelCount: Int get() = PuzzleCatalog.levelCount
    override fun puzzle(level: Int): Puzzle = PuzzleCatalog.puzzle(level)
    override fun chapterOf(level: Int): Chapter = PuzzleCatalog.chapterOf(level)
}

/** Local, offline progress storage backed by Jetpack DataStore. */
class ProgressRepository(private val context: Context, private val levelCount: Int) {
    private val key = stringPreferencesKey("progress_v1")

    val progress: Flow<GameProgress> = context.store.data.map { ProgressCodec.decode(it[key], levelCount) }

    suspend fun update(transform: (GameProgress) -> GameProgress) {
        context.store.edit { prefs ->
            val current = ProgressCodec.decode(prefs[key], levelCount)
            prefs[key] = ProgressCodec.encode(transform(current))
        }
    }

    suspend fun reset() {
        context.store.edit { it.remove(key) }
    }
}

/** User preferences backed by Jetpack DataStore. The language is mirrored for synchronous start-up reads. */
class SettingsRepository(private val context: Context) {
    private object Keys {
        val language = stringPreferencesKey("language")
        val sound = booleanPreferencesKey("sound")
        val haptics = booleanPreferencesKey("haptics")
        val theme = stringPreferencesKey("theme")
        val timer = booleanPreferencesKey("timer")
        val assist = booleanPreferencesKey("color_assist")
    }

    val settings: Flow<AppSettings> = context.store.data.map { p ->
        AppSettings(
            language = p[Keys.language]?.let { runCatching { AppLanguage.valueOf(it) }.getOrNull() } ?: AppLanguage.SYSTEM,
            soundEnabled = p[Keys.sound] ?: true,
            hapticsEnabled = p[Keys.haptics] ?: true,
            themeMode = p[Keys.theme]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.SYSTEM,
            showTimer = p[Keys.timer] ?: true,
            colorAssist = p[Keys.assist] ?: false,
        )
    }

    suspend fun setLanguage(language: AppLanguage) {
        context.store.edit { it[Keys.language] = language.name }
        LocaleStore.save(context, language)
    }

    suspend fun setSound(on: Boolean) = context.store.edit { it[Keys.sound] = on }
    suspend fun setHaptics(on: Boolean) = context.store.edit { it[Keys.haptics] = on }
    suspend fun setTheme(mode: ThemeMode) = context.store.edit { it[Keys.theme] = mode.name }
    suspend fun setShowTimer(on: Boolean) = context.store.edit { it[Keys.timer] = on }
    suspend fun setColorAssist(on: Boolean) = context.store.edit { it[Keys.assist] = on }
}

/**
 * The chosen language must be known before the first frame is drawn (in attachBaseContext), which
 * cannot wait for an asynchronous DataStore read, so it is mirrored in a tiny SharedPreferences file.
 */
object LocaleStore {
    private const val FILE = "locale"
    private const val KEY = "language"

    fun save(context: Context, language: AppLanguage) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, language.name).apply()
    }

    fun load(context: Context): AppLanguage =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null)
            ?.let { runCatching { AppLanguage.valueOf(it) }.getOrNull() } ?: AppLanguage.SYSTEM
}
