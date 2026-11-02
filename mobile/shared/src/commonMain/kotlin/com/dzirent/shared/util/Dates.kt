package com.dzirent.shared.util

import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil

/** An inclusive range of whole days. */
data class DateRange(val start: LocalDate, val end: LocalDate) {
    init {
        require(!end.isBefore(start)) { "end must not be before start" }
    }

    /** True if the two ranges share at least one day (both ends inclusive). */
    fun overlaps(other: DateRange): Boolean = !start.isAfter(other.end) && !other.start.isAfter(end)

    fun format(): String = "${start.shortDate()} - ${end.shortDate()}"
}

/** Settings > Preferences > Default rental length, in days. */
val RENTAL_LENGTH_OPTIONS = listOf(3, 4, 5, 7)
const val DEFAULT_RENTAL_DAYS = 5

/** Home's starting date range: [days] days from [today], counting today. */
fun defaultBrowseRange(today: LocalDate, days: Int = DEFAULT_RENTAL_DAYS): DateRange =
    DateRange(today, today.plusDays(days.coerceAtLeast(1) - 1L))

/**
 * The Home date chip: "Oct 26 - 30" in one month, "Oct 26 - Nov 1" across months,
 * "Dec 30 - Jan 2" across years, "Oct 26" for a single day. There is no "any date".
 */
fun formatDateChip(range: DateRange): String {
    val start = range.start.shortDate()
    return when {
        range.start == range.end -> start
        range.start.year == range.end.year && range.start.month == range.end.month ->
            "$start - ${range.end.dayOfMonth}"
        else -> "$start - ${range.end.shortDate()}"
    }
}

/**
 * The dates question, worded the same everywhere one is created (Saved, studio "Message",
 * the chat chip): "Is this available Oct 27 - 31?". The chat is about one piece, so "this".
 */
fun datesQuestion(dates: DateRange): String = "Is this available ${formatDateChip(dates)}?"

/**
 * [dates] if the message [body] asks about them (it contains the chip text, as the
 * dates question does), so the chat can save them. Null if the dates were edited out.
 */
fun datesAsked(body: String, dates: DateRange): DateRange? = dates.takeIf { formatDateChip(dates) in body }

/**
 * The line under the pinned listing in chat: "Your dates: Oct 27 - 31" for the renter
 * who asked, "Their dates: Oct 27 - 31" for the lender. Null when none were asked.
 */
fun chatDatesLine(dates: DateRange?, iAmRenter: Boolean): String? =
    dates?.let { (if (iAmRenter) "Your dates: " else "Their dates: ") + formatDateChip(it) }

/**
 * True if [wanted] lies inside the availability [windows]. Back-to-back (the next window
 * starts the day after) and overlapping windows are joined first, so a range spanning
 * them counts. No windows at all means "available any time" (listings from before
 * availability was required).
 */
fun isAvailableFor(windows: List<DateRange>, wanted: DateRange): Boolean {
    if (windows.isEmpty()) return true
    val merged = mutableListOf<DateRange>()
    windows.sortedBy { it.start }.forEach { window ->
        val last = merged.lastOrNull()
        if (last != null && !window.start.isAfter(last.end.plusDays(1))) {
            if (window.end.isAfter(last.end)) merged[merged.lastIndex] = DateRange(last.start, window.end)
        } else {
            merged += window
        }
    }
    return merged.any { !it.start.isAfter(wanted.start) && !it.end.isBefore(wanted.end) }
}

/** The first existing range that [candidate] overlaps, or null if it fits. */
fun firstOverlap(candidate: DateRange, existing: List<DateRange>): DateRange? =
    existing.firstOrNull { it.overlaps(candidate) }

/** Parses two ISO dates (yyyy-MM-dd), or null if either is missing or invalid. */
fun parseDateRange(start: String?, end: String?): DateRange? {
    val s = start?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
    val e = end?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
    return if (e.isBefore(s)) null else DateRange(s, e)
}

/** "Nov 3 - Nov 10" from two ISO dates (yyyy-MM-dd). Null if either is missing or invalid. */
fun formatDateRange(start: String?, end: String?): String? = parseDateRange(start, end)?.format()

/** Time on a chat bubble: "3:42 PM" today, otherwise "Oct 3, 3:42 PM". */
fun formatMessageTime(iso: String?, now: Instant = nowInstant()): String {
    val local = parseTimestamp(iso)?.local() ?: return ""
    val today = now.local().date
    val time = local.timeOfDay()
    return if (local.date == today) time else "${local.date.shortDate()}, $time"
}

/** Inbox time: "3:42 PM" today, "Tue" within a week, otherwise "Oct 3". */
fun formatInboxTime(iso: String?, now: Instant = nowInstant()): String {
    val local = parseTimestamp(iso)?.local() ?: return ""
    val today = now.local().date
    val days = local.date.daysUntil(today)
    return when {
        days <= 0 -> local.timeOfDay()
        days < 7 -> local.date.weekdayShort()
        else -> local.date.shortDate()
    }
}

/** Epoch millis of an ISO timestamp, or 0 if missing or invalid (sorts last). */
fun timestampMillis(iso: String?): Long = parseTimestamp(iso)?.toEpochMilliseconds() ?: 0L

/** Whole days since an ISO timestamp, or null if it can't be parsed. */
fun daysSince(iso: String?, now: Instant = nowInstant()): Long? =
    parseTimestamp(iso)?.let { (now - it).inWholeDays }
