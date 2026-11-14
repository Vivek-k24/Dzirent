package com.dzirent.shared.model

import com.dzirent.shared.util.BodyMeasurement
import com.dzirent.shared.util.DateRange
import com.dzirent.shared.util.FitProfile
import com.dzirent.shared.util.MeasurementInput
import com.dzirent.shared.util.formatPerDay
import com.dzirent.shared.util.parseDateRange
import com.dzirent.shared.util.validateMeasurements
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Columns that can be NULL in the database have defaults here. */
@Serializable
data class Profile(
    val id: String,
    @SerialName("display_name") val displayName: String = "",
    val role: String = "renter", // 'renter' | 'lender' | 'both'
    val city: String = "",
    @SerialName("approx_lat") val approxLat: Double? = null,
    @SerialName("approx_lng") val approxLng: Double? = null,
    @SerialName("adult_confirmed") val adultConfirmed: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("studio_name") val studioName: String? = null,
    @SerialName("studio_handle") val studioHandle: String? = null,
    @SerialName("studio_bio") val studioBio: String? = null,
    @SerialName("style_tags") val styleTags: List<String> = emptyList(),
    @SerialName("pickup_area") val pickupArea: String? = null,
    /** Set by Dzirent (admin suspension; "infinity" for a ban). Only on my own profile row. */
    @SerialName("suspended_until") val suspendedUntil: String? = null,
    @SerialName("suspension_reason") val suspensionReason: String? = null
) {
    val hasLocation: Boolean get() = approxLat != null && approxLng != null
    val studioTitle: String get() = studioName?.ifBlank { null } ?: displayName.ifBlank { "Studio" }

    /** The notice to show where I'd publish, message or report while suspended, or null. */
    val suspensionNotice: String? get() = com.dzirent.shared.util.suspensionNotice(suspendedUntil, suspensionReason)
}

/**
 * My row of public.private_profiles: data only I can read (RLS).
 */
@Serializable
data class PrivateProfile(
    @SerialName("user_id") val userId: String,
    @SerialName("chest_cm") val chestCm: Double? = null,
    @SerialName("waist_cm") val waistCm: Double? = null,
    @SerialName("hips_cm") val hipsCm: Double? = null,
    @SerialName("shoulder_cm") val shoulderCm: Double? = null,
    @SerialName("height_cm") val heightCm: Double? = null,
    @SerialName("inseam_cm") val inseamCm: Double? = null,
    @SerialName("activity_seen_at") val activitySeenAt: String? = null,
    @SerialName("fit_profile") val fitProfile: String? = null,
    @SerialName("style_interests") val styleInterests: List<String> = emptyList(),
    /** When I agreed to my measurements being saved (null: not given; the database refuses new ones). */
    @SerialName("measurements_consent_at") val measurementsConsentAt: String? = null
) {
    val fit: FitProfile? get() = FitProfile.fromDb(fitProfile)
    val hasMeasurementsConsent: Boolean get() = measurementsConsentAt != null

    fun bodyCm(measurement: BodyMeasurement): Double? = when (measurement) {
        BodyMeasurement.CHEST -> chestCm
        BodyMeasurement.WAIST -> waistCm
        BodyMeasurement.HIPS -> hipsCm
        BodyMeasurement.SHOULDER -> shoulderCm
        BodyMeasurement.HEIGHT -> heightCm
        BodyMeasurement.INSEAM -> inseamCm
    }
}

/** A row of public.us_cities from search_cities RPC. */
@Serializable
data class UsCity(
    val id: String,
    val name: String,
    val state: String,
    val lat: Double,
    val lng: Double
) {
    val label: String get() = "$name, $state"
}

/** Listing card returned by browse_listings and fit_listings RPCs. */
@Serializable
data class ListingCard(
    val id: String,
    val title: String,
    val price: Double? = null,
    val distance: Int? = null,
    val city: String = "",
    val category: String = "",
    @SerialName("cover_photo_path") val coverPhotoPath: String? = null,
    @SerialName("studio_name") val studioName: String? = null,
    @SerialName("studio_handle") val studioHandle: String? = null
)

@Serializable
data class ListingPhotoDetail(
    @SerialName("storage_path") val storagePath: String,
    val position: Int = 0,
    val slot: String? = null
)

@Serializable
data class ListingMeasurementDetail(
    val label: String,
    val value: Double,
    val unit: String
)

@Serializable
data class AvailabilityRange(
    @SerialName("start_date") val startDate: String,
    @SerialName("end_date") val endDate: String
)

/** Full listing page returned by get_listing RPC. */
@Serializable
data class ListingDetail(
    val id: String,
    val title: String,
    val category: String,
    @SerialName("item_type") val itemType: String? = null,
    @SerialName("garment_type") val garmentType: String? = null,
    @SerialName("size_label") val sizeLabel: String = "",
    val description: String = "",
    val price: Double? = null,
    @SerialName("price_note") val priceNote: String = "",
    @SerialName("deposit_note") val depositNote: String? = null,
    @SerialName("retail_value") val retailValue: Double? = null,
    @SerialName("listing_styles") val listingStyles: List<String> = emptyList(),
    val city: String = "",
    val distance: Int? = null,
    @SerialName("studio_name") val studioName: String? = null,
    @SerialName("studio_handle") val studioHandle: String? = null,
    val photos: List<ListingPhotoDetail> = emptyList(),
    val measurements: List<ListingMeasurementDetail> = emptyList(),
    val availability: List<AvailabilityRange> = emptyList(),
    @SerialName("created_at") val createdAt: String? = null,
    /** Booked days (C3): accepted, paid or picked-up rentals, never who booked them. */
    val booked: List<AvailabilityRange> = emptyList()
)

/** Studio details returned by get_studio RPC. */
@Serializable
data class StudioDetail(
    @SerialName("studio_name") val studioName: String,
    @SerialName("studio_handle") val studioHandle: String,
    @SerialName("studio_bio") val studioBio: String? = null,
    @SerialName("style_tags") val styleTags: List<String> = emptyList(),
    val city: String = "",
    @SerialName("pickup_area") val pickupArea: String? = null,
    @SerialName("rental_count") val rentalCount: Int = 0,
    @SerialName("reply_minutes") val replyMinutes: Int? = null,
    @SerialName("is_saved") val isSaved: Boolean = false,
    val listings: List<ListingCard> = emptyList(),
    @SerialName("is_own") val isOwn: Boolean = false,
    val since: String? = null
)

/** Item returned by my_blocked_users RPC. */
@Serializable
data class BlockedUserItem(
    @SerialName("blocked_id") val blockedId: String,
    @SerialName("display_name") val displayName: String,
    @SerialName("studio_name") val studioName: String? = null,
    @SerialName("studio_handle") val studioHandle: String? = null,
    val city: String? = null
)

/** Item returned by my_saved_listings RPC. */
@Serializable
data class SavedListingItem(
    @SerialName("listing_id") val listingId: String,
    @SerialName("is_available") val isAvailable: Boolean = true,
    val title: String? = null,
    val price: Double? = null,
    val distance: Int? = null,
    val city: String? = null,
    val category: String? = null,
    @SerialName("cover_photo_path") val coverPhotoPath: String? = null,
    @SerialName("studio_name") val studioName: String? = null,
    @SerialName("studio_handle") val studioHandle: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

/** Saved studio card returned by my_saved_studios RPC. */
@Serializable
data class SavedStudioCard(
    @SerialName("studio_name") val studioName: String,
    @SerialName("studio_handle") val studioHandle: String,
    val city: String = "",
    @SerialName("cover_photo_path") val coverPhotoPath: String? = null,
    @SerialName("piece_count") val pieceCount: Int = 0,
    val distance: Int? = null
)

/** Conversation item returned by my_conversations RPC. */
@Serializable
data class ConversationCard(
    val id: String,
    @SerialName("listing_id") val listingId: String,
    @SerialName("listing_title") val listingTitle: String = "",
    @SerialName("cover_photo_path") val coverPhotoPath: String? = null,
    val price: Double? = null,
    @SerialName("other_name") val otherName: String = "",
    @SerialName("other_handle") val otherHandle: String? = null,
    @SerialName("last_message") val lastMessage: String? = null,
    @SerialName("last_message_at") val lastMessageAt: String? = null,
    val unread: Boolean = false,
    @SerialName("requested_start") val requestedStart: String? = null,
    @SerialName("requested_end") val requestedEnd: String? = null
) {
    val requestedDates: DateRange? get() = parseDateRange(requestedStart, requestedEnd)
}

/** Owner row of public.listings. */
@Serializable
data class Listing(
    val id: String,
    @SerialName("lender_id") val lenderId: String,
    val title: String,
    val category: String,
    @SerialName("item_type") val itemType: String? = null,
    @SerialName("size_label") val sizeLabel: String = "",
    val description: String = "",
    @SerialName("price_usd") val priceUsd: Double? = null,
    @SerialName("price_note") val priceNote: String = "",
    val city: String = "",
    @SerialName("approx_lat") val approxLat: Double,
    @SerialName("approx_lng") val approxLng: Double,
    val status: String = "active", // 'active' | 'paused'
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("retail_value") val retailValue: Double? = null,
    @SerialName("deposit_note") val depositNote: String? = null,
    /** C4/C5: the refundable deposit held at pickup while payments are on (null = none). */
    @SerialName("deposit_amount") val depositAmount: Double? = null,
    @SerialName("listing_styles") val listingStyles: List<String> = emptyList(),
    @SerialName("garment_type") val garmentType: String? = null,
    @SerialName("ai_review_needed") val aiReviewNeeded: Boolean = false,
    /** Why the server paused the listing after a photo check (null otherwise). Server-written only. */
    @SerialName("auto_paused_reason") val autoPausedReason: String? = null,
    val photos: List<ListingPhoto> = emptyList(),
    val measurements: List<ListingMeasurement> = emptyList(),
    val availability: List<Availability> = emptyList(),
    val lender: Profile? = null,
    val distanceKm: Double? = null,
    /** Whole miles from the shop window (it never returns coordinates). */
    val distanceMiles: Int? = null
) {
    /** "Sunglasses" for accessories with a type, otherwise the category. For compact rows. */
    val typeLabel: String get() = itemType ?: category

    /** "$25" when priced, otherwise the old free-text note. */
    /** "$25/day" (C1: prices are per day), or the note for listings from before prices were required. */
    val priceLabel: String get() = priceUsd?.let { formatPerDay(it) } ?: priceNote
}

@Serializable
data class ListingPhoto(
    val id: String,
    @SerialName("listing_id") val listingId: String,
    @SerialName("storage_path") val storagePath: String,
    val position: Int,
    val slot: String? = null
)

/**
 * Owner row of public.listing_scans: one photo check. [status] is queued, running, done or
 * failed; [verdict] (allowed, rejected, review) is set once it's done or failed.
 */
@Serializable
data class ListingScan(
    val id: String,
    @SerialName("listing_id") val listingId: String,
    val status: String,
    val verdict: String? = null,
    val reason: String? = null,
    val suggestions: JsonObject? = null,
    @SerialName("photo_set_hash") val photoSetHash: String? = null,
    @SerialName("admin_decision") val adminDecision: String? = null,
    /** Why an admin approved or rejected the photos (P2B). */
    @SerialName("admin_reason") val adminReason: String? = null,
    @SerialName("created_at") val createdAt: String? = null
) {
    val finished: Boolean get() = status == "done" || status == "failed"
}

/** The server's warnings for one photo of a scan (public.photo_scans, owner read). */
@Serializable
data class PhotoScanRow(
    @SerialName("photo_id") val photoId: String,
    val warnings: List<String> = emptyList(),
    val decision: String? = null
)

@Serializable
data class ListingMeasurement(
    val id: String? = null,
    @SerialName("listing_id") val listingId: String,
    val label: String,
    val value: Double,
    val unit: String // 'cm' | 'in'
)

@Serializable
data class Availability(
    val id: String? = null,
    @SerialName("listing_id") val listingId: String,
    @SerialName("start_date") val startDate: String,
    @SerialName("end_date") val endDate: String
)

@Serializable
data class Conversation(
    val id: String,
    @SerialName("listing_id") val listingId: String,
    @SerialName("renter_id") val renterId: String,
    @SerialName("lender_id") val lenderId: String,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("requested_start") val requestedStart: String? = null,
    @SerialName("requested_end") val requestedEnd: String? = null,
    // Filled in by the repository (listing and the other person from my_conversations, the
    // latest message embedded), never written.
    val listing: Listing? = null,
    val renter: Profile? = null,
    val lender: Profile? = null,
    val messages: List<Message> = emptyList()
) {
    val requestedDates: DateRange? get() = parseDateRange(requestedStart, requestedEnd)
    fun otherUserId(me: String): String = if (me == renterId) lenderId else renterId
    fun otherUser(me: String): Profile? = if (me == renterId) lender else renter
    val lastMessage: Message? get() = messages.firstOrNull()
}

@Serializable
data class Message(
    val id: String = "",
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String,
    val body: String,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class Rental(
    val id: String? = null,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("listing_id") val listingId: String,
    @SerialName("renter_id") val renterId: String,
    @SerialName("lender_id") val lenderId: String,
    /** C3 states (util/Rentals.kt RentalStatus); written only by the rental functions. */
    val status: String = "requested",
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    @SerialName("updated_by") val updatedBy: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    // Filled in by the repository from my_conversations, never written.
    val listing: Listing? = null,
    val lender: Profile? = null,
    val renter: Profile? = null
)

/** One step of a rental's timeline (get_rental): [by] is "you", "other" or "dzirent". */
@Serializable
data class RentalEvent(
    val from: String? = null,
    val to: String,
    val by: String,
    @SerialName("by_role") val byRole: String? = null,
    val note: String? = null,
    val at: String? = null
)

/** A condition photo (private bucket rental-photos); [stage] is "pickup" or "return". */
@Serializable
data class RentalPhoto(
    @SerialName("storage_path") val storagePath: String,
    val stage: String,
    val by: String,
    @SerialName("by_role") val byRole: String? = null,
    @SerialName("uploaded_at") val uploadedAt: String? = null
)

/**
 * A rental as get_rental and my_rentals return it (C3): the other person only by name and handle,
 * the price agreed at request time, and (get_rental only) the timeline and condition photos.
 */
@Serializable
data class RentalView(
    val id: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("listing_id") val listingId: String,
    @SerialName("listing_title") val listingTitle: String? = null,
    @SerialName("cover_photo_path") val coverPhotoPath: String? = null,
    @SerialName("your_role") val yourRole: String,
    @SerialName("other_name") val otherName: String? = null,
    @SerialName("other_handle") val otherHandle: String? = null,
    val status: String,
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    @SerialName("price_per_day") val pricePerDay: Double? = null,
    val days: Int? = null,
    val total: Double? = null,
    val currency: String = "USD",
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("payments_enabled") val paymentsEnabled: Boolean = false,
    val events: List<RentalEvent> = emptyList(),
    val photos: List<RentalPhoto> = emptyList(),
    // C4/C5: the payment side (shown by the C5 screens).
    @SerialName("deposit_amount") val depositAmount: Double? = null,
    @SerialName("payment_status") val paymentStatus: String = "none",
    @SerialName("deposit_status") val depositStatus: String = "none",
    @SerialName("refund_amount") val refundAmount: Double? = null,
    @SerialName("claim_window_ends_at") val claimWindowEndsAt: String? = null,
    @SerialName("fee_amount") val feeAmount: Double? = null,
    @SerialName("tax_amount") val taxAmount: Double? = null,
    @SerialName("deposit_captured_amount") val depositCapturedAmount: Double? = null,
    @SerialName("deposit_capture_before") val depositCaptureBefore: String? = null,
    @SerialName("payment_due_at") val paymentDueAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("cancelled_at") val cancelledAt: String? = null,
    @SerialName("lender_can_take_payment") val lenderCanTakePayment: Boolean = false,
    val claim: RentalClaimView? = null
) {
    val iAmLender: Boolean get() = yourRole == "lender"
    val dates: DateRange? get() = parseDateRange(startDate, endDate)
}

/** C4/C5: the lender's claim against the deposit, as get_rental returns it (both people see it). */
@Serializable
data class RentalClaimView(
    val id: String,
    val status: String,
    val amount: Double,
    val reason: String? = null,
    @SerialName("evidence_paths") val evidencePaths: List<String> = emptyList(),
    @SerialName("renter_note") val renterNote: String? = null,
    @SerialName("decision_amount") val decisionAmount: Double? = null,
    val decision: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("decided_at") val decidedAt: String? = null
)

/** C5: the rental and payment rules the screens show (rental_settings(); readable by everyone). */
@Serializable
data class RentalSettings(
    @SerialName("payments_enabled") val paymentsEnabled: Boolean = false,
    @SerialName("rental_request_hours") val rentalRequestHours: Int? = null,
    @SerialName("payment_deadline_hours") val paymentDeadlineHours: Int? = null,
    @SerialName("claim_window_hours") val claimWindowHours: Int? = null,
    @SerialName("cancellation_refund_cutoff_hours") val cancellationRefundCutoffHours: Int? = null,
    @SerialName("late_cancellation_refund_percent") val lateCancellationRefundPercent: Double? = null,
    @SerialName("platform_fee_percent") val platformFeePercent: Double? = null
)

/** C5: the lender's own payout account (payout_accounts, owner read; bank details stay at Stripe). */
@Serializable
data class PayoutAccount(
    @SerialName("charges_enabled") val chargesEnabled: Boolean = false,
    @SerialName("payouts_enabled") val payoutsEnabled: Boolean = false,
    @SerialName("details_submitted") val detailsSubmitted: Boolean = false
)

/** C5: what stripe-pay returns for Stripe's payment sheet. Never stored. */
data class PaymentStart(val clientSecret: String, val publishableKey: String, val amount: Double?)

@Serializable
data class ConversationRead(
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("last_read_at") val lastReadAt: String? = null
)

@Serializable
data class RentalOutcome(
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("user_id") val userId: String,
    val happened: Boolean,
    @SerialName("answered_at") val answeredAt: String? = null
)

@Serializable
data class Block(
    @SerialName("blocker_id") val blockerId: String,
    @SerialName("blocked_id") val blockedId: String,
    // Never filled on this backend: other people's profiles are owner-only.
    val blocked: Profile? = null
)

/** My notification choices (notification_settings). No row yet means these defaults. */
@Serializable
data class NotificationSettings(
    val messages: Boolean = true,
    @SerialName("show_message_text") val showMessageText: Boolean = false,
    /** Pickup, return and overdue reminders (C3), on by default. */
    @SerialName("rental_reminders") val rentalReminders: Boolean = true,
    /** C5: "Email me about rentals" (to the account's email), on by default. */
    @SerialName("email_rentals") val emailRentals: Boolean = true
)

@Serializable
data class Report(
    val id: String? = null,
    @SerialName("reporter_id") val reporterId: String,
    @SerialName("target_type") val targetType: String, // 'listing' | 'user' | 'message' | 'rental' (C3)
    @SerialName("target_id") val targetId: String,
    val reason: String,
    val details: String? = null
)

@Serializable
data class SavedListing(
    @SerialName("user_id") val userId: String,
    @SerialName("listing_id") val listingId: String,
    @SerialName("created_at") val createdAt: String? = null,
    // Filled in from the shop window, never written.
    val listing: Listing? = null
)

/** One of my saved studios; [lenderId] holds the studio handle (account ids are never shown). */
@Serializable
data class SavedStudio(
    @SerialName("user_id") val userId: String,
    @SerialName("lender_id") val lenderId: String,
    @SerialName("created_at") val createdAt: String? = null,
    // Filled in from the shop window, never written.
    val lender: Profile? = null
)

/** Everything the studio page shows about one lender. */
data class StudioPage(
    val lender: Profile,
    /** Active listings, newest first. */
    val pieces: List<Listing>,
    /** Rentals marked active or returned. */
    val rentedCount: Int,
    /** Median first-reply time, or null with too few chats. */
    val replyMinutes: Int?,
    val isSaved: Boolean,
    val isOwn: Boolean = false,
    val since: String? = null
)

@Serializable
data class SuggestionEvent(
    val field: String,
    val label: String,
    val action: String,
    @SerialName("listing_id") val listingId: String? = null
)

object Roles {
    const val RENTER = "renter"
    const val LENDER = "lender"
    const val BOTH = "both"

    fun canLend(role: String) = role == LENDER || role == BOTH
}

object Categories {
    const val ACCESSORIES = "Accessories"

    val ALL = listOf(
        "Career & Professional",
        "Occasion & Party",
        "Cultural & Traditional",
        "Everyday",
        "Outerwear",
        ACCESSORIES
    )

    // "(flat)" = measured across the garment laid flat; the fit rule doubles these.
    private val SUGGESTIONS = mapOf(
        "Career & Professional" to listOf("Shoulder", "Chest (flat)", "Sleeve", "Length", "Waist (flat)"),
        "Occasion & Party" to listOf("Bust (flat)", "Waist (flat)", "Hips (flat)", "Total Length", "Shoulder"),
        "Cultural & Traditional" to listOf("Chest/Bust (flat)", "Waist (flat)", "Kurta/Top Length", "Bottom Length", "Shoulder"),
        "Everyday" to listOf("Chest (flat)", "Length", "Waist (flat)", "Inseam"),
        "Outerwear" to listOf("Chest (flat)", "Shoulder", "Sleeve Length", "Total Length")
    )

    /** Quick-add measurement labels; accessories get them per item type (none until one is picked). */
    fun measurementSuggestions(category: String, itemType: String?): List<String> =
        if (category == ACCESSORIES) AccessoryTypes.SUGGESTIONS[itemType].orEmpty()
        else SUGGESTIONS[category].orEmpty()
}

/** Item types allowed in Accessories; the same list is in the listings_item_type_check constraint. */
object AccessoryTypes {
    /** Jewelry that isn't real gold, silver, platinum, diamonds, pearls or gemstones (008). */
    const val COSTUME_JEWELRY = "Costume jewelry"

    val ALL = listOf("Sunglasses", "Handbag", "Tie", "Watch (non-smart)", "Belt buckle", COSTUME_JEWELRY)

    val SUGGESTIONS = mapOf(
        "Sunglasses" to listOf("Lens width", "Bridge", "Temple length"),
        "Handbag" to listOf("Width", "Height", "Depth", "Strap drop"),
        "Tie" to listOf("Length", "Width"),
        "Watch (non-smart)" to listOf("Case diameter", "Band length"),
        "Belt buckle" to listOf("Width", "Height"),
        COSTUME_JEWELRY to listOf("Length", "Width")
    )
}

object ReportReasons {
    val ALL = listOf("Inappropriate photo", "Prohibited item", "Scam or fraud", "Harassment", "Other")
    const val DETAILS_MAX = 500
}

object ListingEvents {
    const val VIEW = "view"
    const val SAVE = "save"
    const val MESSAGE = "message"
}

sealed class UiState<out T> {
    object Loading : UiState<Nothing>()
    data class Error(val message: String) : UiState<Nothing>()
    data class Success<T>(val data: T) : UiState<T>()
}

data class ListingValidationResult(
    val isValid: Boolean,
    val titleError: String? = null,
    val priceError: String? = null,
    val measurementErrors: List<String?> = emptyList(),
    val firstError: String? = null
)

fun validateListingForm(
    title: String,
    priceUsd: Double?,
    measurements: List<MeasurementInput> = emptyList()
): ListingValidationResult {
    val trimmedTitle = title.trim()
    val titleError = when {
        trimmedTitle.isEmpty() -> "Title cannot be empty."
        trimmedTitle.length < 3 -> "Title must be at least 3 characters."
        trimmedTitle.length > 80 -> "Title must be 80 characters or less."
        else -> null
    }

    val priceError = when {
        priceUsd == null -> "Price is required."
        priceUsd <= 0.0 -> "Price must be above $0."
        priceUsd > 10_000.0 -> "Price must be $10,000 or less."
        else -> null
    }

    val mErrors = validateMeasurements(measurements)
    val hasMeasurementError = mErrors.any { it != null }

    val first = titleError ?: priceError ?: mErrors.firstOrNull { it != null }

    return ListingValidationResult(
        isValid = titleError == null && priceError == null && !hasMeasurementError,
        titleError = titleError,
        priceError = priceError,
        measurementErrors = mErrors,
        firstError = first
    )
}

object AppLinks {
    const val TERMS_URL = "https://dzirent.com/terms"
    const val PRIVACY_URL = "https://dzirent.com/privacy"
    const val SUPPORT_EMAIL = "support@dzirent.com"
    const val HELP_URL = "https://dzirent.com/help"
    const val SAFETY_URL = "https://dzirent.com/safety"
    const val COMMUNITY_GUIDELINES_URL = "https://dzirent.com/community-guidelines"
    const val COPYRIGHT_URL = "https://dzirent.com/copyright"
    const val DELETE_ACCOUNT_URL = "https://dzirent.com/delete-account"
    const val SUPPORT_URL = "https://dzirent.com/support"
    /** The website's Settings > Privacy & safety, with "Download my data" (the iPhone opens it for now). */
    const val DATA_EXPORT_URL = "https://dzirent.com/app/settings/preferences#privacy"
}

/** The shortest password the server accepts (Supabase Auth `password_min_length`). */
const val PASSWORD_MIN_LENGTH = 8

