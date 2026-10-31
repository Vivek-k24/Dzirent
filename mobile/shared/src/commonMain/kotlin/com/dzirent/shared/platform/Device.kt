package com.dzirent.shared.platform

import androidx.compose.runtime.staticCompositionLocalOf
import com.dzirent.shared.data.PhotoAnalysis
import com.dzirent.shared.util.PhotoScores
import com.dzirent.shared.util.SavedDraft

/** Small flags kept on the phone (the reference app's "dzirent_prefs" SharedPreferences). */
interface KeyValueStore {
    fun getBoolean(key: String, default: Boolean = false): Boolean
    fun putBoolean(key: String, value: Boolean)
    fun getString(key: String): String?
    fun putString(key: String, value: String?)
}

/**
 * The app's own copies of the photos in a listing being made, one folder per user. Camera and
 * gallery photos both end up here as plain JPEG files before anything reads them, so they go
 * through the same checks, and a draft's photos are still readable after a restart.
 * Photos are identified by their file URI.
 */
interface PhotoStore {
    /** Deletes every copy except [keep] (photo URIs still in use). */
    fun prune(keep: Set<String>)

    /** Deletes the copies at these URIs (photos now uploaded). */
    fun delete(uris: Collection<String>)

    fun clear()
}

/** The draft of one user's new listing, or of one listing being edited, saved on the phone. */
interface DraftStore {
    suspend fun load(): SavedDraft?
    suspend fun save(draft: SavedDraft)
    suspend fun clear()
}

/** Checks photos and runs item recognition on them, on the phone. */
interface PhotoAnalyzer {
    suspend fun analyze(uri: String): PhotoAnalysis

    /** The model's scores for an embedding (several photos averaged), or null if the model isn't available. */
    suspend fun scores(embedding: FloatArray): PhotoScores?
}

/** What the shared screens need from the phone that Compose doesn't give them. */
interface DeviceServices {
    val prefs: KeyValueStore
    val photoAnalyzer: PhotoAnalyzer
    val imageCompressor: ImageCompressor
    val locationService: LocationService
    val searchRelated: com.dzirent.shared.util.SearchRelated

    /** The app's version name ("1.0.0"), recorded with the accessory declaration. */
    val appVersion: String

    /** The build number (versionCode). */
    val appBuild: Long

    fun photoStore(userId: String): PhotoStore
    fun draftStore(userId: String, listingId: String?): DraftStore

    /** The bytes of a photo picked or taken for a listing, or null if it can't be read. */
    suspend fun readPhoto(uri: String): ByteArray?

    /** Deletes leftover camera captures. */
    fun clearCameraCache()

    /** A short message at the bottom of the screen (Android Toast). */
    fun toast(message: String)

    /** Opens a web page or mailto: link outside the app. */
    fun openUrl(url: String)
}

val LocalDevice = staticCompositionLocalOf<DeviceServices> { error("DeviceServices not provided") }
