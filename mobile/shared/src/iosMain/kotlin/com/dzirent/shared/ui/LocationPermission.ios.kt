package com.dzirent.shared.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import com.dzirent.shared.platform.LocationPermissionRequester

/** Asks for "when in use" location (approximate accuracy is used either way). */
@Composable
actual fun rememberLocationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit {
    val currentOnResult by rememberUpdatedState(onResult)
    val requester = remember { LocationPermissionRequester() }
    return { requester.request { currentOnResult(it) } }
}
