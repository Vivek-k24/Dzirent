package com.dzirent.shared.util

import kotlinx.datetime.LocalDate

/**
 * C3 rental rules shared by the chat card, My rentals and the request dialog. The database is the
 * authority (request_rental, respond_rental, cancel_rental, mark_picked_up, mark_returned,
 * complete_rental); these only decide what to offer. The website has the same rules in
 * apps/web/src/lib/rentals.ts.
 */
object RentalStatus {
    const val REQUESTED = "requested"
    const val ACCEPTED = "accepted"
    const val DECLINED = "declined"
    const val EXPIRED = "expired"
    const val AWAITING_PAYMENT = "awaiting_payment"
    const val PAID = "paid"
    const val PICKED_UP = "picked_up"
    const val RETURNED = "returned"
    const val COMPLETED = "completed"
    const val CANCELLED = "cancelled"
    const val CLAIMED = "claimed"
    const val DISPUTED = "disputed"

    /** A chat can't get a new request while one of these is open. */
    val OPEN = setOf(REQUESTED, ACCEPTED, AWAITING_PAYMENT, PAID, PICKED_UP, RETURNED, CLAIMED, DISPUTED)

    /** These hold the piece's dates (shown as booked) and block deleting the account. */
    val BOOKED = setOf(ACCEPTED, AWAITING_PAYMENT, PAID, PICKED_UP)
    val IN_PROGRESS = setOf(ACCEPTED, AWAITING_PAYMENT, PAID, PICKED_UP, RETURNED, CLAIMED, DISPUTED)
}

/** What a person can do with a rental right now. [PAY]'s button shows the amount ([payLabel]). */
enum class RentalAction(val label: String) {
    ACCEPT("Accept"),
    DECLINE("Decline"),
    CANCEL("Cancel rental"),
    ADD_PICKUP_PHOTOS("Add pickup photos"),
    MARK_PICKED_UP("Mark picked up"),
    ADD_RETURN_PHOTOS("Add return photos"),
    MARK_RETURNED("Mark returned"),
    COMPLETE("Complete rental"),
    // C5: payments (only while payments_enabled is on, except what an existing hold or claim needs).
    PAY("Pay"),
    PLACE_HOLD("Place deposit hold and mark picked up"),
    FILE_CLAIM("File a claim"),
    ACCEPT_CLAIM("Accept the claim"),
    DISPUTE_CLAIM("Dispute the claim"),
    RECEIPT("Receipt")
}

/** The lender adds at least this many photos at pickup and at return. */
const val MIN_CONDITION_PHOTOS = 2

/** C5: payment states (rentals.payment_status, deposit_status, rental_claims.status). */
object PaymentStatus {
    const val NONE = "none"
    const val PAID = "paid"
    const val PARTIALLY_REFUNDED = "partially_refunded"
    const val REFUNDED = "refunded"
    val WAS_PAID = setOf(PAID, PARTIALLY_REFUNDED, REFUNDED)
}

object DepositStatus {
    const val NONE = "none"
    const val PENDING = "pending"
    const val HELD = "held"
    const val RELEASED = "released"
    const val CAPTURED = "captured"
    const val FAILED = "failed"
}

/**
 * C5: the payment side of a rental, as the actions need it. [paymentsOn] is the rental's
 * payments_enabled; [claimWindowOpen] is "returned, and claim_window_ends_at is still ahead".
 */
data class PaymentFacts(
    val paymentsOn: Boolean = false,
    val paymentStatus: String = PaymentStatus.NONE,
    val depositAmount: Double? = null,
    val depositStatus: String = DepositStatus.NONE,
    val claimWindowOpen: Boolean = false,
    val claimStatus: String? = null
) {
    val hasDeposit: Boolean get() = (depositAmount ?: 0.0) > 0.0
    val holdInPlace: Boolean get() = depositStatus == DepositStatus.HELD || depositStatus == DepositStatus.PENDING
}

/**
 * The actions for [status], for the lender ([iAmLender]) or the renter. Requests: the lender
 * accepts or declines, the renter can withdraw (cancel). Before pickup either can cancel. Pickup
 * and return are marked by the lender; both may add photos at those steps.
 * C5, with payments ([pay]): the renter pays an accepted rental; a paid rental with a deposit is
 * picked up by placing the hold; during the claim window the lender may file a claim; the renter
 * accepts or disputes an open claim; a paid rental that ended has a receipt.
 */
fun rentalActions(status: String, iAmLender: Boolean, pay: PaymentFacts = PaymentFacts()): List<RentalAction> = when (status) {
    RentalStatus.REQUESTED ->
        if (iAmLender) listOf(RentalAction.ACCEPT, RentalAction.DECLINE) else listOf(RentalAction.CANCEL)
    RentalStatus.ACCEPTED -> buildList {
        add(RentalAction.ADD_PICKUP_PHOTOS)
        if (iAmLender) add(RentalAction.MARK_PICKED_UP)
        add(RentalAction.CANCEL)
    }
    RentalStatus.PAID -> buildList {
        add(RentalAction.ADD_PICKUP_PHOTOS)
        if (iAmLender) {
            add(if (pay.paymentsOn && pay.hasDeposit && pay.depositStatus != DepositStatus.HELD) RentalAction.PLACE_HOLD else RentalAction.MARK_PICKED_UP)
        }
        add(RentalAction.CANCEL)
    }
    RentalStatus.AWAITING_PAYMENT ->
        if (!iAmLender && pay.paymentsOn) listOf(RentalAction.PAY, RentalAction.CANCEL) else listOf(RentalAction.CANCEL)
    RentalStatus.PICKED_UP -> buildList {
        add(RentalAction.ADD_RETURN_PHOTOS)
        if (iAmLender) add(RentalAction.MARK_RETURNED)
    }
    RentalStatus.RETURNED -> buildList {
        add(RentalAction.ADD_RETURN_PHOTOS)
        if (iAmLender) {
            if (pay.claimWindowOpen && pay.hasDeposit && pay.holdInPlace && pay.claimStatus == null) add(RentalAction.FILE_CLAIM)
            add(RentalAction.COMPLETE)
        }
    }
    RentalStatus.CLAIMED ->
        if (!iAmLender && pay.claimStatus == "open") listOf(RentalAction.ACCEPT_CLAIM, RentalAction.DISPUTE_CLAIM) else emptyList()
    RentalStatus.COMPLETED, RentalStatus.CANCELLED ->
        if (pay.paymentStatus in PaymentStatus.WAS_PAID) listOf(RentalAction.RECEIPT) else emptyList()
    else -> emptyList()
}

/** "Pay $220" (cents only when there are any). */
fun payLabel(total: Double?): String = if (total == null) "Pay" else "Pay ${formatMoney(total)}"

/** "$220" or "$220.50", as the website and apps show prices. */
fun formatMoney(amount: Double): String {
    val cents = kotlin.math.round(amount * 100).toLong()
    val whole = cents / 100
    val rest = (cents % 100).toInt()
    val grouped = whole.toString().reversed().chunked(3).joinToString(",").reversed()
    return if (rest == 0) "$$grouped" else "$$grouped.${rest.toString().padStart(2, '0')}"
}

/** "$220.00": receipts and amounts that must show cents. */
fun formatMoneyCents(amount: Double): String {
    val cents = kotlin.math.round(amount * 100).toLong()
    val grouped = (cents / 100).toString().reversed().chunked(3).joinToString(",").reversed()
    return "$$grouped.${(cents % 100).toString().padStart(2, '0')}"
}

/** The deposit in plain words, or null when the rental has none. */
fun depositLine(amount: Double?, status: String, captured: Double?): String? {
    if (amount == null || amount <= 0.0) return null
    val money = formatMoney(amount)
    return when (status) {
        DepositStatus.HELD -> "Deposit $money: held on the renter's card, not charged"
        DepositStatus.PENDING -> "Deposit $money: the hold is being placed"
        DepositStatus.RELEASED -> "Deposit $money: released, nothing charged"
        DepositStatus.CAPTURED -> "Deposit $money: ${formatMoney(captured ?: amount)} charged for the claim"
        DepositStatus.FAILED -> "Deposit $money: the hold didn't go through"
        else -> "Deposit $money: held on the renter's card at pickup"
    }
}

/** A claim's state in plain words, from the viewer's side. */
fun claimLine(status: String?, amount: Double?, decided: Double?, iAmLender: Boolean): String? {
    if (status == null || amount == null) return null
    val money = formatMoney(amount)
    return when (status) {
        "open" -> if (iAmLender) "Claim for $money: waiting for the renter" else "Claim for $money: accept or dispute it"
        "accepted" -> "Claim for $money: accepted by the renter"
        "disputed" -> "Claim for $money: disputed. Dzirent will decide."
        "decided" -> if ((decided ?: 0.0) > 0.0) "Claim decided: ${formatMoney(decided!!)} from the deposit" else "Claim decided: no charge, the hold is released"
        else -> null
    }
}

/**
 * Why a claim of [amountText] dollars can't be filed against a [deposit], or null: above $0, at
 * most the deposit, at most 2 decimals (file_claim's DZ-E4041).
 */
fun claimAmountProblem(amountText: String, deposit: Double?): String? {
    val text = amountText.trim().removePrefix("$").replace(",", "")
    if (!Regex("^\\d+(\\.\\d{1,2})?$").matches(text)) return "DZ-E4041"
    val amount = text.toDoubleOrNull() ?: return "DZ-E4041"
    return if (amount <= 0.0 || deposit == null || amount > deposit + 1e-9) "DZ-E4041" else null
}

/** The claim's reason: 3 to 500 characters (DZ-E4042). */
fun claimReasonProblem(reason: String): String? = if (reason.trim().length !in 3..500) "DZ-E4042" else null

/** The evidence: 1 to 10 of the rental's return photos (DZ-E4043). */
fun claimPhotosProblem(chosen: Int): String? = if (chosen !in 1..10) "DZ-E4043" else null

/**
 * The listing editor's optional deposit in dollars (empty = none), or a problem: above $0, at most
 * $99,999.99, at most 2 decimals (DZ-E4051, the listings check). Returns null for "no deposit".
 */
fun parseDepositAmount(text: String): Result<Double?> {
    val t = text.trim().removePrefix("$").replace(",", "")
    if (t.isEmpty()) return Result.success(null)
    val ok = Regex("^\\d+(\\.\\d{1,2})?$").matches(t)
    val value = t.toDoubleOrNull()
    return if (!ok || value == null || value <= 0.0 || value > 99999.99) Result.failure(IllegalArgumentException("DZ-E4051"))
    else Result.success(value)
}

/** C5: a lender's payouts, as My studio shows them. */
enum class PayoutState(val label: String, val button: String) {
    NOT_SET_UP("Not set up", "Set up payouts"),
    FINISH_SETUP("Finish setup", "Finish setup"),
    READY("Payouts ready", "Update payout details")
}

/**
 * Ready when the processor lets the account take charges and pay out; started but not finished
 * when an account exists without both; otherwise not set up.
 */
fun payoutState(exists: Boolean, chargesEnabled: Boolean, payoutsEnabled: Boolean): PayoutState = when {
    !exists -> PayoutState.NOT_SET_UP
    chargesEnabled && payoutsEnabled -> PayoutState.READY
    else -> PayoutState.FINISH_SETUP
}

/** One receipt line: what, and the amount as shown ("$220.00", or "-$20.00" for money back). */
data class ReceiptLine(val label: String, val amount: String)

/**
 * C5: a receipt for a paid rental that ended. The renter sees what they paid and got back; the
 * lender what they receive (the fee and refunds come off in proportion, a captured deposit adds).
 */
fun rentalReceipt(
    iAmLender: Boolean,
    pricePerDay: Double?,
    days: Int?,
    total: Double?,
    tax: Double?,
    fee: Double?,
    refund: Double?,
    depositAmount: Double?,
    depositStatus: String,
    depositCaptured: Double?
): List<ReceiptLine> {
    val rental = total ?: 0.0
    val taxes = tax ?: 0.0
    val back = refund ?: 0.0
    val captured = if (depositStatus == DepositStatus.CAPTURED) depositCaptured ?: 0.0 else 0.0
    val lines = mutableListOf<ReceiptLine>()
    lines += ReceiptLine(
        if (pricePerDay != null && days != null) "${formatMoneyCents(pricePerDay)} × ${if (days == 1) "1 day" else "$days days"}" else "Rental",
        formatMoneyCents(rental)
    )
    if (iAmLender) {
        val feeShare = if (rental > 0.0 && (fee ?: 0.0) > 0.0) (fee!!) * (rental - back) / rental else 0.0
        if ((fee ?: 0.0) > 0.0) lines += ReceiptLine("Dzirent fee", "-" + formatMoneyCents(feeShare))
        if (back > 0.0) lines += ReceiptLine("Refunded to the renter", "-" + formatMoneyCents(back))
        if (captured > 0.0) lines += ReceiptLine("From the deposit", formatMoneyCents(captured))
        lines += ReceiptLine("You receive", formatMoneyCents(rental - back - feeShare + captured))
    } else {
        if (taxes > 0.0) lines += ReceiptLine("Sales tax", formatMoneyCents(taxes))
        lines += ReceiptLine("Paid", formatMoneyCents(rental + taxes))
        if (back > 0.0) lines += ReceiptLine("Refunded", "-" + formatMoneyCents(back))
        if (captured > 0.0) lines += ReceiptLine("Charged from the deposit", formatMoneyCents(captured))
        lines += ReceiptLine("Total", formatMoneyCents(rental + taxes - back + captured))
    }
    if ((depositAmount ?: 0.0) > 0.0 && depositStatus == DepositStatus.RELEASED) {
        lines += ReceiptLine("Deposit hold ${formatMoneyCents(depositAmount!!)}", "released")
    }
    return lines
}

/** The photo stage open for uploads in [status], or null ("pickup" or "return", like the bucket path). */
fun conditionPhotoStage(status: String): String? = when (status) {
    RentalStatus.ACCEPTED, RentalStatus.PAID -> "pickup"
    RentalStatus.PICKED_UP, RentalStatus.RETURNED -> "return"
    else -> null
}

/** "48 hours", "1 hour". */
fun hoursText(hours: Int): String = if (hours == 1) "1 hour" else "$hours hours"

/**
 * The state in plain words, from the viewer's side. [requestHours] is the server's
 * rental_request_hours (rental_settings()); without it the request lines leave the number out.
 */
fun rentalStatusLabel(status: String, iAmLender: Boolean, requestHours: Int? = null): String = when (status) {
    RentalStatus.REQUESTED ->
        if (iAmLender) requestHours?.let { "Rental request: answer within ${hoursText(it)}" } ?: "Rental request: answer it before it expires"
        else "Requested: waiting for the lender"
    RentalStatus.ACCEPTED -> "Accepted: arrange the pickup"
    RentalStatus.DECLINED -> "Declined"
    RentalStatus.EXPIRED -> requestHours?.let { "Expired: no answer in ${hoursText(it)}" } ?: "Expired: no answer in time"
    RentalStatus.AWAITING_PAYMENT -> if (iAmLender) "Accepted: waiting for the renter's payment" else "Accepted: pay to confirm"
    RentalStatus.PAID -> "Paid: arrange the pickup"
    RentalStatus.PICKED_UP -> "Picked up: return by the last day"
    RentalStatus.RETURNED -> "Returned"
    RentalStatus.COMPLETED -> "Completed"
    RentalStatus.CANCELLED -> "Cancelled"
    RentalStatus.CLAIMED -> if (iAmLender) "Claim filed: waiting for the renter" else "Claim filed: accept or dispute it"
    RentalStatus.DISPUTED -> "In dispute: Dzirent will decide"
    else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

/** One timeline line: "Accepted by you", "Requested by Jordan", "Expired (Dzirent)". */
fun rentalEventLabel(to: String, by: String, otherName: String): String {
    val step = when (to) {
        RentalStatus.REQUESTED -> "Requested"
        RentalStatus.ACCEPTED -> "Accepted"
        RentalStatus.DECLINED -> "Declined"
        RentalStatus.EXPIRED -> "Expired"
        RentalStatus.AWAITING_PAYMENT -> "Accepted"
        RentalStatus.PAID -> "Paid"
        RentalStatus.PICKED_UP -> "Picked up"
        RentalStatus.RETURNED -> "Returned"
        RentalStatus.COMPLETED -> "Completed"
        RentalStatus.CANCELLED -> "Cancelled"
        RentalStatus.CLAIMED -> "Claim opened"
        RentalStatus.DISPUTED -> "Disputed"
        else -> to
    }
    return when (by) {
        "you" -> "$step by you"
        "dzirent" -> "$step (Dzirent)"
        else -> "$step by $otherName"
    }
}

/** My rentals sections, in screen order. Lenders see incoming requests first. */
enum class RentalGroup(val title: String) {
    REQUESTS_FOR_YOU("Requests for you"),
    WAITING("Waiting for an answer"),
    UPCOMING("Upcoming"),
    IN_PROGRESS("In progress"),
    PAST("Past")
}

fun rentalGroup(status: String, iAmLender: Boolean): RentalGroup = when (status) {
    RentalStatus.REQUESTED -> if (iAmLender) RentalGroup.REQUESTS_FOR_YOU else RentalGroup.WAITING
    RentalStatus.ACCEPTED, RentalStatus.AWAITING_PAYMENT, RentalStatus.PAID -> RentalGroup.UPCOMING
    RentalStatus.PICKED_UP, RentalStatus.RETURNED, RentalStatus.CLAIMED, RentalStatus.DISPUTED -> RentalGroup.IN_PROGRESS
    else -> RentalGroup.PAST
}

/**
 * Why [wanted] can't be requested, or null when it can: it must start today or later, lie inside
 * the listing's availability [windows] and miss every [booked] range. A listing with no windows
 * is open every day from today (C4 owner decision, as request_rental). Matches request_rental's
 * checks (DZ-E4006, DZ-E4008, DZ-E4009).
 */
fun rentalDatesProblem(wanted: DateRange, windows: List<DateRange>, booked: List<DateRange>, today: LocalDate): String? = when {
    wanted.start.isBefore(today) -> "DZ-E4006"
    windows.isNotEmpty() && !isAvailableFor(windows, wanted) -> "DZ-E4008"
    firstOverlap(wanted, booked) != null -> "DZ-E4009"
    else -> null
}

/** True if [day] can start or end a request: today or later, inside a window (or no windows), not booked. */
fun isRentableDay(day: LocalDate, windows: List<DateRange>, booked: List<DateRange>, today: LocalDate): Boolean =
    rentalDatesProblem(DateRange(day, day), windows, booked, today) == null
