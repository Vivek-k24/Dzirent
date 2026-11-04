package com.dzirent.shared.ui

import androidx.compose.runtime.Composable

/** iOS push is a stub for now (needs a paid Apple Developer account): never asks, like Android before 13. */
@Composable
actual fun rememberNotificationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit =
    { onResult(false) }
