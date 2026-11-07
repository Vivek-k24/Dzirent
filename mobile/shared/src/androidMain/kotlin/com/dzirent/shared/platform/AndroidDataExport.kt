package com.dzirent.shared.platform

import android.content.Context
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * "Download my data" on Android (P3A): the system "save file" picker (Storage Access Framework,
 * ACTION_CREATE_DOCUMENT), so the user chooses where the file goes and the app needs no storage
 * permission.
 *
 * Built in the activity's onCreate (the picker must be registered before the activity starts).
 * The file waiting to be saved is held per process, not per activity, so turning the phone while
 * the picker is open still saves it through the new activity's picker result.
 */
class AndroidDataExport(activity: ComponentActivity) : DataExportService {
    private val app = activity.applicationContext
    private val picker = activity.registerForActivityResult(
        ActivityResultContracts.CreateDocument(MIME_TYPE)
    ) { uri -> onPicked(app, uri) }

    override val savesFiles: Boolean = true

    override suspend fun save(fileName: String, bytes: ByteArray): SaveResult {
        val result = CompletableDeferred<SaveResult>()
        synchronized(Pending) {
            Pending.bytes = bytes
            Pending.result?.complete(SaveResult.CANCELLED)
            Pending.result = result
        }
        try {
            picker.launch(fileName)
        } catch (_: Exception) {
            // No app on the phone can create documents.
            synchronized(Pending) { Pending.bytes = null; Pending.result = null }
            return SaveResult.FAILED
        }
        return result.await()
    }

    private object Pending {
        var bytes: ByteArray? = null
        var result: CompletableDeferred<SaveResult>? = null
    }

    private companion object {
        const val MIME_TYPE = "application/json"

        fun onPicked(context: Context, uri: Uri?) {
            val (bytes, result) = synchronized(Pending) {
                (Pending.bytes to Pending.result).also { Pending.bytes = null; Pending.result = null }
            }
            if (uri == null || bytes == null) {
                result?.complete(SaveResult.CANCELLED)
                return
            }
            CoroutineScope(Dispatchers.IO).launch {
                val written = runCatching {
                    context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) } != null
                }.getOrDefault(false)
                result?.complete(if (written) SaveResult.SAVED else SaveResult.FAILED)
            }
        }
    }
}
