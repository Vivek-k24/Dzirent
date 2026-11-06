package com.dzirent.shared.data

import com.dzirent.shared.platform.KeyValueStore
import com.dzirent.shared.util.PhotoChecks

/**
 * What the phone worked out about one photo: its instant checks (sharp, light, framing), or
 * null when it couldn't be read. What the piece is comes from the server's photo check.
 */
class PhotoAnalysis(val checks: PhotoChecks?)

/** Remembers on this phone which users signed the current accessory declaration, so it isn't fetched every time. */
class DeclarationCache(private val prefs: KeyValueStore) {
    fun isSigned(userId: String, version: Int): Boolean = prefs.getBoolean(key(userId, version), false)

    fun markSigned(userId: String, version: Int) {
        prefs.putBoolean(key(userId, version), true)
    }

    private fun key(userId: String, version: Int) = "accessory_declaration_${version}_$userId"
}
