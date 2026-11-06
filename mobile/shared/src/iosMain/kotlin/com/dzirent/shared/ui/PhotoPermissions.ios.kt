package com.dzirent.shared.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NoPhotography
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.interop.LocalUIViewController
import com.dzirent.shared.platform.IosCameraService
import com.dzirent.shared.platform.IosPhotoPicker
import com.dzirent.shared.platform.IosPhotoStore
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.platform.PhotoStore
import com.dzirent.shared.platform.cameraDir
import com.dzirent.shared.platform.openAppSettings
import com.dzirent.shared.platform.toNSData
import com.dzirent.shared.platform.topPresented
import kotlinx.coroutines.launch
import platform.Foundation.NSUUID
import platform.Foundation.writeToFile

/**
 * Same flow as Android: the first time each source is used, a short explanation asks for consent
 * ([PhotoConsentStore]). The photo picker (PHPicker) needs no library permission; the camera
 * needs camera access. Picked and taken photos are copied into [photoStore] before anything
 * reads them. Without a camera (the Simulator), the camera says so, as on Android.
 */
@Composable
actual fun rememberPhotoSources(
    photoStore: PhotoStore,
    maxPhotos: Int,
    onPhotos: (List<String>) -> Unit,
    onMessage: (String) -> Unit
): (PhotoSource) -> Unit {
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    val viewController = LocalUIViewController.current
    val consent = remember { PhotoConsentStore(device.prefs) }
    val store = photoStore as IosPhotoStore
    val picker = remember(viewController) { IosPhotoPicker { viewController.topPresented() } }
    val camera = remember(viewController) { IosCameraService { viewController.topPresented() } }
    val currentOnPhotos by rememberUpdatedState(onPhotos)
    val currentOnMessage by rememberUpdatedState(onMessage)
    var askingConsent by remember { mutableStateOf<PhotoSource?>(null) }
    var showCameraDenied by remember { mutableStateOf(false) }

    fun openGallery() {
        scope.launch {
            val picked = picker.pickPhotoData(maxPhotos)
            val copies = picked.mapNotNull { bytes -> bytes?.let { store.copyIn(it) } }
            if (copies.size < picked.size) currentOnMessage("Some photos couldn't be read. Pick different ones.")
            currentOnPhotos(copies)
        }
    }

    fun openCamera() {
        scope.launch {
            val capture = camera.capture() ?: return@launch
            val path = "${cameraDir()}/${NSUUID().UUIDString}.jpg"
            val saved = capture.bytes?.toNSData()?.writeToFile(path, atomically = true) == true
            val uri = if (saved) store.moveIn(path) else null
            if (uri != null) currentOnPhotos(listOf(uri)) else currentOnMessage("The camera didn't save a photo. Try again.")
        }
    }

    fun start(source: PhotoSource) {
        if (!consent.hasConsent(source)) {
            askingConsent = source
            return
        }
        when (source) {
            PhotoSource.Camera -> when {
                !camera.isAvailable -> currentOnMessage("No camera app found. Use Gallery instead.")
                camera.hasCameraPermission() -> openCamera()
                camera.canAskPermission -> scope.launch {
                    if (camera.requestPermission()) openCamera() else showCameraDenied = true
                }
                else -> showCameraDenied = true
            }
            PhotoSource.Gallery -> openGallery()
        }
    }

    askingConsent?.let { source ->
        PhotoConsentDialog(
            source = source,
            onContinue = {
                askingConsent = null
                consent.giveConsent(source)
                start(source)
            },
            onDismiss = { askingConsent = null }
        )
    }
    if (showCameraDenied) {
        CameraDeniedDialog(
            onUseGallery = {
                showCameraDenied = false
                start(PhotoSource.Gallery)
            },
            onDismiss = { showCameraDenied = false }
        )
    }
    return { source -> start(source) }
}

/** Camera access was refused: explain how to turn it on, or use the photo library instead. */
@Composable
private fun CameraDeniedDialog(onUseGallery: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.NoPhotography, contentDescription = null) },
        title = { Text("Camera access is off") },
        text = {
            Text(
                "To take photos in Dzirent, open Settings > Dzirent and allow Camera. " +
                    "You can also add photos from your gallery."
            )
        },
        confirmButton = { TextButton(onClick = onUseGallery) { Text("Use gallery") } },
        dismissButton = {
            Row {
                TextButton(onClick = {
                    onDismiss()
                    openAppSettings()
                }) { Text("Open Settings") }
                TextButton(onClick = onDismiss) { Text("Not now") }
            }
        }
    )
}
