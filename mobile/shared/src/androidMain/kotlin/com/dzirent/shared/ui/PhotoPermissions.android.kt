package com.dzirent.shared.ui

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.dzirent.shared.platform.AndroidPhotoStore
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.platform.PhotoStore
import com.dzirent.shared.platform.cameraDir
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID

/**
 * The camera needs the CAMERA runtime permission, since the app declares it. The Photo Picker
 * needs no storage permission, so the explanation is the only consent step for the gallery
 * (READ_MEDIA_IMAGES is deliberately not requested). Either way the photo is copied into the
 * app ([PhotoStore]) before anything reads it.
 */
@Composable
actual fun rememberPhotoSources(
    photoStore: PhotoStore,
    maxPhotos: Int,
    onPhotos: (List<String>) -> Unit,
    onMessage: (String) -> Unit
): (PhotoSource) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    val consent = remember { PhotoConsentStore(device.prefs) }
    val store = photoStore as AndroidPhotoStore
    val currentOnPhotos by rememberUpdatedState(onPhotos)
    val currentOnMessage by rememberUpdatedState(onMessage)
    var askingConsent by remember { mutableStateOf<PhotoSource?>(null) }
    var showCameraDenied by remember { mutableStateOf(false) }
    var pendingCameraPath by rememberSaveable { mutableStateOf<String?>(null) }

    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(maxPhotos)) { picked ->
        scope.launch {
            val copies = picked.mapNotNull { store.copyIn(it) }
            if (copies.size < picked.size) currentOnMessage("Some photos couldn't be read. Pick different ones.")
            currentOnPhotos(copies)
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val path = pendingCameraPath
        pendingCameraPath = null
        if (path == null) return@rememberLauncherForActivityResult
        scope.launch {
            val uri = if (saved) store.moveIn(File(path)) else null.also { File(path).delete() }
            if (uri != null) currentOnPhotos(listOf(uri)) else if (saved) currentOnMessage("The camera didn't save a photo. Try again.")
        }
    }

    fun openGallery() {
        galleryLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    fun openCamera() {
        val file = File(cameraDir(context), "${UUID.randomUUID()}.jpg")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        pendingCameraPath = file.absolutePath
        try {
            cameraLauncher.launch(uri)
        } catch (e: ActivityNotFoundException) {
            pendingCameraPath = null
            currentOnMessage("No camera app found. Use Gallery instead.")
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) openCamera() else showCameraDenied = true
    }

    fun start(source: PhotoSource) {
        if (!consent.hasConsent(source)) {
            askingConsent = source
            return
        }
        when (source) {
            PhotoSource.Camera -> {
                val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                if (granted) openCamera() else cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
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
            context = context,
            onUseGallery = {
                showCameraDenied = false
                start(PhotoSource.Gallery)
            },
            onDismiss = { showCameraDenied = false }
        )
    }
    return { source -> start(source) }
}

/** Camera permission was refused: explain how to turn it on, or use the gallery instead. */
@Composable
fun CameraDeniedDialog(context: Context, onUseGallery: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.NoPhotography, contentDescription = null) },
        title = { Text("Camera access is off") },
        text = {
            Text(
                "To take photos in Dzirent, open Settings > Apps > Dzirent > Permissions and allow Camera. " +
                    "You can also add photos from your gallery."
            )
        },
        confirmButton = { TextButton(onClick = onUseGallery) { Text("Use gallery") } },
        dismissButton = {
            Row {
                TextButton(onClick = {
                    onDismiss()
                    openAppSettings(context)
                }) { Text("Open Settings") }
                TextButton(onClick = onDismiss) { Text("Not now") }
            }
        }
    )
}

private fun openAppSettings(context: Context) {
    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}
