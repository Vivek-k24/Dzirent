package com.dzirent.shared.ui

import androidx.compose.runtime.Composable

@Composable
actual fun rememberLocationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit =
    { TODO("iOS location permission not implemented yet") }
