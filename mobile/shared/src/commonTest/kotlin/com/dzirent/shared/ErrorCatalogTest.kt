package com.dzirent.shared

import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.repository.clientErrorCode
import com.dzirent.shared.repository.storageRefusal
import com.dzirent.shared.util.ErrorCatalog
import com.dzirent.shared.util.ErrorCodes
import com.dzirent.shared.util.PhotoIssue
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** C1: catalog lookups and the fallbacks (catalog words, then server words, then DZ-E9999). */
class ErrorCatalogTest {
    @Test
    fun knownCodeShowsTheCatalogWordsAndTheHintAsField() {
        val shown = assertNotNull(ErrorCatalog.fromServer("DZ-E1050: anything the server says", hint = "title"))
        assertEquals("DZ-E1050", shown.code)
        assertEquals("This text includes language that isn't allowed on Dzirent.", shown.message)
        assertEquals("title", shown.field)
        assertEquals("This text includes language that isn't allowed on Dzirent. (DZ-E1050)", shown.text)
    }

    @Test
    fun catalogFieldIsUsedWithoutAHint() {
        val shown = assertNotNull(ErrorCatalog.fromServer("DZ-E2041: Type your full legal name"))
        assertEquals("full_legal_name", shown.field)
    }

    @Test
    fun serverDetailCodesKeepTheServersWords() {
        val said = "Your account is suspended until Nov 8, 2026. Reason: spam."
        val shown = assertNotNull(ErrorCatalog.fromServer("DZ-E1040: $said"))
        assertEquals(said, shown.message)
        assertEquals("DZ-E1040", shown.code)
    }

    @Test
    fun unknownCodeFallsBackToTheServersWords() {
        val shown = assertNotNull(ErrorCatalog.fromServer("DZ-E4999: A rule from a newer server."))
        assertEquals("A rule from a newer server.", shown.message)
        assertEquals("DZ-E4999", shown.code)
    }

    @Test
    fun noCodeIsNotAServerRefusalAndTheFallbackIsE9999() {
        assertNull(ErrorCatalog.fromServer("duplicate key value violates unique constraint"))
        assertNull(ErrorCatalog.fromServer(null))
        val fallback = ErrorCatalog.fallback()
        assertEquals("DZ-E9999", fallback.code)
        assertEquals("Something went wrong. Please try again.", fallback.message)
        assertEquals("DZ-E9999", ErrorCatalog.shown("DZ-E0000").code)
    }

    @Test
    fun edgeFunctionBodiesAreRead() {
        val shown = assertNotNull(
            ErrorCatalog.fromBody("""{"code":"DZ-E7001","message":"You can download your data once a day. Try again after Nov 12, 2026, 6:51 PM UTC."}""")
        )
        assertEquals("DZ-E7001", shown.code)
        assertTrue(shown.message.startsWith("You can download your data once a day. Try again after"))
        assertNull(ErrorCatalog.fromBody("not json"))
        assertEquals("DZ-E9011", ErrorCatalog.fromAny(listOf(null, """{"code":"DZ-E9011","message":"x"}"""))?.code)
    }

    @Test
    fun clientSideFailuresGetTheirCodes() {
        assertEquals("DZ-E1004", clientErrorCode("Invalid login credentials"))
        assertEquals("DZ-E9002", clientErrorCode("Unable to resolve host \"example\""))
        assertNull(clientErrorCode("something else"))
        assertEquals("DZ-E2065", storageRefusal(413, ""))
        assertEquals("DZ-E2064", storageRefusal(400, "mime type image/gif is not supported"))
        val e = DzirentException(ErrorCatalog.shown("DZ-E2065"))
        assertEquals("This photo is too big. Choose one under 10 MB. (DZ-E2065)", e.message)
        assertEquals("DZ-E2065", e.code)
    }

    @Test
    fun photoWarningsHaveW2Codes() {
        assertEquals("DZ-W2001", PhotoIssue.BLURRY.code)
        assertTrue(PhotoIssue.entries.all { it.code?.startsWith("DZ-W2") == true })
        assertEquals("Too dark: try daylight (DZ-W2002)", ErrorCatalog.warningText("Too dark: try daylight"))
        assertEquals("Some new warning", ErrorCatalog.warningText("Some new warning"))
    }

    @Test
    fun codesAreUniqueAndWellFormed() {
        val codes = ErrorCodes.all.map { it.code }
        assertEquals(codes.size, codes.toSet().size)
        assertTrue(codes.all { Regex("""DZ-[EW]\d{4}""").matches(it) })
    }
}
