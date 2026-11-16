package com.dzirent.shared

import com.dzirent.shared.model.ConversationCard
import com.dzirent.shared.model.ListingCard
import com.dzirent.shared.model.MyVerification
import com.dzirent.shared.util.isVerificationGate
import com.dzirent.shared.util.showsVerifiedBadge
import com.dzirent.shared.util.verificationAction
import com.dzirent.shared.util.verificationDetail
import com.dzirent.shared.util.verificationLabel
import com.dzirent.shared.util.verificationNeedsSupport
import com.dzirent.shared.util.verificationSettled
import com.dzirent.shared.util.withVerifiedLabel
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** C6: the same labels, buttons, gate and badge rules as the website (apps/web/src/lib/verification.test.ts). */
class VerificationTest {
    private val base = MyVerification(status = "not_started", attempts = 0, maxAttempts = 3, attemptsLeft = 3, canStart = true)
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Test
    fun everyStatusHasALabel() {
        assertEquals("Verified", verificationLabel("verified"))
        assertEquals("In progress", verificationLabel("in_progress"))
        assertEquals("In review", verificationLabel("in_review"))
        assertEquals("Not verified", verificationLabel("declined"))
        assertEquals("Expired", verificationLabel("expired"))
        assertEquals("Not verified", verificationLabel("not_started"))
        assertEquals("Not verified", verificationLabel(null))
        assertEquals("Not verified", verificationLabel("something_new"))
    }

    @Test
    fun theButtonFollowsTheStatusAndTheTriesLeft() {
        assertEquals("Verify ID", verificationAction(base, available = true))
        assertEquals("Start again", verificationAction(base.copy(status = "in_progress", attempts = 1, attemptsLeft = 2), true))
        assertEquals("Try again", verificationAction(base.copy(status = "declined", attempts = 1, attemptsLeft = 2), true))
        assertEquals("Try again", verificationAction(base.copy(status = "expired", attempts = 1, attemptsLeft = 2), true))
        assertNull(verificationAction(base.copy(status = "verified", canStart = false), true))
        assertNull(verificationAction(base.copy(status = "in_review", canStart = false), true))
        assertNull(verificationAction(base, available = false), "no button while checks aren't available")
        assertNull(verificationAction(base.copy(status = "declined", attempts = 3, attemptsLeft = 0, canStart = false), true))
    }

    @Test
    fun outOfTriesPointsToSupport() {
        assertTrue(verificationNeedsSupport(base.copy(status = "declined", canStart = false)))
        assertFalse(verificationNeedsSupport(base.copy(status = "verified", canStart = false)))
        assertFalse(verificationNeedsSupport(base.copy(status = "in_review", canStart = false)))
        assertTrue(verificationDetail("declined", 0).endsWith("Contact support to verify."))
        assertTrue("1 try left" in verificationDetail("declined", 1))
        assertTrue("2 tries left" in verificationDetail("declined", 2))
        assertTrue("isn't available yet" in verificationDetail("not_started", 3, available = false))
    }

    @Test
    fun checkingWaitsOnlyWhileInProgress() {
        assertFalse(verificationSettled("in_progress"))
        assertFalse(verificationSettled("not_started"))
        assertFalse(verificationSettled(null))
        for (s in listOf("verified", "declined", "in_review", "expired")) assertTrue(verificationSettled(s), s)
    }

    @Test
    fun theGateIsRecognizedByItsCode() {
        assertTrue(isVerificationGate("DZ-E6001"))
        assertFalse(isVerificationGate("DZ-E3005"))
        assertFalse(isVerificationGate(null))
    }

    @Test
    fun theBadgeShowsForVerifiedPeopleOnly() {
        assertTrue(showsVerifiedBadge(true))
        assertFalse(showsVerifiedBadge(false))
        assertFalse(showsVerifiedBadge(null))
        assertEquals("Studio Rostova, Verified", withVerifiedLabel("Studio Rostova", true))
        assertEquals("Studio Rostova", withVerifiedLabel("Studio Rostova", false))
    }

    @Test
    fun theShopWindowFlagsDecodeAndDefaultToNotVerified() {
        val card = json.decodeFromString(ListingCard.serializer(), """{"id":"l1","title":"Gown","is_verified":true}""")
        assertTrue(card.isVerified)
        val older = json.decodeFromString(ListingCard.serializer(), """{"id":"l1","title":"Gown"}""")
        assertFalse(older.isVerified, "a server without C6 means no badge")
        val nulled = json.decodeFromString(ListingCard.serializer(), """{"id":"l1","title":"Gown","is_verified":null}""")
        assertFalse(nulled.isVerified)
        val chat = json.decodeFromString(ConversationCard.serializer(), """{"id":"c1","listing_id":"l1","other_is_verified":true}""")
        assertTrue(chat.otherIsVerified)
        val mine = json.decodeFromString(MyVerification.serializer(), """{"status":"in_review","attempts":1,"max_attempts":3,"attempts_left":2,"can_start":false,"required":false,"verified_at":null,"updated_at":"2026-11-14T00:00:00Z"}""")
        assertEquals("in_review", mine.status)
        assertEquals(2, mine.attemptsLeft)
    }
}
