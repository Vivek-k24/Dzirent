package com.dzirent.shared.platform

/**
 * "Download my data" on iPhone, for now: [savesFiles] is false, so Settings opens the website's
 * Settings > Privacy & safety page (AppLinks.DATA_EXPORT_URL) in the browser, where the same
 * download works.
 *
 * Left for a Mac session: a native save. Write [bytes] to a temporary file named [fileName],
 * show UIDocumentPickerViewController(forExporting:) (or a share sheet) on the top view
 * controller, delete the temporary file afterwards, and return SAVED / CANCELLED / FAILED. Then
 * set savesFiles to true; the shared Settings row already handles the rest.
 */
class IosDataExport : DataExportService {
    override val savesFiles: Boolean = false

    override suspend fun save(fileName: String, bytes: ByteArray): SaveResult = SaveResult.FAILED
}
