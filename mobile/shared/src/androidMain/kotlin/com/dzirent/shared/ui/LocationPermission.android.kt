package com.dzirent.shared.ui

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable

@Composable
actual fun rememberLocationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission(), onResult)
    return { launcher.launch(Manifest.permission.ACCESS_COARSE_LOCATION) }
}
