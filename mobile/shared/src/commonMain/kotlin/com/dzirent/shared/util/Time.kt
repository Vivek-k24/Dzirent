package com.dzirent.shared.util

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn

// The few java.time conveniences the reference app uses, on kotlinx-datetime so they run on
// Android and iOS alike. Formats are fixed US English, as the reference's Locale.US ones.

/** Today in the phone's time zone. */
fun today(): LocalDate = Clock.System.todayIn(TimeZone.currentSystemDefault())

fun LocalDate.plusDays(days: Long): LocalDate = plus(days, DateTimeUnit.DAY)
fun LocalDate.plusDays(days: Int): LocalDate = plus(days, DateTimeUnit.DAY)
fun LocalDate.minusDays(days: Long): LocalDate = minus(days, DateTimeUnit.DAY)
fun LocalDate.isBefore(other: LocalDate): Boolean = this < other
fun LocalDate.isAfter(other: LocalDate): Boolean = this > other

private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
private val WEEKDAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

/** "MMM": "Oct". */
fun LocalDate.monthShort(): String = MONTHS[monthNumber - 1]

/** "MMM d": "Oct 26". */
fun LocalDate.shortDate(): String = "${monthShort()} $dayOfMonth"

/** "MMM yyyy": "Oct 2026". */
fun LocalDate.monthYear(): String = "${monthShort()} $year"

/** "EEE": "Tue". */
fun LocalDate.weekdayShort(): String = WEEKDAYS[dayOfWeek.isoDayNumber - 1]

/** "MMMM": "October". */
fun LocalDate.monthLong(): String = when (monthNumber) {
    1 -> "January"; 2 -> "February"; 3 -> "March"; 4 -> "April"; 5 -> "May"; 6 -> "June"
    7 -> "July"; 8 -> "August"; 9 -> "September"; 10 -> "October"; 11 -> "November"; else -> "December"
}

/** "h:mm a": "3:42 PM". */
fun LocalDateTime.timeOfDay(): String {
    val h12 = if (hour % 12 == 0) 12 else hour % 12
    return "$h12:${minute.toString().padStart(2, '0')} ${if (hour < 12) "AM" else "PM"}"
}

/**
 * An ISO timestamp from the database ("2026-10-30T12:34:56.123456+00:00"), or null if it
 * can't be read. Tolerates a space for "T" and a two-digit "+00" offset.
 */
fun parseTimestamp(iso: String?): Instant? {
    if (iso.isNullOrBlank()) return null
    var s = iso.trim().replace(' ', 'T')
    if (Regex("[+-]\\d{2}$").containsMatchIn(s)) s += ":00"
    return runCatching { Instant.parse(s) }.getOrNull()
}

fun Instant.local(): LocalDateTime = toLocalDateTime(TimeZone.currentSystemDefault())

fun nowInstant(): Instant = Clock.System.now()

/** Epoch millis now. */
fun nowMillis(): Long = Clock.System.now().toEpochMilliseconds()
