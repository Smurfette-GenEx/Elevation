package com.elevation.reasoning.ui.screens.about

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.elevation.reasoning.BuildConfig
import com.elevation.reasoning.R
import com.elevation.reasoning.ui.components.AppCard
import com.elevation.reasoning.ui.components.AppLogo
import com.elevation.reasoning.ui.components.SectionLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutScreen(onBack: () -> Unit) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back)) } },
                title = { Text(stringResource(R.string.title_about), style = MaterialTheme.typography.titleLarge) },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            AppLogo(size = 64.dp)
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineMedium)
            Text(stringResource(R.string.about_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            AppCard {
                Text(stringResource(R.string.about_body), style = MaterialTheme.typography.bodyMedium)
            }
            SectionLabel(stringResource(R.string.about_quality_title))
            AppCard { Text(stringResource(R.string.about_quality_body), style = MaterialTheme.typography.bodyMedium) }
            SectionLabel(stringResource(R.string.about_privacy_title))
            AppCard { Text(stringResource(R.string.about_privacy_body), style = MaterialTheme.typography.bodyMedium) }
            SectionLabel(stringResource(R.string.about_formats_title))
            AppCard { Text(stringResource(R.string.about_formats_body), style = MaterialTheme.typography.bodyMedium) }
            Spacer(Modifier.height(24.dp))
        }
    }
}
