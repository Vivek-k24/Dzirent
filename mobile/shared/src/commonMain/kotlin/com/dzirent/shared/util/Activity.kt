package com.dzirent.shared.util

import com.dzirent.shared.model.Conversation
import com.dzirent.shared.model.Rental
import kotlinx.datetime.Instant
import kotlin.time.Duration.Companion.days

/** Days after a chat starts before "Did this rental happen?" is asked (chat and Activity). */
const val FOLLOW_UP_AFTER_DAYS = 3L

enum class ActivityKind { RENTED, RETURNED, CANCELLED, FOLLOW_UP }

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
            return when (kind) {
                ActivityKind.RENTED -> "$who marked $title as rented" + (dates?.let { " for $it" } ?: "")
                ActivityKind.RETURNED -> "$who marked $title as returned"
                ActivityKind.CANCELLED -> "$who said the deal for $title didn't happen"
                ActivityKind.FOLLOW_UP -> "Did you rent $title with $otherName? Answer in the chat."
            }
        }
}

private fun parse(iso: String?): Instant? = parseTimestamp(iso)

/** True if [later] is after [earlier]; anything is after a missing time. */
private fun isAfter(later: Instant, earlier: String?): Boolean =
    parse(earlier)?.let { later > it } ?: true

/**
 * Inbox > Activity: rental status changes in my conversations and pending follow-up
 * questions, newest first. Items count as new when someone else caused them after
 * [seenAt] (when I last opened Activity; null = never).
 */
fun buildActivity(
    me: String,
    conversations: List<Conversation>,
    rentals: List<Rental>,
    answeredConversationIds: Set<String>,
    seenAt: String?,
    now: Instant = nowInstant()
): List<ActivityItem> {
    val rentalItems = rentals.mapNotNull { rental ->
        val kind = when (rental.status) {
            "active" -> ActivityKind.RENTED
            "returned" -> ActivityKind.RETURNED
            "cancelled" -> ActivityKind.CANCELLED
            else -> return@mapNotNull null
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
    }

    val withRental = rentals.map { it.conversationId }.toSet()
    val followUps = conversations.mapNotNull { conv ->
        if (conv.id in withRental || conv.id in answeredConversationIds) return@mapNotNull null
        val askAt = parse(conv.createdAt)?.plus(FOLLOW_UP_AFTER_DAYS.days) ?: return@mapNotNull null
        if (askAt > now) return@mapNotNull null
        ActivityItem(
            kind = ActivityKind.FOLLOW_UP,
            conversationId = conv.id,
            listingTitle = conv.listing?.title ?: "a listing",
            otherName = conv.otherUser(me)?.displayName?.ifBlank { null } ?: "Dzirent member",
            byMe = false,
            dates = null,
            time = askAt,
            isNew = isAfter(askAt, seenAt)
        )
    }

    return (rentalItems + followUps).sortedByDescending { it.time }
}

/** True if the latest message is from the other person and arrived after I last read the chat. */
fun hasUnread(conversation: Conversation, me: String, lastReadAt: String?): Boolean {
    val last = conversation.lastMessage ?: return false
    if (last.senderId == me) return false
    val sent = parse(last.createdAt) ?: return false
    return isAfter(sent, lastReadAt)
}
