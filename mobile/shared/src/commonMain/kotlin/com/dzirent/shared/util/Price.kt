package com.dzirent.shared.util

import kotlin.math.roundToLong
import kotlinx.datetime.daysUntil

/** Upper limit for a rental price, to catch typos like an extra zero. */
const val PRICE_MAX_USD = 10_000.0

/**
 * The "Price ($)" field as typed, or null when it isn't a valid price: a number above 0 and
 * at most [PRICE_MAX_USD], with at most 2 decimals. A leading "$" and spaces are ignored.
 */
fun parsePrice(text: String): Double? {
    val cleaned = text.trim().removePrefix("$").trim()
    if (!Regex("""\d+(\.\d{1,2})?|\.\d{1,2}""").matches(cleaned)) return null
    val value = cleaned.toDoubleOrNull() ?: return null
    return value.takeIf { it > 0.0 && it <= PRICE_MAX_USD }
}

/** "$25" for whole dollars, "$25.50" otherwise. */
fun formatPrice(usd: Double): String {
    val cents = roundHalfUp(usd, 2)
    return if (!stripTrailingZeros(cents).contains('.')) "$" + stripTrailingZeros(cents)
    else "$" + cents
}

/** C1: a listing's price is per day. "$25/day". */
fun formatPerDay(usd: Double): String = formatPrice(usd) + "/day"

/** Days in an inclusive range, as the database counts them: Nov 5 - Nov 8 is 4 days. */
fun rentalDays(range: DateRange): Int = range.start.daysUntil(range.end) + 1

/** Price per day times [days], in whole cents (no floating-point drift). */
fun rentalTotal(perDayUsd: Double, days: Int): Double = (perDayUsd * 100).roundToLong() * days / 100.0

/** "5 days · $125", "1 day · $25": the listing page's line for the chosen dates. */
fun daysAndTotal(perDayUsd: Double, range: DateRange): String {
    val days = rentalDays(range)
    return "${if (days == 1) "1 day" else "$days days"} · ${formatPrice(rentalTotal(perDayUsd, days))}"
}

/** The price field's starting text when editing: "25" or "25.5", never "25.0". */
fun priceInputText(usd: Double?): String =
    usd?.let { stripTrailingZeros(plainString(it)) }.orEmpty()
