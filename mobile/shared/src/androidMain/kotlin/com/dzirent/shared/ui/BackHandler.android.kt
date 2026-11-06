package com.dzirent.shared.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController

@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {
    BackHandler(enabled = enabled, onBack = onBack)
}

/** NavHost already handles system Back on Android. */
@Composable
actual fun PlatformNavigationBackHandler(navController: NavHostController) = Unit

/** The Scaffold already padded for the status and navigation bars; inner top bars skip them. */
actual fun Modifier.consumeScaffoldInsets(padding: PaddingValues): Modifier = consumeWindowInsets(padding)
