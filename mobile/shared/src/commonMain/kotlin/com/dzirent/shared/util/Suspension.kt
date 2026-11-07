package com.dzirent.shared.util

import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * "Your account is suspended until Nov 8, 2026. Reason: …" for a suspension that hasn't ended
 * ([until] from profiles.suspended_until; "infinity" is a ban, with no end date), else null.
 * The same wording as the database's refusal, so the notice and a refused action agree.
 */
fun suspensionNotice(until: String?, reason: String?, now: Instant = nowInstant()): String? {
    val raw = until?.trim()
    if (raw.isNullOrEmpty()) return null
    val why = reason?.trim()?.trimEnd('.')?.ifBlank { null }?.let { " Reason: $it." } ?: ""
    val contact = " Contact support if you think this is a mistake."
    if (raw == "infinity") return "Your account is suspended.$why$contact"
    val end = parseTimestamp(raw) ?: return null
    if (end <= now) return null
    val date = end.toLocalDateTime(TimeZone.UTC).date
    return "Your account is suspended until ${date.shortDate()}, ${date.year}.$why$contact"
}
