package com.dzirent.shared

import com.dzirent.shared.model.*
import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.repository.generateUuid
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ModelTest {

    @Test
    fun testDateRangeAndParsing() {
        val range = parseDateRange("2026-11-01", "2026-11-05")
        assertNotNull(range)
        assertEquals(LocalDate(2026, 11, 1), range.start)
        assertEquals(LocalDate(2026, 11, 5), range.end)

        val overlap = parseDateRange("2026-11-04", "2026-11-08")
        assertNotNull(overlap)
        assertTrue(range.overlaps(overlap))

        val separate = parseDateRange("2026-11-10", "2026-11-15")
        assertNotNull(separate)
        assertFalse(range.overlaps(separate))
    }

    @Test
    fun testGenerateUuidFormat() {
        val uuid = generateUuid()
        val regex = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\$")
        assertTrue(regex.matches(uuid), "Generated UUID '$uuid' should match RFC 4122 v4 regex")
    }

    @Test
    fun testRolesAndCategories() {
        assertTrue(Roles.canLend(Roles.LENDER))
        assertTrue(Roles.canLend(Roles.BOTH))
        assertFalse(Roles.canLend(Roles.RENTER))
        assertTrue(Categories.ALL.contains(Categories.ACCESSORIES))
    }

    @Test
    fun testDzirentException() {
        val ex = DzirentException("Friendly error message")
        assertEquals("Friendly error message", ex.message)
    }
}

