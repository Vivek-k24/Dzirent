package com.dzirent.shared.ui

import androidx.compose.runtime.Composable
import com.dzirent.shared.platform.PhotoStore

@Composable
actual fun rememberPhotoSources(
    photoStore: PhotoStore,
    maxPhotos: Int,
    onPhotos: (List<String>) -> Unit,
    onMessage: (String) -> Unit
): (PhotoSource) -> Unit = { TODO("iOS camera and photo picker not implemented yet") }
