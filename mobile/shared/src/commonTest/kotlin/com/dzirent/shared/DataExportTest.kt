package com.dzirent.shared

import com.dzirent.shared.util.DataExport
import kotlinx.datetime.LocalDate
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DataExportTest {
    @AfterTest
    fun clear() = DataExport.forget()

    @Test
    fun fileName() {
        assertEquals("dzirent-data-2026-11-07.json", DataExport.fileName(LocalDate(2026, 11, 7)))
        assertEquals("dzirent-data-2027-01-02.json", DataExport.fileName(LocalDate(2027, 1, 2)))
    }

    @Test
    fun onceADayRefusal() {
        val said = "You can download your data once a day. Try again after Nov 8, 2026, 6:51 PM UTC."
        // As the function returns it, inside JSON.
        assertEquals(said, DataExport.refusal("""{"error":"$said","code":"once_a_day","message":"$said"}"""))
        assertEquals(said, DataExport.refusal("$said $said"))
        assertEquals(DataExport.ONCE_A_DAY, DataExport.refusal("You can download your data once a day."))
        assertNull(DataExport.refusal("""{"error":"Please sign in again."}"""))
        assertNull(DataExport.refusal(null))
    }

    @Test
    fun keptFileIsForThatAccountAndDay() {
        val bytes = "{}".encodeToByteArray()
        DataExport.keep("user-a", "dzirent-data-2026-11-07.json", bytes)
        assertContentEquals(bytes, DataExport.kept("user-a", "dzirent-data-2026-11-07.json"))
        assertNull(DataExport.kept("user-b", "dzirent-data-2026-11-07.json"))
        assertNull(DataExport.kept("user-a", "dzirent-data-2026-11-08.json"))
        DataExport.forget()
        assertNull(DataExport.kept("user-a", "dzirent-data-2026-11-07.json"))
    }
}
