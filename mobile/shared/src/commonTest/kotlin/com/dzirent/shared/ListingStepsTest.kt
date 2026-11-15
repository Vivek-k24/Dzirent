package com.dzirent.shared

import com.dzirent.shared.repository.clientErrorCode
import com.dzirent.shared.util.DRAFT_CATEGORY
import com.dzirent.shared.util.DRAFT_TITLE
import com.dzirent.shared.util.DateRange
import com.dzirent.shared.util.ReadRetry
import com.dzirent.shared.util.SIGN_DECLARATION
import com.dzirent.shared.util.Step2Input
import com.dzirent.shared.util.detailsMissing
import com.dzirent.shared.util.draftListing
import com.dzirent.shared.util.isDraft
import com.dzirent.shared.util.isUnfinished
import com.dzirent.shared.util.listingActions
import com.dzirent.shared.util.isOwnStudio
import com.dzirent.shared.util.step2Missing
import com.dzirent.shared.util.studioActions
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * F1: the listing editor's steps (the same codes as the website's listing-flow.test.ts): the
 * photos step's draft row needs no size, each step asks for its own fields with the catalog's
 * field-level message, network failures are DZ-E9002 within 30 seconds, and your own studio and
 * listing offer Edit, never Save, Message or Report.
 */
class ListingStepsTest {
    private val next30 = DateRange(LocalDate(2026, 11, 15), LocalDate(2026, 12, 14))
    private val ready = Step2Input(
        sizeLabel = "M",
        priceText = "25",
        isAccessory = false,
        listingDeclarationChecked = false,
        retailValueText = "",
        priceNote = "",
        description = "",
        measurementsOk = true,
        ranges = listOf(next30),
        hasLocation = true
    )

    @Test
    fun theDraftRowSavesWithoutASizePriceOrDetails() {
        val row = draftListing("6f1c2a7e-0000-4000-8000-000000000001", "me", "Austin, TX", 30.27, -97.74)
        assertEquals("", row.sizeLabel)
        assertNull(row.priceUsd)
        assertEquals("", row.description)
        assertNull(row.itemType)
        assertEquals(DRAFT_TITLE, row.title)
        assertEquals(DRAFT_CATEGORY, row.category)
        assertEquals("paused", row.status)
        assertTrue(row.isDraft, "reopened from My closet it is a draft, and publishing makes it live")
    }

    @Test
    fun aRowWithoutASizeOrPriceIsUnfinishedAndPublishesLikeANewOne() {
        val draft = draftListing("6f1c2a7e-0000-4000-8000-000000000002", "me", "Austin, TX", 30.27, -97.74)
        assertTrue(draft.isUnfinished)
        // Saved from the website's details step: a real title, still no size or price.
        val details = draft.copy(title = "Navy linen blazer", category = "Career & Professional")
        assertFalse(details.isDraft)
        assertTrue(details.isUnfinished, "the closet's switch never turns it on; Publish does")
        assertFalse(details.copy(sizeLabel = "M", priceUsd = 25.0).isUnfinished)
        assertFalse(details.copy(status = "active").isUnfinished, "a live listing is never treated as unfinished")
    }

    @Test
    fun continuingPastDetailsDoesNotAskForTheSize() {
        assertNull(detailsMissing("Navy linen blazer", "Everyday", null, declarationPending = false))
    }

    @Test
    fun theDetailsStepAsksForItsOwnFieldsWithTheirCatalogMessages() {
        val title = detailsMissing("", "Everyday", null, declarationPending = false)!!
        assertEquals("DZ-E2070", title.code)
        assertEquals("title", title.field)
        assertEquals("Title must be 3 to 80 characters. (DZ-E2070)", title.message)
        assertEquals("DZ-E2071", detailsMissing("Navy linen blazer", null, null, false)?.code)
        assertEquals("DZ-E2072", detailsMissing("Silk tie", "Accessories", null, false)?.code)
        val declaration = detailsMissing("Silk tie", "Accessories", "Tie", declarationPending = true)!!
        assertEquals(SIGN_DECLARATION, declaration.button)
        assertEquals("DZ-E2040", declaration.code)
    }

    @Test
    fun publishingWithoutASizeIsRefusedWithTheSizeMessage() {
        val missing = step2Missing(ready.copy(sizeLabel = ""))!!
        assertEquals("Choose a size", missing.button)
        assertEquals("DZ-E2074", missing.code)
        assertEquals("size_label", missing.field)
        assertEquals("Choose a size. (DZ-E2074)", missing.message)
        assertNull(step2Missing(ready))
    }

    @Test
    fun everyOtherStep3GapHasItsOwnCatalogMessage() {
        assertEquals("DZ-E2076", step2Missing(ready.copy(priceText = ""))?.code)
        assertEquals("price_usd", step2Missing(ready.copy(priceText = "0"))?.field)
        assertEquals("DZ-E2083", step2Missing(ready.copy(measurementsOk = false))?.code)
        assertEquals("DZ-E2084", step2Missing(ready.copy(ranges = emptyList()))?.code)
        assertEquals("DZ-E2079", step2Missing(ready.copy(retailValueText = "-5"))?.code)
        assertEquals("DZ-E2077", step2Missing(ready.copy(priceNote = "x".repeat(61)))?.code)
        assertEquals("DZ-E2073", step2Missing(ready.copy(description = "x".repeat(1001)))?.code)
        val accessory = ready.copy(isAccessory = true, sizeLabel = "One size")
        assertEquals("DZ-E2081", step2Missing(accessory)?.code)
        assertEquals("DZ-E2080", step2Missing(accessory.copy(listingDeclarationChecked = true, retailValueText = "301"))?.code)
        assertNull(step2Missing(accessory.copy(listingDeclarationChecked = true)))
        // Without a location there's no code: the editor shows its own card with "Set my location".
        assertNull(step2Missing(ready.copy(hasLocation = false))?.code)
    }

    @Test
    fun aStalledOrDroppedCallIsDzE9002AfterThirtySeconds() {
        assertEquals(30_000L, ReadRetry.REQUEST_TIMEOUT_MS)
        assertEquals("DZ-E9002", clientErrorCode("Request timeout has expired [url=https://x.supabase.co/rest/v1/listings, request_timeout=30000 ms]"))
        assertEquals("DZ-E9002", clientErrorCode("Unable to resolve host \"x.supabase.co\": No address associated with hostname"))
        assertEquals("DZ-E9002", clientErrorCode("Connection reset"))
        assertEquals("DZ-E9002", clientErrorCode("Software caused connection abort"))
        assertEquals("DZ-E9002", clientErrorCode("unexpected end of stream on https://x.supabase.co/..."))
        assertNull(clientErrorCode("duplicate key value violates unique constraint"))
    }

    @Test
    fun yourOwnStudioOffersEditStudioNotSaveOrMessage() {
        val own = studioActions(isOwn = true, hasPieces = true)
        assertTrue(own.edit)
        assertFalse(own.save)
        assertFalse(own.message)
        val other = studioActions(isOwn = false, hasPieces = true)
        assertFalse(other.edit)
        assertTrue(other.save)
        assertTrue(other.message)
        assertFalse(studioActions(isOwn = false, hasPieces = false).message, "nothing listed: nothing to message about")

        assertTrue(isOwnStudio(pageSaysOwn = false, lenderId = "u1", currentUserId = "u1"))
        assertTrue(isOwnStudio(pageSaysOwn = true, lenderId = "u1", currentUserId = "u2"))
        assertFalse(isOwnStudio(pageSaysOwn = false, lenderId = "u1", currentUserId = "u2"))
        assertFalse(isOwnStudio(pageSaysOwn = false, lenderId = "", currentUserId = ""), "signed out is never your own")
    }

    @Test
    fun yourOwnListingOffersEditNotReportOrSave() {
        val own = listingActions(isOwn = true, isGuest = false)
        assertTrue(own.edit)
        assertFalse(own.report)
        assertFalse(own.save)
        val other = listingActions(isOwn = false, isGuest = false)
        assertTrue(other.report)
        assertTrue(other.save)
        assertFalse(other.edit)
        val guest = listingActions(isOwn = false, isGuest = true)
        assertFalse(guest.report, "a guest has nothing to report from")
        assertTrue(guest.save)
    }
}
