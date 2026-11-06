package com.dzirent.shared.util

import com.dzirent.shared.model.AccessoryTypes
import com.dzirent.shared.model.Categories
import com.dzirent.shared.model.Listing
import com.dzirent.shared.model.ListingScan
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/*
 * The server's photo check in the listing editor. After the photos step the photos are
 * uploaded to the listing (a paused draft for a new one) and the database runs the check
 * (request_scan); the result fills the details and says whether the piece can be listed.
 * The rules are here; the editor screens show them.
 */

/** A new listing's row before its details are saved: paused, with this placeholder title. */
const val DRAFT_TITLE = "New listing (draft)"

/** The draft's placeholder category (the database needs one); never treated as the lender's choice. */
const val DRAFT_CATEGORY = "Everyday"

/** A listing whose photos were uploaded for the check but whose details were never saved. */
val Listing.isDraft: Boolean get() = status == "paused" && title == DRAFT_TITLE

/** What the form fills in from an allowed photo check. [label] is the policy item it came from (for tracking). */
data class ListingSuggestions(
    val label: String,
    val title: String,
    val category: String,
    val itemType: String?,
    val description: String?,
    val styles: List<String>,
    val kind: GarmentKind?
) {
    val isJewelry: Boolean get() = itemType == AccessoryTypes.COSTUME_JEWELRY
}

/**
 * The suggestions of a finished, allowed check, or null. Only values the listing form accepts
 * come through: the database's categories, item types, garment types and styles, a 3-80
 * character title and a description up to the form's limit.
 */
fun suggestionsFrom(scan: ListingScan): ListingSuggestions? {
    if (scan.status != "done" || scan.verdict != "allowed") return null
    val s = scan.suggestions ?: return null
    fun text(key: String) = (s[key] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
    val title = text("title")?.take(80)?.trim()?.takeIf { it.length >= 3 } ?: return null
    val category = text("category")?.takeIf { it in Categories.ALL } ?: return null
    val itemType = text("item_type")?.takeIf { category == Categories.ACCESSORIES && it in AccessoryTypes.ALL }
    if (category == Categories.ACCESSORIES && itemType == null) return null
    val styles = (s["styles"] as? JsonArray).orEmpty()
        .mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        .filter { it in FashionStyles.ALL }
        .distinct()
        .take(FashionStyles.LISTING_MAX)
    return ListingSuggestions(
        label = (text("item_key") ?: title).take(80),
        title = title,
        category = category,
        itemType = itemType,
        description = text("description")?.take(DESCRIPTION_MAX),
        styles = styles,
        kind = GarmentKind.fromKey(text("garment_type"))
    )
}

/** Where the editor's photo check stands. */
enum class CheckPhase { NONE, UPLOADING, UPLOAD_FAILED, CHECKING, FINISHED, TIMED_OUT }

const val UPLOADING_PHOTOS = "Uploading your photos…"
const val CHECKING_PHOTOS = "Checking your photos…"
const val PHOTOS_LOOK_GOOD = "Your photos look good."
const val REVIEW_LINE = "Someone at Dzirent will check these photos."
const val CHECK_FAILED_LINE = "We couldn't check the photos right now."
const val REPLACE_PHOTOS = "Replace photos"

/** The line shown above the details while and after the photos are checked. */
sealed class CheckBanner {
    object Uploading : CheckBanner()
    data class UploadFailed(val message: String) : CheckBanner()
    object Checking : CheckBanner()
    object Allowed : CheckBanner()
    data class Rejected(val reason: String) : CheckBanner()
    /** Someone at Dzirent will look; [reason] says why when it's more than "not sure" (a copied photo). */
    data class Review(val reason: String?) : CheckBanner()
    /** The check itself failed or took too long: the lender can ask again. */
    object Failed : CheckBanner()
}

/** What to show for the check, or null before there is one. An admin's decision wins over the verdict. */
fun checkBanner(phase: CheckPhase, scan: ListingScan?, uploadError: String? = null): CheckBanner? = when (phase) {
    CheckPhase.NONE -> null
    CheckPhase.UPLOADING -> CheckBanner.Uploading
    CheckPhase.UPLOAD_FAILED -> CheckBanner.UploadFailed(uploadError ?: "Couldn't upload your photos. Please try again.")
    CheckPhase.CHECKING -> CheckBanner.Checking
    CheckPhase.TIMED_OUT -> CheckBanner.Failed
    CheckPhase.FINISHED -> when {
        scan == null -> null
        scan.adminDecision == "approved" -> CheckBanner.Allowed
        scan.adminDecision == "rejected" -> CheckBanner.Rejected(scan.reason ?: "These photos can't be listed.")
        scan.status == "failed" -> CheckBanner.Failed
        scan.verdict == "allowed" -> CheckBanner.Allowed
        scan.verdict == "rejected" -> CheckBanner.Rejected(scan.reason ?: "These photos can't be listed.")
        else -> CheckBanner.Review(scan.reason?.takeIf { it == COPIED_PHOTO })
    }
}

/** The database's reason when a photo matches another lender's listing. */
const val COPIED_PHOTO = "This photo matches another listing."

/** The server's warnings for one photo that the phone isn't already showing. */
fun extraWarnings(phoneMessages: List<String>, server: List<String>): List<String> =
    server.filter { it !in phoneMessages }.distinct()

/**
 * Which photos sit in which slot ("front=…|back=…"), to tell whether the photos changed since
 * they were last checked.
 */
fun photoSetKey(slots: Map<PhotoSlot, String>): String =
    slots.entries.sortedBy { it.key.ordinal }.joinToString("|") { (slot, key) -> "${slot.key}=$key" }
