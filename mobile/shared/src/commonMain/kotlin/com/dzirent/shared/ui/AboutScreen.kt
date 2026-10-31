package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.AppLinks

/**
 * Settings > About Dzirent: the policies, terms and privacy links, contact,
 * the app version and open-source licenses.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutScreen(
    onBack: () -> Unit,
    onOpenHowItWorks: () -> Unit,
    onOpenCommunityPolicy: () -> Unit,
    onOpenLicenses: () -> Unit
) {
    val uriHandler = LocalUriHandler.current

    fun open(url: String) {
        runCatching { uriHandler.openUri(url) }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("About Dzirent") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
            SettingsRow(DzirentPolicy.TITLE, null, Icons.Default.Info, onClick = onOpenHowItWorks)
            SettingsRow(DzirentPolicy.COMMUNITY_TITLE, null, Icons.Default.Shield, onClick = onOpenCommunityPolicy)
            LinkRow("Terms of Service", Icons.Default.Description) {
                open(AppLinks.TERMS_URL)
            }
            LinkRow("Privacy Policy", Icons.Default.PrivacyTip) {
                open(AppLinks.PRIVACY_URL)
            }
            SettingsRow("Contact us", AppLinks.SUPPORT_EMAIL, Icons.Default.Email) {
                open("mailto:${AppLinks.SUPPORT_EMAIL}?subject=Dzirent")
            }
            SettingsRow(
                title = "App version",
                subtitle = "1.0.0 (build 1)",
                icon = Icons.Default.Smartphone,
                onClick = null
            )
            SettingsRow("Open-source licenses", null, Icons.Default.Code, onClick = onOpenLicenses)
        }
    }
}

@Composable
fun SettingsRow(
    title: String,
    subtitle: String?,
    icon: ImageVector,
    onClick: (() -> Unit)?
) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = subtitle?.let { { Text(it) } },
        leadingContent = { Icon(icon, contentDescription = null) },
        modifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
    )
    HorizontalDivider()
}

@Composable
private fun LinkRow(title: String, icon: ImageVector, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        leadingContent = { Icon(icon, contentDescription = null) },
        trailingContent = { Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Opens in your browser") },
        modifier = Modifier.clickable(onClick = onClick)
    )
    HorizontalDivider()
}

private data class LibraryLicense(
    val name: String,
    val author: String,
    val license: String,
    val url: String
)

private val OpenSourceLibraries = listOf(
    LibraryLicense("Kotlin", "JetBrains", "Apache License 2.0", "https://kotlinlang.org/"),
    LibraryLicense("Compose Multiplatform", "JetBrains", "Apache License 2.0", "https://www.jetbrains.com/lp/compose-multiplatform/"),
    LibraryLicense("Supabase Kotlin SDK", "Jan-Tenner & Contributors", "MIT License", "https://github.com/supabase-community/supabase-kt"),
    LibraryLicense("Ktor", "JetBrains", "Apache License 2.0", "https://ktor.io/"),
    LibraryLicense("kotlinx.coroutines", "JetBrains", "Apache License 2.0", "https://github.com/Kotlin/kotlinx.coroutines"),
    LibraryLicense("kotlinx.serialization", "JetBrains", "Apache License 2.0", "https://github.com/Kotlin/kotlinx.serialization"),
    LibraryLicense("kotlinx.datetime", "JetBrains", "Apache License 2.0", "https://github.com/Kotlin/kotlinx-datetime"),
    LibraryLicense("Coil 3", "Coil Contributors", "Apache License 2.0", "https://coil-kt.github.io/coil/")
)

/** The libraries in the app and their licenses, pure multiplatform. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LicensesScreen(onBack: () -> Unit) {
    val uriHandler = LocalUriHandler.current

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Open-source licenses") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(OpenSourceLibraries) { lib ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { runCatching { uriHandler.openUri(lib.url) } },
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(lib.name, style = MaterialTheme.typography.titleMedium)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "${lib.author} · ${lib.license}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

