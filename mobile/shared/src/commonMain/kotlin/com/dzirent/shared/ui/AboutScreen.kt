package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import com.dzirent.shared.model.AppLinks
import com.dzirent.shared.platform.LocalDevice

/**
 * Settings > About Dzirent: the policies, terms and privacy links, contact, the app's
 * version and build number, and open-source licenses.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutScreen(
    onBack: () -> Unit,
    onOpenHowItWorks: () -> Unit,
    onOpenCommunityPolicy: () -> Unit,
    onOpenLicenses: () -> Unit
) {
    val device = LocalDevice.current
    val uriHandler = LocalUriHandler.current

    /** Opens a web or mailto link; says so if nothing on the phone can open it. */
    fun open(uri: String, failure: String) {
        try {
            uriHandler.openUri(uri)
        } catch (e: Exception) {
            device.toast(failure)
        }
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
            LinkRow("Terms of Use", Icons.Default.Description) {
                open(AppLinks.TERMS_URL, "Couldn't open the link. Visit ${AppLinks.TERMS_URL}")
            }
            LinkRow("Privacy Policy", Icons.Default.PrivacyTip) {
                open(AppLinks.PRIVACY_URL, "Couldn't open the link. Visit ${AppLinks.PRIVACY_URL}")
            }
            SettingsRow("Contact us", AppLinks.SUPPORT_EMAIL, Icons.Default.Email) {
                open(
                    "mailto:${AppLinks.SUPPORT_EMAIL}?subject=Dzirent",
                    "No email app found. Write to ${AppLinks.SUPPORT_EMAIL}"
                )
            }
            SettingsRow(
                title = "App version",
                subtitle = "${device.appVersion} (build ${device.appBuild})",
                icon = Icons.Default.Smartphone,
                onClick = null
            )
            SettingsRow("Open-source licenses", null, Icons.Default.Code, onClick = onOpenLicenses)
        }
    }
}

/** A row that leaves the app (opens the browser), so it shows that instead of a chevron. */
@Composable
fun LinkRow(title: String, icon: ImageVector, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        leadingContent = { Icon(icon, contentDescription = null) },
        trailingContent = { Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Opens in your browser") },
        modifier = Modifier.clickable(onClick = onClick)
    )
}

/** The libraries in the app and their licenses, collected at build time. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LicensesScreen(onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Open-source licenses") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        LicensesList(modifier = Modifier.fillMaxSize())
    }
}

/** The libraries and licenses list (AboutLibraries on Android). */
@Composable
expect fun LicensesList(modifier: Modifier)
