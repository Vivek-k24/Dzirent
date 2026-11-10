package com.dzirent.shared.util

import io.ktor.http.Url
import io.ktor.http.decodeURLPart
import io.ktor.http.encodeURLPathPart

/**
 * P5C: the clean links people share (always https://dzirent.com, never tracking parameters),
 * the share text, and reading a dzirent.com link the phone opened in the app (Android app links).
 */
object ShareLinks {
    const val SITE = "https://dzirent.com"

    fun listingUrl(id: String) = "$SITE/listing/$id"
    fun studioUrl(handle: String) = "$SITE/studio/${handle.encodeURLPathPart()}"

    fun listingText(title: String, id: String) = "$title on Dzirent: ${listingUrl(id)}"
    fun studioText(name: String, handle: String) = "$name on Dzirent: ${studioUrl(handle)}"

    private val HOSTS = setOf("dzirent.com", "www.dzirent.com")
    private val UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    private val HANDLE = Regex("^[A-Za-z0-9._-]{1,60}$")

    /** The listing or studio a dzirent.com link points to, or null for any other link. */
    fun parse(link: String?): LinkTarget? {
        val url = runCatching { Url(link?.trim().orEmpty()) }.getOrNull() ?: return null
        if (url.protocol.name != "https" || url.host.lowercase() !in HOSTS) return null
        val parts = url.encodedPath.trim('/').split('/')
        if (parts.size != 2) return null
        val value = runCatching { parts[1].decodeURLPart() }.getOrNull() ?: return null
        return when (parts[0]) {
            "listing" -> if (UUID.matches(value)) LinkTarget.Listing(value.lowercase()) else null
            "studio" -> if (HANDLE.matches(value)) LinkTarget.Studio(value) else null
            else -> null
        }
    }
}

/** Where an opened dzirent.com link should take the app. */
sealed interface LinkTarget {
    data class Listing(val id: String) : LinkTarget
    data class Studio(val handle: String) : LinkTarget
}
