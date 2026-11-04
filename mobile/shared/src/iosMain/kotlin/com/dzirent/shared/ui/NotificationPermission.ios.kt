package com.dzirent.shared.ui

import androidx.compose.runtime.Composable

@Composable
actual fun rememberNotificationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit =
    { TODO("iOS notification permission not implemented yet") }
