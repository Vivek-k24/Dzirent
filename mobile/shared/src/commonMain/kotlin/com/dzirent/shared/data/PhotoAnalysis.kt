package com.dzirent.shared.data

import com.dzirent.shared.platform.KeyValueStore
import com.dzirent.shared.util.ColorVotes
import com.dzirent.shared.util.PhotoChecks
import com.dzirent.shared.util.PhotoScores

/**
 * What the phone worked out about one photo: the checks (null when it couldn't be read), the
 * image embedding for item recognition and the same-item check (null if the model isn't
 * available), the model's scores for it, and the color votes from the garment area.
 */
class PhotoAnalysis(
    val checks: PhotoChecks?,
    val embedding: FloatArray? = null,
    val scores: PhotoScores? = null,
    val colors: ColorVotes = ColorVotes.EMPTY
)

/** Remembers on this phone which users signed the current accessory declaration, so it isn't fetched every time. */
class DeclarationCache(private val prefs: KeyValueStore) {
    fun isSigned(userId: String, version: Int): Boolean = prefs.getBoolean(key(userId, version), false)

    fun markSigned(userId: String, version: Int) {
        prefs.putBoolean(key(userId, version), true)
    }

    private fun key(userId: String, version: Int) = "accessory_declaration_${version}_$userId"
}
