package com.dzirent.shared

import com.dzirent.shared.platform.AgeSignal
import com.dzirent.shared.util.AgeGate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AgeGateTest {
    @Test
    fun playAgeRanges() {
        assertEquals(AgeSignal.MINOR, AgeSignal.fromRange(0, 12))
        assertEquals(AgeSignal.MINOR, AgeSignal.fromRange(13, 15))
        assertEquals(AgeSignal.MINOR, AgeSignal.fromRange(16, 17))
        assertEquals(AgeSignal.ADULT, AgeSignal.fromRange(18, null))
        assertEquals(AgeSignal.ADULT, AgeSignal.fromRange(21, 99))
    }

    @Test
    fun noApplicableSignal() {
        assertEquals(AgeSignal.NONE, AgeSignal.fromRange(null, null))
        // A range that spans 18 isn't an answer either way.
        assertEquals(AgeSignal.NONE, AgeSignal.fromRange(16, null))
        assertEquals(AgeSignal.NONE, AgeSignal.fromRange(null, 20))
    }

    @Test
    fun whatIsRecorded() {
        assertEquals("store_signal" to "adult", AgeGate.recordFor(AgeSignal.ADULT))
        assertEquals("store_signal" to "minor", AgeGate.recordFor(AgeSignal.MINOR))
        // No signal: the 18+ confirmation at sign-up stands.
        assertEquals("self_declared" to "adult", AgeGate.recordFor(AgeSignal.NONE))
    }

    @Test
    fun onceADay() {
        assertTrue(AgeGate.checkedToday("20400", 20400))
        assertFalse(AgeGate.checkedToday("20399", 20400))
        assertFalse(AgeGate.checkedToday(null, 20400))
    }
}
