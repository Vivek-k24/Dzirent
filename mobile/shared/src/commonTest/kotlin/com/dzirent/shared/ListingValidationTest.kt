package com.dzirent.shared

import com.dzirent.shared.model.MeasurementInput
import com.dzirent.shared.model.validateListingForm
import com.dzirent.shared.model.validateMeasurements
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ListingValidationTest {

    @Test
    fun testTitleLengthLimits() {
        // Empty or blank title
        assertFalse(validateListingForm("", 25.0).isValid)
        assertFalse(validateListingForm("   ", 25.0).isValid)

        // 2 characters (below minimum 3)
        val shortResult = validateListingForm("ab", 25.0)
        assertFalse(shortResult.isValid)
        assertNotNull(shortResult.titleError)

        // 3 characters (minimum boundary)
        val minResult = validateListingForm("abc", 25.0)
        assertTrue(minResult.isValid)
        assertNull(minResult.titleError)

        // 80 characters (maximum boundary)
        val valid80 = "a".repeat(80)
        val maxResult = validateListingForm(valid80, 25.0)
        assertTrue(maxResult.isValid)
        assertNull(maxResult.titleError)

        // 81 characters (above maximum 80)
        val invalid81 = "a".repeat(81)
        val overResult = validateListingForm(invalid81, 25.0)
        assertFalse(overResult.isValid)
        assertNotNull(overResult.titleError)
    }

    @Test
    fun testPriceLimits() {
        // Null or missing price
        assertFalse(validateListingForm("Silk Blouse", null).isValid)

        // Negative price
        val negativeResult = validateListingForm("Silk Blouse", -10.0)
        assertFalse(negativeResult.isValid)
        assertNotNull(negativeResult.priceError)

        // Zero price (must be above 0)
        val zeroResult = validateListingForm("Silk Blouse", 0.0)
        assertFalse(zeroResult.isValid)
        assertNotNull(zeroResult.priceError)

        // Valid positive prices
        assertTrue(validateListingForm("Silk Blouse", 0.50).isValid)
        assertTrue(validateListingForm("Silk Blouse", 25.0).isValid)
        assertTrue(validateListingForm("Silk Blouse", 10_000.0).isValid)

        // Over maximum price limit (10,000)
        val overResult = validateListingForm("Silk Blouse", 10_001.0)
        assertFalse(overResult.isValid)
        assertNotNull(overResult.priceError)
    }

    @Test
    fun testMeasurementValuesLimits() {
        // Value 0 or negative must fail
        val zeroMeasurement = listOf(MeasurementInput("Chest", "0"))
        val zeroErrors = validateMeasurements(zeroMeasurement)
        assertEquals(1, zeroErrors.size)
        assertNotNull(zeroErrors[0])

        val negMeasurement = listOf(MeasurementInput("Chest", "-5"))
        assertNotNull(validateMeasurements(negMeasurement)[0])

        // Valid values between 1 and 999 (0 < value < 1000)
        val valid1 = listOf(MeasurementInput("Chest", "1"))
        assertNull(validateMeasurements(valid1)[0])

        val validMid = listOf(MeasurementInput("Chest", "38.5"))
        assertNull(validateMeasurements(validMid)[0])

        val valid999 = listOf(MeasurementInput("Length", "999"))
        assertNull(validateMeasurements(valid999)[0])

        // 1000 and above must fail (< 1000)
        val invalid1000 = listOf(MeasurementInput("Length", "1000"))
        assertNotNull(validateMeasurements(invalid1000)[0])

        val invalidOver = listOf(MeasurementInput("Length", "1500"))
        assertNotNull(validateMeasurements(invalidOver)[0])

        // Test through validateListingForm
        val validForm = validateListingForm("Silk Blouse", 50.0, validMid)
        assertTrue(validForm.isValid)

        val invalidForm = validateListingForm("Silk Blouse", 50.0, invalid1000)
        assertFalse(invalidForm.isValid)
    }

    @Test
    fun testMeasurementLabelLimits() {
        // Missing label with value
        val noLabel = listOf(MeasurementInput("", "38"))
        assertNotNull(validateMeasurements(noLabel)[0])

        // Duplicate labels (case-insensitive)
        val duplicates = listOf(
            MeasurementInput("Chest", "38"),
            MeasurementInput("chest", "40")
        )
        val dupErrors = validateMeasurements(duplicates)
        assertNull(dupErrors[0]) // first is fine
        assertNotNull(dupErrors[1]) // duplicate rejected

        // Blank rows are ignored
        val blankRow = listOf(MeasurementInput("", ""))
        assertNull(validateMeasurements(blankRow)[0])
    }
}

