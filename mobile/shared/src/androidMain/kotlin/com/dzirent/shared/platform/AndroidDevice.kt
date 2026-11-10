package com.dzirent.shared.platform

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.widget.Toast
import com.dzirent.shared.data.AndroidPhotoAnalyzer
import com.dzirent.shared.util.SavedDraft
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/** Folder for camera captures, shared with FileProvider (res/xml/file_paths.xml). */
fun cameraDir(context: Context): File = File(context.cacheDir, "camera").apply { mkdirs() }

class AndroidDeviceServices(
    context: Context,
    override val appVersion: String,
    override val appBuild: Long,
    /** Firebase lives in the app module (androidApp), which hands it in. */
    override val push: PushService,
    /** Google Play Age Signals also lives in the app module. */
    override val ageSignals: AgeSignalsService,
    /** Needs the activity for the system "save file" picker: [AndroidDataExport]. */
    override val dataExport: DataExportService
) : DeviceServices {
    private val app = context.applicationContext

    // Same file as the reference app, so its flags (photo consent, tips, declaration) carry over.
    override val prefs: KeyValueStore = SharedPreferencesStore(app.getSharedPreferences("dzirent_prefs", Context.MODE_PRIVATE))
    override val photoAnalyzer: PhotoAnalyzer by lazy { AndroidPhotoAnalyzer(app) }
    override val imageCompressor: ImageCompressor = AndroidImageCompressor()
    override val locationService: LocationService by lazy { AndroidLocationService(app) }
    override val searchRelated: com.dzirent.shared.util.SearchRelated by lazy {
        try {
            app.assets.open("search_related.json").bufferedReader().use {
                com.dzirent.shared.util.SearchRelated.parse(it.readText())
            }
        } catch (_: Exception) {
            com.dzirent.shared.util.SearchRelated(emptyMap(), emptyMap())
        }
    }

    override fun photoStore(userId: String): PhotoStore = AndroidPhotoStore(app, userId)
    override fun draftStore(userId: String, listingId: String?): DraftStore = AndroidDraftStore(app, userId, listingId)

    override suspend fun readPhoto(uri: String): ByteArray? = withContext(Dispatchers.IO) {
        try {
            app.contentResolver.openInputStream(Uri.parse(uri))?.use { it.readBytes() }
        } catch (e: Exception) {
            null
        }
    }

    override fun clearCameraCache() {
        cameraDir(app).listFiles()?.forEach { it.delete() }
    }

    override fun toast(message: String) {
        Toast.makeText(app, message, Toast.LENGTH_SHORT).show()
    }

    override fun openUrl(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { app.startActivity(intent) }
    }

    override fun share(text: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        val chooser = Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { app.startActivity(chooser) }
    }
}

private class SharedPreferencesStore(private val prefs: SharedPreferences) : KeyValueStore {
    override fun getBoolean(key: String, default: Boolean): Boolean = prefs.getBoolean(key, default)
    override fun putBoolean(key: String, value: Boolean) = prefs.edit().putBoolean(key, value).apply()
    override fun getString(key: String): String? = prefs.getString(key, null)
    override fun putString(key: String, value: String?) = prefs.edit().putString(key, value).apply()
}

/** Photo copies in filesDir/listing_photos/<user>, as in the reference app. */
class AndroidPhotoStore(context: Context, userId: String) : PhotoStore {
    private val dir = File(context.applicationContext.filesDir, "listing_photos/${safe(userId)}").apply { mkdirs() }
    private val resolver = context.applicationContext.contentResolver

    /** Copies a gallery photo in. Null if it can't be read. */
    suspend fun copyIn(uri: Uri): String? = withContext(Dispatchers.IO) {
        val file = File(dir, "${UUID.randomUUID()}.jpg")
        try {
            val copied = resolver.openInputStream(uri)?.use { input -> file.outputStream().use { input.copyTo(it) } }
            if (copied == null || file.length() == 0L) {
                file.delete()
                null
            } else {
                Uri.fromFile(file).toString()
            }
        } catch (e: Exception) {
            file.delete()
            null
        }
    }

    /** Moves a camera capture (cacheDir/camera, written through the FileProvider) in. Null if it's empty. */
    suspend fun moveIn(capture: File): String? = withContext(Dispatchers.IO) {
        if (!capture.isFile || capture.length() == 0L) {
            capture.delete()
            return@withContext null
        }
        val file = File(dir, "${UUID.randomUUID()}.jpg")
        if (!capture.renameTo(file)) {
            capture.copyTo(file, overwrite = true)
            capture.delete()
        }
        Uri.fromFile(file).toString()
    }

    override fun prune(keep: Set<String>) {
        dir.listFiles()?.forEach { if (Uri.fromFile(it).toString() !in keep) it.delete() }
    }

    override fun delete(uris: Collection<String>) {
        dir.listFiles()?.forEach { if (Uri.fromFile(it).toString() in uris) it.delete() }
    }

    override fun clear() {
        dir.listFiles()?.forEach { it.delete() }
    }

    private companion object {
        fun safe(id: String) = id.filter { it.isLetterOrDigit() || it == '-' }.ifBlank { "anonymous" }
    }
}

/**
 * The draft of one user's new listing ([listingId] null) or of one listing being edited, saved
 * on the phone as it changes. Another account signing in on the same phone never sees it.
 */
private class AndroidDraftStore(context: Context, userId: String, listingId: String?) : DraftStore {
    private val name = listOfNotNull(userId, listingId?.let { "edit_$it" }).joinToString("_") { id ->
        id.filter { it.isLetterOrDigit() || it == '-' || it == '_' }
    }
    private val file = File(context.applicationContext.filesDir, "drafts/$name.json")

    override suspend fun load(): SavedDraft? = withContext(Dispatchers.IO) {
        if (file.isFile) SavedDraft.decode(runCatching { file.readText() }.getOrNull()) else null
    }

    override suspend fun save(draft: SavedDraft) {
        withContext(Dispatchers.IO) {
            runCatching {
                file.parentFile?.mkdirs()
                // Write then rename, so a crash mid-write never leaves half a draft.
                val tmp = File(file.parentFile, file.name + ".tmp")
                tmp.writeText(SavedDraft.encode(draft))
                if (!tmp.renameTo(file)) {
                    file.delete()
                    tmp.renameTo(file)
                }
            }
        }
    }

    override suspend fun clear() {
        withContext(Dispatchers.IO) { file.delete() }
    }
}
