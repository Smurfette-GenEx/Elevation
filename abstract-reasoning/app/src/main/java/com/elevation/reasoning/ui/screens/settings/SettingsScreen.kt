package com.elevation.reasoning.ui.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.elevation.reasoning.R
import com.elevation.reasoning.data.AppLanguage
import com.elevation.reasoning.data.AppSettings
import com.elevation.reasoning.data.ProgressRepository
import com.elevation.reasoning.data.SettingsRepository
import com.elevation.reasoning.data.ThemeMode
import com.elevation.reasoning.ui.components.AppCard
import com.elevation.reasoning.ui.components.ConfirmDialog
import com.elevation.reasoning.ui.components.SectionLabel
import kotlinx.coroutines.launch

class SettingsViewModel(private val settings: SettingsRepository, private val progress: ProgressRepository) : ViewModel() {
    fun setSound(on: Boolean) = viewModelScope.launch { settings.setSound(on) }
    fun setHaptics(on: Boolean) = viewModelScope.launch { settings.setHaptics(on) }
    fun setTheme(mode: ThemeMode) = viewModelScope.launch { settings.setTheme(mode) }
    fun setTimer(on: Boolean) = viewModelScope.launch { settings.setShowTimer(on) }
    fun setAssist(on: Boolean) = viewModelScope.launch { settings.setColorAssist(on) }
    suspend fun setLanguage(language: AppLanguage) = settings.setLanguage(language)
    fun resetProgress() = viewModelScope.launch { progress.reset() }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    settings: AppSettings,
    onBack: () -> Unit,
    onAbout: () -> Unit,
    onLanguageChanged: () -> Unit,
) {
    var confirmReset by remember { mutableStateOf(false) }
    var resetDone by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back)) } },
                title = { Text(stringResource(R.string.title_settings), style = MaterialTheme.typography.titleLarge) },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionLabel(stringResource(R.string.settings_gameplay))
            AppCard(contentPadding = 8) {
                ToggleRow(stringResource(R.string.settings_sound), stringResource(R.string.settings_sound_desc), settings.soundEnabled, viewModel::setSound)
                Divider()
                ToggleRow(stringResource(R.string.settings_haptics), stringResource(R.string.settings_haptics_desc), settings.hapticsEnabled, viewModel::setHaptics)
                Divider()
                ToggleRow(stringResource(R.string.settings_timer), stringResource(R.string.settings_timer_desc), settings.showTimer, viewModel::setTimer)
            }
            SectionLabel(stringResource(R.string.settings_display))
            AppCard {
                Text(stringResource(R.string.settings_theme), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.padding(4.dp))
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    val modes = listOf(ThemeMode.SYSTEM to R.string.theme_system, ThemeMode.LIGHT to R.string.theme_light, ThemeMode.DARK to R.string.theme_dark)
                    modes.forEachIndexed { i, (mode, label) ->
                        SegmentedButton(
                            selected = settings.themeMode == mode,
                            onClick = { viewModel.setTheme(mode) },
                            shape = SegmentedButtonDefaults.itemShape(i, modes.size),
                        ) { Text(stringResource(label)) }
                    }
                }
            }
            AppCard(contentPadding = 8) {
                ToggleRow(stringResource(R.string.settings_assist), stringResource(R.string.settings_assist_desc), settings.colorAssist, viewModel::setAssist)
            }
            SectionLabel(stringResource(R.string.settings_language))
            AppCard(contentPadding = 8) {
                val languages = listOf(
                    AppLanguage.SYSTEM to stringResource(R.string.language_system),
                    AppLanguage.ENGLISH to "English",
                    AppLanguage.FRENCH to "Français",
                )
                languages.forEach { (lang, label) ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 52.dp)
                            .selectable(settings.language == lang, role = Role.RadioButton) {
                                if (settings.language != lang) scope.launch { viewModel.setLanguage(lang); onLanguageChanged() }
                            }
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = settings.language == lang, onClick = null)
                        Spacer(Modifier.width(12.dp))
                        Text(label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
                Text(
                    stringResource(R.string.settings_language_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(12.dp),
                )
            }
            SectionLabel(stringResource(R.string.settings_data))
            AppCard(contentPadding = 8) {
                LinkRow(stringResource(R.string.title_about), onAbout)
                Divider()
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable { confirmReset = true }.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.settings_reset), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.error)
                        Text(
                            stringResource(if (resetDone) R.string.settings_reset_done else R.string.settings_reset_desc),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Spacer(Modifier.padding(12.dp))
        }
    }
    if (confirmReset) {
        ConfirmDialog(
            title = stringResource(R.string.reset_title),
            message = stringResource(R.string.reset_message),
            confirmLabel = stringResource(R.string.reset_confirm),
            dismissLabel = stringResource(R.string.action_cancel),
            destructive = true,
            onConfirm = {
                viewModel.resetProgress()
                resetDone = true
                confirmReset = false
            },
            onDismiss = { confirmReset = false },
        )
    }
}

@Composable
private fun Divider() = HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(horizontal = 12.dp))

@Composable
private fun ToggleRow(title: String, description: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onChange)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Composable
private fun LinkRow(title: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
