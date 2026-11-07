package com.dzirent.shared.platform

/** What happened when the user was asked where to save their data file. */
enum class SaveResult { SAVED, CANCELLED, FAILED }

/**
 * Saving the "Download my data" file (P3A). Android shows the system "save file" picker
 * (Storage Access Framework). The iPhone opens the website's Settings > Privacy page for now
 * ([savesFiles] false); a native save sheet comes in a Mac session.
 */
interface DataExportService {
    /** True when [save] can save a file on this phone; false: open AppLinks.DATA_EXPORT_URL instead. */
    val savesFiles: Boolean

    /** Asks where to save [bytes] as [fileName] (suggested), then writes them. */
    suspend fun save(fileName: String, bytes: ByteArray): SaveResult
}
