package com.dzirent.shared.model

import com.dzirent.shared.util.BodyMeasurement
import com.dzirent.shared.util.DateRange
import com.dzirent.shared.util.FitProfile
import com.dzirent.shared.util.MeasurementInput
import com.dzirent.shared.util.formatPrice
import com.dzirent.shared.util.parseDateRange
import com.dzirent.shared.util.validateMeasurements
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
    @SerialName("pickup_area") val pickupArea: String? = null
) {
    val hasLocation: Boolean get() = approxLat != null && approxLng != null
    val studioTitle: String get() = studioName?.ifBlank { null } ?: displayName.ifBlank { "Studio" }
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
    @SerialName("style_interests") val styleInterests: List<String> = emptyList()
) {
    val fit: FitProfile? get() = FitProfile.fromDb(fitProfile)

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
    @SerialName("created_at") val createdAt: String? = null
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
    @SerialName("listing_styles") val listingStyles: List<String> = emptyList(),
    @SerialName("garment_type") val garmentType: String? = null,
    @SerialName("ai_review_needed") val aiReviewNeeded: Boolean = false,
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
    val priceLabel: String get() = priceUsd?.let { formatPrice(it) } ?: priceNote
}

@Serializable
data class ListingPhoto(
    val id: String,
    @SerialName("listing_id") val listingId: String,
    @SerialName("storage_path") val storagePath: String,
    val position: Int,
    val slot: String? = null
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
    val status: String = "active", // 'active' | 'returned' | 'cancelled'
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

@Serializable
data class Report(
    val id: String? = null,
    @SerialName("reporter_id") val reporterId: String,
    @SerialName("target_type") val targetType: String, // 'listing' | 'user' | 'message'
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
}

