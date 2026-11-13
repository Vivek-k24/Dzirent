package com.dzirent.shared

import com.dzirent.shared.util.DateRange
import com.dzirent.shared.util.ReadRetry
import com.dzirent.shared.util.daysAndTotal
import com.dzirent.shared.util.formatPerDay
import com.dzirent.shared.util.rentalDays
import com.dzirent.shared.util.rentalTotal
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** C1: price per day, days and totals (the database counts the same way), and read retries. */
class PricePerDayTest {
    private fun range(a: String, b: String) = DateRange(LocalDate.parse(a), LocalDate.parse(b))

    @Test
    fun oneDay() {
        val r = range("2026-11-20", "2026-11-20")
        assertEquals(1, rentalDays(r))
        assertEquals("1 day · \$25", daysAndTotal(25.0, r))
    }

    @Test
    fun fiveDays() {
        val r = range("2026-11-20", "2026-11-24")
        assertEquals(5, rentalDays(r))
        assertEquals(62.5, rentalTotal(12.5, 5))
        assertEquals("5 days · \$62.50", daysAndTotal(12.5, r))
    }

    @Test
    fun acrossAMonthAndAYear() {
        assertEquals(4, rentalDays(range("2027-01-30", "2027-02-02")))
        assertEquals(4, rentalDays(range("2027-02-27", "2027-03-02")))
        assertEquals("4 days · \$80", daysAndTotal(20.0, range("2026-12-30", "2027-01-02")))
    }

    @Test
    fun centsDoNotDrift() {
        assertEquals(33.3, rentalTotal(11.1, 3))
        assertEquals("\$25/day", formatPerDay(25.0))
        assertEquals("\$12.50/day", formatPerDay(12.5))
    }

    @Test
    fun onlyReadsAreRetried() {
        assertTrue(ReadRetry.isRead("GET", "/rest/v1/listings"))
        assertTrue(ReadRetry.isRead("POST", "/rest/v1/rpc/browse_listings"))
        assertTrue(ReadRetry.isRead("post", "/rest/v1/rpc/get_listing"))
        assertFalse(ReadRetry.isRead("POST", "/rest/v1/rpc/start_conversation"))
        assertFalse(ReadRetry.isRead("POST", "/rest/v1/messages"))
        assertFalse(ReadRetry.isRead("PATCH", "/rest/v1/listings"))
        assertFalse(ReadRetry.isRead("POST", "/functions/v1/export-my-data"))
        assertFalse(ReadRetry.isRead("GET", "/realtime/v1/websocket"))
        assertEquals(2, ReadRetry.MAX_RETRIES)
        assertEquals(500L, ReadRetry.delayMs(1))
        assertEquals(2_000L, ReadRetry.delayMs(2))
        assertTrue(ReadRetry.retryableStatus(503))
        assertFalse(ReadRetry.retryableStatus(400))
        assertFalse(ReadRetry.retryableStatus(501))
    }
}
