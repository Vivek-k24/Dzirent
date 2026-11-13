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

/** What a person can do with a rental right now. */
enum class RentalAction(val label: String) {
    ACCEPT("Accept"),
    DECLINE("Decline"),
    CANCEL("Cancel rental"),
    ADD_PICKUP_PHOTOS("Add pickup photos"),
    MARK_PICKED_UP("Mark picked up"),
    ADD_RETURN_PHOTOS("Add return photos"),
    MARK_RETURNED("Mark returned"),
    COMPLETE("Complete rental")
}

/** The lender adds at least this many photos at pickup and at return. */
const val MIN_CONDITION_PHOTOS = 2

/**
 * The actions for [status], for the lender ([iAmLender]) or the renter. Requests: the lender
 * accepts or declines, the renter can withdraw (cancel). Before pickup either can cancel. Pickup
 * and return are marked by the lender; both may add photos at those steps.
 */
fun rentalActions(status: String, iAmLender: Boolean): List<RentalAction> = when (status) {
    RentalStatus.REQUESTED ->
        if (iAmLender) listOf(RentalAction.ACCEPT, RentalAction.DECLINE) else listOf(RentalAction.CANCEL)
    RentalStatus.ACCEPTED, RentalStatus.PAID -> buildList {
        add(RentalAction.ADD_PICKUP_PHOTOS)
        if (iAmLender) add(RentalAction.MARK_PICKED_UP)
        add(RentalAction.CANCEL)
    }
    RentalStatus.AWAITING_PAYMENT -> listOf(RentalAction.CANCEL)
    RentalStatus.PICKED_UP -> buildList {
        add(RentalAction.ADD_RETURN_PHOTOS)
        if (iAmLender) add(RentalAction.MARK_RETURNED)
    }
    RentalStatus.RETURNED -> buildList {
        add(RentalAction.ADD_RETURN_PHOTOS)
        if (iAmLender) add(RentalAction.COMPLETE)
    }
    else -> emptyList()
}

/** The photo stage open for uploads in [status], or null ("pickup" or "return", like the bucket path). */
fun conditionPhotoStage(status: String): String? = when (status) {
    RentalStatus.ACCEPTED, RentalStatus.PAID -> "pickup"
    RentalStatus.PICKED_UP, RentalStatus.RETURNED -> "return"
    else -> null
}

/** The state in plain words, from the viewer's side. */
fun rentalStatusLabel(status: String, iAmLender: Boolean): String = when (status) {
    RentalStatus.REQUESTED -> if (iAmLender) "Rental request: answer within 48 hours" else "Requested: waiting for the lender"
    RentalStatus.ACCEPTED -> "Accepted: arrange the pickup"
    RentalStatus.DECLINED -> "Declined"
    RentalStatus.EXPIRED -> "Expired: no answer in 48 hours"
    RentalStatus.AWAITING_PAYMENT -> "Accepted: waiting for payment"
    RentalStatus.PAID -> "Paid: arrange the pickup"
    RentalStatus.PICKED_UP -> "Picked up: return by the last day"
    RentalStatus.RETURNED -> "Returned"
    RentalStatus.COMPLETED -> "Completed"
    RentalStatus.CANCELLED -> "Cancelled"
    RentalStatus.CLAIMED -> "Claim opened"
    RentalStatus.DISPUTED -> "In dispute"
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
 * the listing's availability [windows] (none means it can't be rented) and miss every [booked]
 * range. Matches request_rental's checks (DZ-E4006, DZ-E4008, DZ-E4009).
 */
fun rentalDatesProblem(wanted: DateRange, windows: List<DateRange>, booked: List<DateRange>, today: LocalDate): String? = when {
    wanted.start.isBefore(today) -> "DZ-E4006"
    windows.isEmpty() || !isAvailableFor(windows, wanted) -> "DZ-E4008"
    firstOverlap(wanted, booked) != null -> "DZ-E4009"
    else -> null
}

/** True if [day] can start or end a request: today or later, inside a window, not booked. */
fun isRentableDay(day: LocalDate, windows: List<DateRange>, booked: List<DateRange>, today: LocalDate): Boolean =
    rentalDatesProblem(DateRange(day, day), windows, booked, today) == null
