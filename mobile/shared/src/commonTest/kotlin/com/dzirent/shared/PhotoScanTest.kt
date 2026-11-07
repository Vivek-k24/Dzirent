package com.dzirent.shared

import com.dzirent.shared.model.Listing
import com.dzirent.shared.model.ListingScan
import com.dzirent.shared.util.CheckBanner
import com.dzirent.shared.util.CheckPhase
import com.dzirent.shared.util.DRAFT_CATEGORY
import com.dzirent.shared.util.DRAFT_TITLE
import com.dzirent.shared.util.FieldOrigin
import com.dzirent.shared.util.FieldState
import com.dzirent.shared.util.GarmentKind
import com.dzirent.shared.util.PhotoSlot
import com.dzirent.shared.util.SuggestField
import com.dzirent.shared.util.checkBanner
import com.dzirent.shared.util.extraWarnings
import com.dzirent.shared.util.fieldsToFill
import com.dzirent.shared.util.isDraft
import com.dzirent.shared.util.photoSetKey
import com.dzirent.shared.util.suggestionsFrom
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PhotoScanTest {

    private fun scan(status: String = "done", verdict: String? = "allowed", suggestions: String? = null, reason: String? = null, admin: String? = null) =
        ListingScan(
            id = "s1", listingId = "l1", status = status, verdict = verdict, reason = reason, adminDecision = admin,
            suggestions = suggestions?.let { Json.parseToJsonElement(it) as JsonObject }
        )

    private val gown = """{"item_key": "gown", "title": "Navy satin gown", "category": "Occasion & Party", "item_type": null,
        "garment_type": "dress", "styles": ["Western formal", "Space age", "Western casual"], "description": "Navy satin gown with grey accents."}"""

    @Test
    fun allowedSuggestionsKeepOnlyValuesTheFormAccepts() {
        val s = suggestionsFrom(scan(suggestions = gown))!!
        assertEquals("Navy satin gown", s.title)
        assertEquals("Occasion & Party", s.category)
        assertEquals(GarmentKind.DRESS, s.kind)
        assertEquals(listOf("Western formal", "Western casual"), s.styles)
        assertEquals("gown", s.label)
        assertNull(s.itemType)
    }

    @Test
    fun onlyAnAllowedFinishedCheckSuggests() {
        assertNull(suggestionsFrom(scan(verdict = "review", suggestions = gown)))
        assertNull(suggestionsFrom(scan(verdict = "rejected", suggestions = gown)))
        assertNull(suggestionsFrom(scan(status = "running", verdict = null, suggestions = gown)))
        assertNull(suggestionsFrom(scan(suggestions = """{"title": "Gown", "category": "Party wear"}""")))
        // An accessory needs one of the item types.
        assertNull(suggestionsFrom(scan(suggestions = """{"title": "Silver watch", "category": "Accessories", "item_type": "Smart ring"}""")))
        val jewelry = suggestionsFrom(scan(suggestions = """{"title": "Necklace", "category": "Accessories", "item_type": "Costume jewelry"}"""))!!
        assertTrue(jewelry.isJewelry)
    }

    @Test
    fun suggestionsNeverOverwriteWhatTheLenderTyped() {
        val s = suggestionsFrom(scan(suggestions = gown))!!
        val states = mapOf(SuggestField.DESCRIPTION to FieldState(FieldOrigin.CLEARED))
        val current = mapOf(SuggestField.TITLE to "My blue dress", SuggestField.CATEGORY to "", SuggestField.DESCRIPTION to "", SuggestField.STYLE to "")
        val fills = fieldsToFill(states, current, s)
        assertEquals(setOf(SuggestField.CATEGORY, SuggestField.STYLE), fills.keys)
        assertEquals("Western formal, Western casual", fills[SuggestField.STYLE])
    }

    @Test
    fun bannerFollowsTheCheck() {
        assertNull(checkBanner(CheckPhase.NONE, null))
        assertEquals(CheckBanner.Uploading, checkBanner(CheckPhase.UPLOADING, null))
        assertEquals(CheckBanner.Checking, checkBanner(CheckPhase.CHECKING, scan(status = "running", verdict = null)))
        assertEquals(CheckBanner.Allowed, checkBanner(CheckPhase.FINISHED, scan()))
        assertEquals(CheckBanner.Rejected("This looks like a hoodie."), checkBanner(CheckPhase.FINISHED, scan(verdict = "rejected", reason = "This looks like a hoodie.")))
        // The check's own reason shows (P2B); without one, the banner's generic line.
        assertEquals(CheckBanner.Review("This piece has a hood, so someone at Dzirent will check it."),
            checkBanner(CheckPhase.FINISHED, scan(verdict = "review", reason = "This piece has a hood, so someone at Dzirent will check it.")))
        assertEquals(CheckBanner.Review("This photo matches another listing."),
            checkBanner(CheckPhase.FINISHED, scan(verdict = "review", reason = "This photo matches another listing.")))
        assertEquals(CheckBanner.Review(null), checkBanner(CheckPhase.FINISHED, scan(verdict = "review", reason = " ")))
        assertEquals(CheckBanner.Failed, checkBanner(CheckPhase.FINISHED, scan(status = "failed", verdict = "review")))
        assertEquals(CheckBanner.Failed, checkBanner(CheckPhase.TIMED_OUT, null))
        // An admin's decision wins over the verdict.
        assertEquals(CheckBanner.Allowed, checkBanner(CheckPhase.FINISHED, scan(verdict = "review", admin = "approved")))
        assertTrue(checkBanner(CheckPhase.FINISHED, scan(admin = "rejected")) is CheckBanner.Rejected)
        // The admin's own reason for a rejection wins.
        assertEquals(CheckBanner.Rejected("Counterfeit designer bag."),
            checkBanner(CheckPhase.FINISHED, scan(verdict = "review", admin = "rejected").copy(adminReason = "Counterfeit designer bag.")))
    }

    @Test
    fun suspensionNoticeMatchesTheDatabaseWording() {
        val now = kotlinx.datetime.Instant.parse("2026-11-07T12:00:00Z")
        assertEquals(
            "Your account is suspended until Nov 8, 2026. Reason: Spam in chats. Contact support if you think this is a mistake.",
            com.dzirent.shared.util.suspensionNotice("2026-11-08 20:15:00.123+00", "Spam in chats.", now)
        )
        assertEquals(
            "Your account is suspended. Reason: Repeated scams. Contact support if you think this is a mistake.",
            com.dzirent.shared.util.suspensionNotice("infinity", "Repeated scams", now)
        )
        assertNull(com.dzirent.shared.util.suspensionNotice("2026-11-07T11:59:59Z", "Over", now), "a suspension that ended")
        assertNull(com.dzirent.shared.util.suspensionNotice(null, null, now))
    }

    @Test
    fun draftRowsAreRecognized() {
        val row = Listing(id = "l1", lenderId = "u1", title = DRAFT_TITLE, category = DRAFT_CATEGORY, approxLat = 0.0, approxLng = 0.0, status = "paused")
        assertTrue(row.isDraft)
        assertFalse(row.copy(title = "Navy satin gown").isDraft)
        assertFalse(row.copy(status = "active").isDraft)
    }

    @Test
    fun photoSetKeyChangesOnlyWithThePhotos() {
        val a = photoSetKey(mapOf(PhotoSlot.BACK to "b.jpg", PhotoSlot.FRONT to "f.jpg"))
        assertEquals("front=f.jpg|back=b.jpg", a)
        assertEquals(a, photoSetKey(mapOf(PhotoSlot.FRONT to "f.jpg", PhotoSlot.BACK to "b.jpg")))
        assertFalse(a == photoSetKey(mapOf(PhotoSlot.FRONT to "b.jpg", PhotoSlot.BACK to "f.jpg")))
    }

    @Test
    fun serverWarningsAreNotShownTwice() {
        assertEquals(listOf("Too dark: try daylight"),
            extraWarnings(listOf("Too blurry: hold steady and retake"), listOf("Too blurry: hold steady and retake", "Too dark: try daylight")))
    }
}
