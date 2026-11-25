package com.elevation.reasoning

import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.elevation.reasoning.data.AppSettings
import com.elevation.reasoning.data.LocaleStore
import com.elevation.reasoning.ui.navigation.AppNavHost
import com.elevation.reasoning.ui.theme.AbstractReasoningTheme
import java.util.Locale

class MainActivity : ComponentActivity() {

    override fun attachBaseContext(newBase: Context) {
        val tag = LocaleStore.load(newBase).tag
        if (tag == null) {
            super.attachBaseContext(newBase)
            return
        }
        val locale = Locale.forLanguageTag(tag)
        Locale.setDefault(locale)
        val config = Configuration(newBase.resources.configuration).apply { setLocale(locale) }
        super.attachBaseContext(newBase.createConfigurationContext(config))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as ReasoningApplication).container
        setContent {
            val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
            AbstractReasoningTheme(mode = settings.themeMode) {
                AppNavHost(container = container, settings = settings, onLanguageChanged = { recreate() })
            }
        }
    }
}
