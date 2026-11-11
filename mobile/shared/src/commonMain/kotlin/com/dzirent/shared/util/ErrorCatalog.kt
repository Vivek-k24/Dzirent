package com.dzirent.shared.util

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** An error as the screen shows it: the catalog's words, the field it is about, and the code. */
data class ShownError(val code: String, val message: String, val field: String? = null) {
    /** "Add a photo first (DZ-E2010)": the words, then the code, so people can quote it. */
    val text: String get() = "$message ($code)"
}

/**
 * C1: looks up contracts/error-codes.json (generated into [ErrorCodes]). The server starts each
 * refusal with its code ("DZ-E2010: Add a photo first"; Edge Functions send { code, message }).
 * The screen shows the catalog's words for the code (the server's words when the entry says
 * the server adds details), else the server's words for a code this build doesn't know yet,
 * else DZ-E9999.
 */
object ErrorCatalog {
    const val FALLBACK = "DZ-E9999"

    private val byCode: Map<String, ErrorCode> = ErrorCodes.all.associateBy { it.code }
    private val warningByMessage: Map<String, ErrorCode> =
        ErrorCodes.all.filter { it.kind == ErrorKind.WARNING }.associateBy { it.message }
    private val coded = Regex("""^(DZ-[EW]\d{4}):\s*([\s\S]*)$""")
    private val json = Json { ignoreUnknownKeys = true }

    fun find(code: String?): ErrorCode? = code?.let { byCode[it] }

    /** The catalog's words for [code], or the fallback's. */
    fun message(code: String): String = (byCode[code] ?: byCode.getValue(FALLBACK)).message

    /** An error the app itself decided on (Auth, network, Storage): the catalog's words. */
    fun shown(code: String, field: String? = null): ShownError {
        val entry = byCode[code] ?: byCode.getValue(FALLBACK)
        return ShownError(entry.code, entry.message, field ?: entry.field)
    }

    fun fallback(): ShownError = shown(FALLBACK)

    /** "DZ-E2010: Add a photo first" -> ("DZ-E2010", "Add a photo first"); null without a code. */
    fun parse(serverMessage: String?): Pair<String, String>? {
        val m = coded.find(serverMessage?.trim() ?: return null) ?: return null
        return m.groupValues[1] to m.groupValues[2].trim()
    }

    /**
     * What to show for a server message that starts with a code, with [hint] (the database's
     * HINT) as the field. Null when the message has no code.
     */
    fun fromServer(serverMessage: String?, hint: String? = null): ShownError? {
        val (code, words) = parse(serverMessage) ?: return null
        val field = hint?.trim()?.ifBlank { null }
        val entry = byCode[code]
            ?: return ShownError(code, words.ifBlank { message(FALLBACK) }, field)
        val text = if (entry.serverDetail && words.isNotBlank()) words else entry.message
        return ShownError(code, text, field ?: entry.field)
    }

    /** An Edge Function's error body, { "code": "DZ-E7001", "message": "..." }; null otherwise. */
    fun fromBody(body: String?): ShownError? {
        val text = body?.trim()?.takeIf { it.startsWith("{") } ?: return null
        val obj = runCatching { json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return null
        val code = (obj["code"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
        val words = (obj["message"] as? JsonPrimitive)?.takeIf { it.isString }?.content.orEmpty()
        return fromServer("$code: $words")
    }

    /** The first coded error found in [texts] (a message, then a body, ...), or null. */
    fun fromAny(texts: List<String?>, hint: String? = null): ShownError? =
        texts.firstNotNullOfOrNull { fromServer(it, hint) ?: fromBody(it) }

    /** The DZ-W code for a photo warning, worded as the phone and the scanner word it. */
    fun warningCode(message: String): String? = warningByMessage[message.trim()]?.code

    /** "Too dark: try daylight (DZ-W2002)" for a known photo warning; the words alone otherwise. */
    fun warningText(message: String): String = warningCode(message)?.let { "$message ($it)" } ?: message
}
