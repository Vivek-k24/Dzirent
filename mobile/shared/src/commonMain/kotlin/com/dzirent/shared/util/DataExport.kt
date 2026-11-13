package com.dzirent.shared.util

import kotlinx.datetime.LocalDate

/**
 * "Download my data" (P3A). The server allows one export a day, and the save picker comes after
 * the download, so the last file stays in memory (never on disk) for this account and day: if
 * the user cancels the picker or saving fails, tapping again offers the same file without
 * asking the server again.
 */
object DataExport {
    /** The server's refusal for a second export within 24 hours starts with this. */
    const val ONCE_A_DAY = "You can download your data once a day."

    private val refusalPattern = Regex("""You can download your data once a day\. Try again after [^"\\\n]*? UTC\.""")

    /** "dzirent-data-2026-11-07.json". */
    fun fileName(day: LocalDate): String = "dzirent-data-$day.json"

    /** The once-a-day sentence from an error response or message, or null. */
    fun refusal(text: String?): String? {
        if (text == null) return null
        refusalPattern.find(text)?.let { return it.value }
        return if (text.contains(ONCE_A_DAY)) ONCE_A_DAY else null
    }

    private var lastFile: Triple<String, String, ByteArray>? = null

    /** The file downloaded earlier for [userId] under [fileName] (today), or null. */
    fun kept(userId: String, fileName: String): ByteArray? =
        lastFile?.takeIf { it.first == userId && it.second == fileName }?.third

    fun keep(userId: String, fileName: String, bytes: ByteArray) {
        lastFile = Triple(userId, fileName, bytes)
    }

    fun forget() {
        lastFile = null
    }
}
