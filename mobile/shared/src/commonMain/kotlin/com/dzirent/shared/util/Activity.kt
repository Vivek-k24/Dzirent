package com.dzirent.shared.util

import com.dzirent.shared.model.Conversation
import com.dzirent.shared.model.Rental
import kotlinx.datetime.Instant

/** C3: one Activity row per rental, worded by its latest state. */
enum class ActivityKind { REQUESTED, ACCEPTED, DECLINED, EXPIRED, PICKED_UP, RETURNED, COMPLETED, CANCELLED, OTHER }

/** One row of Inbox > Activity. Tapping it opens [conversationId]. */
data class ActivityItem(
    val kind: ActivityKind,
    val conversationId: String,
    val listingTitle: String,
    val otherName: String,
    /** True when I made the change myself (never "new"). */
    val byMe: Boolean,
    /** "Oct 26 - Oct 30" for rentals with dates. */
    val dates: String?,
    val time: Instant,
    val isNew: Boolean
) {
    val text: String
        get() {
            val title = "“$listingTitle”"
            val who = if (byMe) "You" else otherName
            val forDates = dates?.let { " for $it" } ?: ""
            return when (kind) {
                ActivityKind.REQUESTED -> "$who asked to rent $title$forDates"
                ActivityKind.ACCEPTED -> "$who accepted the rental of $title$forDates"
                ActivityKind.DECLINED -> "$who declined the request for $title"
                ActivityKind.EXPIRED -> "The request for $title expired without an answer"
                ActivityKind.PICKED_UP -> "$who marked $title as picked up"
                ActivityKind.RETURNED -> "$who marked $title as returned"
                ActivityKind.COMPLETED -> "The rental of $title is complete"
                ActivityKind.CANCELLED -> "$who cancelled the rental of $title"
                ActivityKind.OTHER -> "The rental of $title changed"
            }
        }
}

private fun parse(iso: String?): Instant? = parseTimestamp(iso)

/** True if [later] is after [earlier]; anything is after a missing time. */
private fun isAfter(later: Instant, earlier: String?): Boolean =
    parse(earlier)?.let { later > it } ?: true

/**
 * Inbox > Activity: the latest state of each rental in my chats, newest first. Items count as
 * new when someone else (or Dzirent) caused them after [seenAt] (when I last opened Activity;
 * null = never). [answeredConversationIds] (old "did it happen?" answers) is no longer used.
 */
@Suppress("UNUSED_PARAMETER")
fun buildActivity(
    me: String,
    conversations: List<Conversation>,
    rentals: List<Rental>,
    answeredConversationIds: Set<String>,
    seenAt: String?,
    now: Instant = nowInstant()
): List<ActivityItem> = rentals.mapNotNull { rental ->
    val kind = when (rental.status) {
        RentalStatus.REQUESTED -> ActivityKind.REQUESTED
        RentalStatus.ACCEPTED, RentalStatus.AWAITING_PAYMENT, RentalStatus.PAID -> ActivityKind.ACCEPTED
        RentalStatus.DECLINED -> ActivityKind.DECLINED
        RentalStatus.EXPIRED -> ActivityKind.EXPIRED
        RentalStatus.PICKED_UP -> ActivityKind.PICKED_UP
        RentalStatus.RETURNED -> ActivityKind.RETURNED
        RentalStatus.COMPLETED -> ActivityKind.COMPLETED
        RentalStatus.CANCELLED -> ActivityKind.CANCELLED
        else -> ActivityKind.OTHER
    }
    val time = parse(rental.updatedAt) ?: parse(rental.createdAt) ?: return@mapNotNull null
    val other = if (me == rental.renterId) rental.lender else rental.renter
    val byMe = rental.updatedBy == me
    ActivityItem(
        kind = kind,
        conversationId = rental.conversationId,
        listingTitle = rental.listing?.title ?: "a listing",
        otherName = other?.displayName?.ifBlank { null } ?: "Dzirent member",
        byMe = byMe,
        dates = formatDateRange(rental.startDate, rental.endDate),
        time = time,
        isNew = !byMe && isAfter(time, seenAt)
    )
}.groupBy { it.conversationId }.values.map { items -> items.maxBy { it.time } }.sortedByDescending { it.time }

/** True if the latest message is from the other person and arrived after I last read the chat. */
fun hasUnread(conversation: Conversation, me: String, lastReadAt: String?): Boolean {
    val last = conversation.lastMessage ?: return false
    if (last.senderId == me) return false
    val sent = parse(last.createdAt) ?: return false
    return isAfter(sent, lastReadAt)
}
