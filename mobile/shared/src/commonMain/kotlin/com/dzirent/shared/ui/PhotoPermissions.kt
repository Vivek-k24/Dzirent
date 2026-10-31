package com.dzirent.shared.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import com.dzirent.shared.platform.KeyValueStore
import com.dzirent.shared.platform.PhotoStore

/** Which photo source a consent question is about. */
enum class PhotoSource { Camera, Gallery }

/**
 * Remembers on this device that the user tapped Continue on the camera or photos
 * explanation, so it is shown only once. "Not now" is not stored: the next tap asks again.
 */
class PhotoConsentStore(private val prefs: KeyValueStore) {
    fun hasConsent(source: PhotoSource): Boolean = prefs.getBoolean(key(source), false)

    fun giveConsent(source: PhotoSource) {
        prefs.putBoolean(key(source), true)
    }

    private fun key(source: PhotoSource) = when (source) {
        PhotoSource.Camera -> "photo_consent_camera"
        PhotoSource.Gallery -> "photo_consent_gallery"
    }
}

/** Shown before the camera or Photo Picker opens for the first time (same style as location). */
@Composable
fun PhotoConsentDialog(source: PhotoSource, onContinue: () -> Unit, onDismiss: () -> Unit) {
    val camera = source == PhotoSource.Camera
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(if (camera) Icons.Default.PhotoCamera else Icons.Default.PhotoLibrary, contentDescription = null) },
        title = { Text(if (camera) "Use your camera" else "Use your photos") },
        text = {
            Text(
                if (camera) "Dzirent uses your camera only to add pictures to your listing."
                else "Dzirent uses your photos only to add pictures to your listing."
            )
        },
        confirmButton = { TextButton(onClick = onContinue) { Text("Continue") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now") } }
    )
}

/**
 * Opens the camera or the photo picker for a listing. The first time each source is used, a
 * short explanation asks for consent ([PhotoConsentStore]); the camera then needs its runtime
 * permission. Picked and taken photos are copied into [photoStore] first, and [onPhotos] gets
 * their file URIs. Returns the function that starts a source.
 */
@Composable
expect fun rememberPhotoSources(
    photoStore: PhotoStore,
    maxPhotos: Int,
    onPhotos: (List<String>) -> Unit,
    onMessage: (String) -> Unit
): (PhotoSource) -> Unit
