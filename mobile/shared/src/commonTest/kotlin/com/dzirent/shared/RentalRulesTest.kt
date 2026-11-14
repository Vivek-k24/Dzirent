package com.dzirent.shared

import com.dzirent.shared.platform.ChatPush
import com.dzirent.shared.util.DateRange
import com.dzirent.shared.util.DepositStatus
import com.dzirent.shared.util.PaymentFacts
import com.dzirent.shared.util.PaymentStatus
import com.dzirent.shared.util.PayoutState
import com.dzirent.shared.util.ReceiptLine
import com.dzirent.shared.util.RentalAction
import com.dzirent.shared.util.RentalGroup
import com.dzirent.shared.util.RentalStatus
import com.dzirent.shared.util.claimAmountProblem
import com.dzirent.shared.util.claimLine
import com.dzirent.shared.util.claimPhotosProblem
import com.dzirent.shared.util.claimReasonProblem
import com.dzirent.shared.util.conditionPhotoStage
import com.dzirent.shared.util.daysAndTotal
import com.dzirent.shared.util.depositLine
import com.dzirent.shared.util.isRentableDay
import com.dzirent.shared.util.parseDepositAmount
import com.dzirent.shared.util.payLabel
import com.dzirent.shared.util.payoutState
import com.dzirent.shared.util.rentalActions
import com.dzirent.shared.util.rentalDatesProblem
import com.dzirent.shared.util.rentalEventLabel
import com.dzirent.shared.util.rentalGroup
import com.dzirent.shared.util.rentalReceipt
import com.dzirent.shared.util.rentalStatusLabel
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
        assertTrue(isRentableDay(d("2026-11-24"), windows, booked, today))
        assertFalse(isRentableDay(d("2026-11-21"), windows, booked, today))
    }

    /** C5 (C4 owner decision): no availability windows means every day from today is open, as the server. */
    @Test
    fun noWindowsMeansEveryFutureDayIsOpen() {
        val today = d("2026-11-13")
        val booked = listOf(range("2026-11-20", "2026-11-23"))
        assertNull(rentalDatesProblem(range("2026-11-14", "2026-11-15"), emptyList(), booked, today))
        assertNull(rentalDatesProblem(range("2027-06-01", "2027-06-30"), emptyList(), emptyList(), today), "far ahead too")
        assertTrue(isRentableDay(d("2026-11-13"), emptyList(), booked, today), "today")
        assertFalse(isRentableDay(d("2026-11-12"), emptyList(), booked, today), "never the past")
        assertEquals("DZ-E4009", rentalDatesProblem(range("2026-11-19", "2026-11-20"), emptyList(), booked, today), "booked days stay closed")
    }

    @Test
    fun timelineWording() {
        assertEquals("Accepted by you", rentalEventLabel(RentalStatus.ACCEPTED, "you", "Studio Rostova"))
        assertEquals("Requested by Jordan", rentalEventLabel(RentalStatus.REQUESTED, "other", "Jordan"))
        assertEquals("Expired (Dzirent)", rentalEventLabel(RentalStatus.EXPIRED, "dzirent", "Jordan"))
    }

    /** C5: the request answer time comes from the server's rental_request_hours. */
    @Test
    fun requestHoursComeFromTheServer() {
        assertEquals("Rental request: answer within 24 hours", rentalStatusLabel(RentalStatus.REQUESTED, iAmLender = true, requestHours = 24))
        assertEquals("Expired: no answer in 72 hours", rentalStatusLabel(RentalStatus.EXPIRED, iAmLender = false, requestHours = 72))
        assertEquals("Rental request: answer within 1 hour", rentalStatusLabel(RentalStatus.REQUESTED, iAmLender = true, requestHours = 1))
        // Not loaded: no number at all, never a hard-coded one.
        assertFalse(Regex("\\d").containsMatchIn(rentalStatusLabel(RentalStatus.REQUESTED, iAmLender = true)))
        assertFalse(Regex("\\d").containsMatchIn(rentalStatusLabel(RentalStatus.EXPIRED, iAmLender = true)))
    }

    /** C5: every payment state's label and actions for each person. */
    @Test
    fun paymentStatesActionsAndLabels() {
        val on = PaymentFacts(paymentsOn = true, depositAmount = 40.0)
        // Awaiting payment: the renter pays (only with payments on); either can cancel.
        assertEquals(listOf(RentalAction.PAY, RentalAction.CANCEL), rentalActions(RentalStatus.AWAITING_PAYMENT, false, on))
        assertEquals(listOf(RentalAction.CANCEL), rentalActions(RentalStatus.AWAITING_PAYMENT, true, on))
        assertEquals(listOf(RentalAction.CANCEL), rentalActions(RentalStatus.AWAITING_PAYMENT, false, on.copy(paymentsOn = false)), "payments off: no Pay")
        assertEquals("Accepted: pay to confirm", rentalStatusLabel(RentalStatus.AWAITING_PAYMENT, false))
        assertEquals("Accepted: waiting for the renter's payment", rentalStatusLabel(RentalStatus.AWAITING_PAYMENT, true))
        assertEquals("Pay \$220", payLabel(220.0))
        assertEquals("Pay \$1,250.50", payLabel(1250.5))
        // Paid with a deposit: the lender places the hold, which marks it picked up.
        assertEquals(listOf(RentalAction.ADD_PICKUP_PHOTOS, RentalAction.PLACE_HOLD, RentalAction.CANCEL), rentalActions(RentalStatus.PAID, true, on))
        assertEquals(listOf(RentalAction.ADD_PICKUP_PHOTOS, RentalAction.CANCEL), rentalActions(RentalStatus.PAID, false, on))
        assertEquals(listOf(RentalAction.ADD_PICKUP_PHOTOS, RentalAction.MARK_PICKED_UP, RentalAction.CANCEL),
            rentalActions(RentalStatus.PAID, true, on.copy(depositAmount = null)), "no deposit: mark picked up")
        assertEquals(listOf(RentalAction.ADD_PICKUP_PHOTOS, RentalAction.MARK_PICKED_UP, RentalAction.CANCEL),
            rentalActions(RentalStatus.PAID, true, on.copy(depositStatus = DepositStatus.HELD)), "hold in place: mark picked up")
        // Returned: the lender may claim inside the window while the hold is there.
        val held = on.copy(depositStatus = DepositStatus.HELD, claimWindowOpen = true)
        assertEquals(listOf(RentalAction.ADD_RETURN_PHOTOS, RentalAction.FILE_CLAIM, RentalAction.COMPLETE), rentalActions(RentalStatus.RETURNED, true, held))
        assertEquals(listOf(RentalAction.ADD_RETURN_PHOTOS, RentalAction.COMPLETE), rentalActions(RentalStatus.RETURNED, true, held.copy(claimWindowOpen = false)))
        assertEquals(listOf(RentalAction.ADD_RETURN_PHOTOS), rentalActions(RentalStatus.RETURNED, false, held))
        // Claimed: the renter answers an open claim; nobody acts on a dispute (Dzirent decides).
        val claimed = held.copy(claimStatus = "open")
        assertEquals(listOf(RentalAction.ACCEPT_CLAIM, RentalAction.DISPUTE_CLAIM), rentalActions(RentalStatus.CLAIMED, false, claimed))
        assertEquals(emptyList(), rentalActions(RentalStatus.CLAIMED, true, claimed))
        assertEquals(emptyList(), rentalActions(RentalStatus.DISPUTED, false, claimed.copy(claimStatus = "disputed")))
        assertEquals("Claim filed: accept or dispute it", rentalStatusLabel(RentalStatus.CLAIMED, false))
        assertEquals("Claim filed: waiting for the renter", rentalStatusLabel(RentalStatus.CLAIMED, true))
        assertEquals("In dispute: Dzirent will decide", rentalStatusLabel(RentalStatus.DISPUTED, true))
        // Ended and paid: a receipt for both; without a payment none.
        for (ended in listOf(RentalStatus.COMPLETED, RentalStatus.CANCELLED)) {
            assertEquals(listOf(RentalAction.RECEIPT), rentalActions(ended, true, on.copy(paymentStatus = PaymentStatus.PAID)))
            assertEquals(listOf(RentalAction.RECEIPT), rentalActions(ended, false, on.copy(paymentStatus = PaymentStatus.REFUNDED)))
            assertEquals(emptyList(), rentalActions(ended, false, PaymentFacts()))
        }
        // The deposit in plain words.
        assertEquals("Deposit \$40: held on the renter's card, not charged", depositLine(40.0, DepositStatus.HELD, 0.0))
        assertEquals("Deposit \$40: \$30 charged for the claim", depositLine(40.0, DepositStatus.CAPTURED, 30.0))
        assertEquals("Deposit \$40: released, nothing charged", depositLine(40.0, DepositStatus.RELEASED, 0.0))
        assertNull(depositLine(null, DepositStatus.NONE, null))
        assertEquals("Claim decided: \$20 from the deposit", claimLine("decided", 30.0, 20.0, iAmLender = false))
        assertEquals("Claim decided: no charge, the hold is released", claimLine("decided", 30.0, 0.0, iAmLender = true))
    }

    /** C5: payments off (now): the C3 actions, with no payment step anywhere. */
    @Test
    fun paymentsOffShowsNoPaymentSteps() {
        val off = PaymentFacts(paymentsOn = false)
        for (status in listOf(RentalStatus.REQUESTED, RentalStatus.ACCEPTED, RentalStatus.AWAITING_PAYMENT, RentalStatus.PAID, RentalStatus.PICKED_UP, RentalStatus.RETURNED)) {
            for (lender in listOf(true, false)) {
                assertTrue(rentalActions(status, lender, off).none { it in setOf(RentalAction.PAY, RentalAction.PLACE_HOLD, RentalAction.FILE_CLAIM, RentalAction.RECEIPT) }, status)
            }
        }
    }

    /** C5: a claim is above $0, up to the deposit, at most cents; a reason of 3-500; 1-10 photos. */
    @Test
    fun claimLimits() {
        assertNull(claimAmountProblem("40", 40.0), "the whole deposit")
        assertNull(claimAmountProblem("\$12.50", 40.0))
        assertEquals("DZ-E4041", claimAmountProblem("40.01", 40.0), "above the deposit")
        assertEquals("DZ-E4041", claimAmountProblem("0", 40.0))
        assertEquals("DZ-E4041", claimAmountProblem("-5", 40.0))
        assertEquals("DZ-E4041", claimAmountProblem("1.234", 40.0), "at most cents")
        assertEquals("DZ-E4041", claimAmountProblem("abc", 40.0))
        assertEquals("DZ-E4041", claimAmountProblem("10", null), "no deposit")
        assertEquals("DZ-E4042", claimReasonProblem("ok"))
        assertNull(claimReasonProblem("Torn hem"))
        assertEquals("DZ-E4042", claimReasonProblem("x".repeat(501)))
        assertEquals("DZ-E4043", claimPhotosProblem(0))
        assertNull(claimPhotosProblem(1))
        assertEquals("DZ-E4043", claimPhotosProblem(11))
        // The listing editor's deposit: empty is none; above $0 up to $99,999.99.
        assertNull(parseDepositAmount("").getOrThrow())
        assertEquals(40.0, parseDepositAmount("40").getOrThrow())
        assertEquals("DZ-E4051", parseDepositAmount("100000").exceptionOrNull()?.message)
        assertEquals("DZ-E4051", parseDepositAmount("0").exceptionOrNull()?.message)
    }

    /** C5: receipt totals for each side. */
    @Test
    fun receiptTotals() {
        val renter = rentalReceipt(false, 55.0, 4, 220.0, 0.0, 0.0, 0.0, 40.0, DepositStatus.RELEASED, 0.0)
        assertEquals(
            listOf(
                ReceiptLine("\$55.00 × 4 days", "\$220.00"), ReceiptLine("Paid", "\$220.00"),
                ReceiptLine("Total", "\$220.00"), ReceiptLine("Deposit hold \$40.00", "released")
            ),
            renter
        )
        val claimed = rentalReceipt(false, 55.0, 4, 220.0, 0.0, 0.0, 0.0, 40.0, DepositStatus.CAPTURED, 30.0)
        assertEquals(ReceiptLine("Charged from the deposit", "\$30.00"), claimed[2])
        assertEquals(ReceiptLine("Total", "\$250.00"), claimed.last())
        val refunded = rentalReceipt(false, 50.0, 2, 100.0, 0.0, 0.0, 100.0, null, DepositStatus.NONE, null)
        assertEquals(ReceiptLine("Refunded", "-\$100.00"), refunded[2])
        assertEquals(ReceiptLine("Total", "\$0.00"), refunded.last())
        // The lender: a 10% fee comes off in proportion to what wasn't refunded; a captured deposit adds.
        val lender = rentalReceipt(true, 50.0, 2, 100.0, 0.0, 10.0, 50.0, 40.0, DepositStatus.CAPTURED, 20.0)
        assertEquals(
            listOf(
                ReceiptLine("\$50.00 × 2 days", "\$100.00"), ReceiptLine("Dzirent fee", "-\$5.00"),
                ReceiptLine("Refunded to the renter", "-\$50.00"), ReceiptLine("From the deposit", "\$20.00"),
                ReceiptLine("You receive", "\$65.00")
            ),
            lender
        )
    }

    /** C5: My studio's payout states. */
    @Test
    fun payoutStates() {
        assertEquals(PayoutState.NOT_SET_UP, payoutState(exists = false, chargesEnabled = false, payoutsEnabled = false))
        assertEquals(PayoutState.FINISH_SETUP, payoutState(exists = true, chargesEnabled = true, payoutsEnabled = false))
        assertEquals(PayoutState.READY, payoutState(exists = true, chargesEnabled = true, payoutsEnabled = true))
        assertEquals("Payouts ready", PayoutState.READY.label)
        assertEquals("Set up payouts", PayoutState.NOT_SET_UP.button)
    }

    @Test
    fun rentalPushesOpenTheirChat() {
        val push = ChatPush.from(mapOf("kind" to "pickup_tomorrow", "conversation_id" to "c9", "recipient_id" to "u1", "title" to "Pickup tomorrow"))
        assertNotNull(push)
        assertEquals("chat_c9", push.tag)
        assertTrue(push.shouldShow("u1", visibleChatId = null))
    }
}
