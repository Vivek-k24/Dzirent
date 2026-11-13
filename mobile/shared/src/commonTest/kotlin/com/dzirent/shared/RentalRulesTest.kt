package com.dzirent.shared

import com.dzirent.shared.platform.ChatPush
import com.dzirent.shared.util.DateRange
import com.dzirent.shared.util.RentalAction
import com.dzirent.shared.util.RentalGroup
import com.dzirent.shared.util.RentalStatus
import com.dzirent.shared.util.conditionPhotoStage
import com.dzirent.shared.util.daysAndTotal
import com.dzirent.shared.util.isRentableDay
import com.dzirent.shared.util.rentalActions
import com.dzirent.shared.util.rentalDatesProblem
import com.dzirent.shared.util.rentalEventLabel
import com.dzirent.shared.util.rentalGroup
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** C3: rental totals, what each person may do in each state, grouping and the request dates. */
class RentalRulesTest {
    private fun d(s: String) = LocalDate.parse(s)
    private fun range(a: String, b: String) = DateRange(d(a), d(b))

    @Test
    fun totals() {
        assertEquals("5 days · \$75", daysAndTotal(15.0, range("2026-12-01", "2026-12-05")))
        assertEquals("4 days · \$220", daysAndTotal(55.0, range("2026-12-30", "2027-01-02")))
        assertEquals("1 day · \$14", daysAndTotal(14.0, range("2026-12-01", "2026-12-01")))
    }

    @Test
    fun actionsPerStateAndRole() {
        assertEquals(listOf(RentalAction.ACCEPT, RentalAction.DECLINE), rentalActions(RentalStatus.REQUESTED, iAmLender = true))
        assertEquals(listOf(RentalAction.CANCEL), rentalActions(RentalStatus.REQUESTED, iAmLender = false))
        assertEquals(
            listOf(RentalAction.ADD_PICKUP_PHOTOS, RentalAction.MARK_PICKED_UP, RentalAction.CANCEL),
            rentalActions(RentalStatus.ACCEPTED, iAmLender = true)
        )
        assertEquals(listOf(RentalAction.ADD_PICKUP_PHOTOS, RentalAction.CANCEL), rentalActions(RentalStatus.ACCEPTED, iAmLender = false))
        assertEquals(listOf(RentalAction.ADD_RETURN_PHOTOS, RentalAction.MARK_RETURNED), rentalActions(RentalStatus.PICKED_UP, iAmLender = true))
        assertEquals(listOf(RentalAction.ADD_RETURN_PHOTOS), rentalActions(RentalStatus.PICKED_UP, iAmLender = false))
        assertEquals(listOf(RentalAction.CANCEL), rentalActions(RentalStatus.AWAITING_PAYMENT, iAmLender = false))
        assertEquals(listOf(RentalAction.ADD_RETURN_PHOTOS, RentalAction.COMPLETE), rentalActions(RentalStatus.RETURNED, iAmLender = true))
        for (ended in listOf(RentalStatus.COMPLETED, RentalStatus.CANCELLED, RentalStatus.DECLINED, RentalStatus.EXPIRED)) {
            assertTrue(rentalActions(ended, iAmLender = true).isEmpty(), "$ended has no actions")
            assertTrue(rentalActions(ended, iAmLender = false).isEmpty(), "$ended has no actions")
        }
        // Nobody can cancel after pickup.
        assertFalse(RentalAction.CANCEL in rentalActions(RentalStatus.PICKED_UP, iAmLender = true))
    }

    @Test
    fun photoStagesMatchTheBucketRules() {
        assertEquals("pickup", conditionPhotoStage(RentalStatus.ACCEPTED))
        assertEquals("pickup", conditionPhotoStage(RentalStatus.PAID))
        assertEquals("return", conditionPhotoStage(RentalStatus.PICKED_UP))
        assertNull(conditionPhotoStage(RentalStatus.REQUESTED))
        assertNull(conditionPhotoStage(RentalStatus.COMPLETED))
    }

    @Test
    fun groupsPutIncomingRequestsFirst() {
        assertEquals(RentalGroup.REQUESTS_FOR_YOU, rentalGroup(RentalStatus.REQUESTED, iAmLender = true))
        assertEquals(RentalGroup.WAITING, rentalGroup(RentalStatus.REQUESTED, iAmLender = false))
        assertEquals(RentalGroup.UPCOMING, rentalGroup(RentalStatus.ACCEPTED, iAmLender = false))
        assertEquals(RentalGroup.IN_PROGRESS, rentalGroup(RentalStatus.PICKED_UP, iAmLender = true))
        assertEquals(RentalGroup.PAST, rentalGroup(RentalStatus.EXPIRED, iAmLender = true))
        assertEquals(RentalGroup.REQUESTS_FOR_YOU, RentalGroup.entries.first())
    }

    @Test
    fun requestDatesFollowTheDatabase() {
        val today = d("2026-11-13")
        val windows = listOf(range("2026-11-13", "2026-11-30"), range("2026-12-01", "2026-12-20"))
        val booked = listOf(range("2026-11-20", "2026-11-23"))
        assertNull(rentalDatesProblem(range("2026-11-24", "2026-11-26"), windows, booked, today), "back-to-back is fine")
        assertNull(rentalDatesProblem(range("2026-11-28", "2026-12-03"), windows, booked, today), "adjacent windows join")
        assertEquals("DZ-E4009", rentalDatesProblem(range("2026-11-23", "2026-11-25"), windows, booked, today))
        assertEquals("DZ-E4008", rentalDatesProblem(range("2026-12-19", "2026-12-22"), windows, booked, today))
        assertEquals("DZ-E4006", rentalDatesProblem(range("2026-11-12", "2026-11-14"), windows, booked, today))
        assertEquals("DZ-E4008", rentalDatesProblem(range("2026-11-14", "2026-11-15"), emptyList(), booked, today), "no windows: not rentable")
        assertTrue(isRentableDay(d("2026-11-24"), windows, booked, today))
        assertFalse(isRentableDay(d("2026-11-21"), windows, booked, today))
    }

    @Test
    fun timelineWording() {
        assertEquals("Accepted by you", rentalEventLabel(RentalStatus.ACCEPTED, "you", "Studio Rostova"))
        assertEquals("Requested by Jordan", rentalEventLabel(RentalStatus.REQUESTED, "other", "Jordan"))
        assertEquals("Expired (Dzirent)", rentalEventLabel(RentalStatus.EXPIRED, "dzirent", "Jordan"))
    }

    @Test
    fun rentalPushesOpenTheirChat() {
        val push = ChatPush.from(mapOf("kind" to "pickup_tomorrow", "conversation_id" to "c9", "recipient_id" to "u1", "title" to "Pickup tomorrow"))
        assertNotNull(push)
        assertEquals("chat_c9", push.tag)
        assertTrue(push.shouldShow("u1", visibleChatId = null))
    }
}
