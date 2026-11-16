package com.dzirent.shared.util

import com.dzirent.shared.model.AccessoryTypes
import com.dzirent.shared.model.Categories
import com.dzirent.shared.model.Listing
import kotlinx.serialization.Serializable
import kotlinx.datetime.LocalDate

// ---- Suggest once -------------------------------------------------------------------------

/** The fields the photo check can fill. [key] is suggestion_events.field. */
enum class SuggestField(val key: String) {
    TITLE("title"),
    CATEGORY("category"),
    DESCRIPTION("description"),
    STYLE("style")
}

/** Who last set a field: nobody yet, a suggestion, or the lender (typing or ✕). */
enum class FieldOrigin { UNTOUCHED, SUGGESTED, EDITED, CLEARED }

/** One field's history: who set it, and what was suggested from which label (for tracking). */
@Serializable
data class FieldState(val origin: FieldOrigin = FieldOrigin.UNTOUCHED, val suggested: String? = null, val label: String? = null)

/** How several styles are kept in the one STYLE field value ("Western formal, Western casual"). */
const val STYLE_SEPARATOR = ", "

/** What a suggestion would put in each field (null: nothing for that field). */
fun suggestedValues(s: ListingSuggestions): Map<SuggestField, String?> = mapOf(
    SuggestField.TITLE to s.title,
    SuggestField.CATEGORY to s.category,
    SuggestField.DESCRIPTION to s.description,
    SuggestField.STYLE to s.styles.takeIf { it.isNotEmpty() }?.joinToString(STYLE_SEPARATOR)
)

/**
 * Suggest once: only fields that are empty and were never filled by a suggestion, edited or
 * cleared get the suggestion. Returns what to put in each of them. Nothing the lender typed is
 * ever overwritten.
 */
fun fieldsToFill(states: Map<SuggestField, FieldState>, current: Map<SuggestField, String>, s: ListingSuggestions): Map<SuggestField, String> =
    suggestedValues(s).mapNotNull { (field, value) ->
        val state = states[field] ?: FieldState()
        if (value == null || state.origin != FieldOrigin.UNTOUCHED || current[field].orEmpty().isNotBlank()) null else field to value
    }.toMap()

/** The state after a suggestion filled the field; [label] is the policy item it came from. */
fun suggestedState(value: String, label: String) = FieldState(FieldOrigin.SUGGESTED, value, label)

/** The state after the lender typed in the field (typing it empty counts as clearing). */
fun editedState(state: FieldState, newValue: String) =
    state.copy(origin = if (newValue.isBlank()) FieldOrigin.CLEARED else FieldOrigin.EDITED)

/** The state after ✕. */
fun clearedState(state: FieldState) = state.copy(origin = FieldOrigin.CLEARED)

/** suggestion_events.action at publish for a field that got a suggestion: kept, cleared or edited (null if none). */
fun suggestionOutcome(state: FieldState, finalValue: String): String? {
    val suggested = state.suggested ?: return null
    return when {
        finalValue.isBlank() -> "cleared"
        finalValue.trim() == suggested.trim() -> "kept"
        else -> "edited"
    }
}

/** The category field starts blank; this is its placeholder. Required to publish. */
const val CHOOSE_CATEGORY = "Choose a category"

/** The tip under Description; never saved. */
const val DESCRIPTION_TIP = "Add the fabric, fit and any flaws."

// ---- What each step still needs ---------------------------------------------------------------
//
// F1: a step asks only for its own fields, when the person continues past it, and publishing
// asks again for everything; each gap is the catalog's field-level message (DZ-E2070-E2085, the
// same codes as the website). Saving the photos step's draft row asks for nothing (draftListing).

/** A listing field's gap: the catalog's words and code for it, and the field it is about. */
fun missingField(button: String, code: String): Missing {
    val shown = ErrorCatalog.shown(code)
    return Missing(button, shown.text, shown.field, shown.code)
}

/**
 * The row a new listing gets when its photos are first uploaded for the check: paused, the
 * placeholder title and category, and nothing else yet (no size, price or description). The
 * database accepts it as it is; the details are checked when the person continues and publishes.
 */
fun draftListing(id: String, lenderId: String, city: String, approxLat: Double, approxLng: Double): Listing = Listing(
    id = id,
    lenderId = lenderId,
    title = DRAFT_TITLE,
    category = DRAFT_CATEGORY,
    city = city,
    approxLat = approxLat,
    approxLng = approxLng,
    status = "paused"
)

/**
 * What the details step still needs, or null: a 3-80 character title, a category, an item type
 * for accessories, and the accessory declaration when it's needed and not signed yet. (The
 * photos step needs [photoGate] to pass.) The size and price belong to the next step.
 */
fun detailsMissing(title: String, category: String?, itemType: String?, declarationPending: Boolean): Missing? = when {
    title.trim().length !in 3..80 -> missingField("Add a title", "DZ-E2070")
    category == null -> missingField(CHOOSE_CATEGORY, "DZ-E2071")
    category == Categories.ACCESSORIES && itemType == null -> missingField("Choose an item type", "DZ-E2072")
    declarationPending -> missingField(SIGN_DECLARATION, "DZ-E2040")
    else -> null
}

/** The details step's button while the accessory declaration is still to be signed. */
const val SIGN_DECLARATION = "Sign the declaration"

/** Everything the size, price and dates step checks, as typed. */
data class Step2Input(
    val sizeLabel: String,
    val priceText: String,
    val isAccessory: Boolean,
    val listingDeclarationChecked: Boolean,
    val retailValueText: String,
    val priceNote: String,
    val description: String,
    val measurementsOk: Boolean,
    val ranges: List<DateRange>,
    val hasLocation: Boolean
)

const val PRICE_NOTE_MAX = 60
const val DESCRIPTION_MAX = 1000

/** The plain message when an accessory is worth too much. */
val ACCESSORY_VALUE_TOO_HIGH =
    "Accessories worth more than \$${ItemLabels.ACCESSORY_MAX_VALUE_USD} can't be listed on Dzirent. Lower the retail value if it's worth less."

/** Null, or [ACCESSORY_VALUE_TOO_HIGH] when an accessory's retail value is above the limit. */
fun accessoryValueError(isAccessory: Boolean, retailValueText: String): String? {
    val value = retailValueText.toDoubleOrNull() ?: return null
    return ACCESSORY_VALUE_TOO_HIGH.takeIf { isAccessory && value > ItemLabels.ACCESSORY_MAX_VALUE_USD }
}

/** What the size, price and dates step still needs, or null when the listing can be published. */
fun step2Missing(input: Step2Input): Missing? {
    val retail = input.retailValueText
    return when {
        !input.hasLocation -> Missing("Set your location", "Set your location before publishing.")
        input.sizeLabel.isBlank() -> missingField("Choose a size", "DZ-E2074")
        !input.measurementsOk -> missingField("Fix the measurements", "DZ-E2083")
        parsePrice(input.priceText) == null -> missingField("Add a price", "DZ-E2076")
        input.isAccessory && !input.listingDeclarationChecked -> missingField("Tick the declaration", "DZ-E2081")
        retail.isNotBlank() && (retail.toDoubleOrNull() ?: 0.0) <= 0.0 -> missingField("Fix the retail value", "DZ-E2079")
        accessoryValueError(input.isAccessory, retail) != null ->
            missingField("Retail value over \$${ItemLabels.ACCESSORY_MAX_VALUE_USD}", "DZ-E2080")
        input.priceNote.trim().length > PRICE_NOTE_MAX -> missingField("Shorten price details", "DZ-E2077")
        input.description.trim().length > DESCRIPTION_MAX -> missingField("Shorten the description", "DZ-E2073")
        input.ranges.isEmpty() -> missingField("Add dates", "DZ-E2084")
        else -> null
    }
}

/** One line of the short ready list above "Publish listing". */
data class ReadyItem(val label: String, val done: Boolean)

/** The short ready list: photos, details, size, price, dates, and the declaration for accessories. */
fun readyList(photosDone: Boolean, detailsDone: Boolean, input: Step2Input): List<ReadyItem> = listOfNotNull(
    ReadyItem("Photos", photosDone),
    ReadyItem("Details", detailsDone),
    ReadyItem("Size", input.sizeLabel.isNotBlank()),
    ReadyItem("Price", parsePrice(input.priceText) != null),
    ReadyItem("Dates", input.ranges.isNotEmpty()),
    ReadyItem("Declaration", input.listingDeclarationChecked).takeIf { input.isAccessory }
)

// ---- Dates ------------------------------------------------------------------------------------

/** New listings start available for the next 30 days, today included. */
const val DEFAULT_AVAILABLE_DAYS = 30

fun defaultAvailability(today: LocalDate): DateRange = DateRange(today, today.plusDays(DEFAULT_AVAILABLE_DAYS - 1L))

/** "Next 30 days" for the starting range, otherwise "Nov 3 - Nov 10". */
fun availabilityChipLabel(range: DateRange, today: LocalDate): String =
    if (range == defaultAvailability(today)) "Next $DEFAULT_AVAILABLE_DAYS days" else range.format()

// ---- Garment kind, measurements and "Same as your …" -----------------------------------------------

/**
 * The garment kind for the size picker and measurements: what the lender picked, else what the
 * photo check suggested, else Accessories are one size. Null: the lender picks one.
 */
fun garmentKindFor(recognized: GarmentKind?, picked: GarmentKind?, category: String?): GarmentKind? = when {
    picked != null -> picked
    recognized != null -> recognized
    category == Categories.ACCESSORIES -> GarmentKind.ONE_SIZE
    else -> null
}

/** Measurement rows a listing of this kind starts with (values empty). */
fun measurementLabelsFor(kind: GarmentKind?, itemType: String?): List<String> = when (kind) {
    GarmentKind.TOP -> listOf("Chest (flat)", "Shoulder", "Sleeve", "Length")
    GarmentKind.TROUSERS -> listOf("Waist (flat)", "Inseam", "Rise", "Leg opening")
    GarmentKind.SUIT -> listOf("Chest (flat)", "Shoulder", "Sleeve", "Jacket length", "Waist (flat)", "Inseam")
    GarmentKind.DRESS -> listOf("Bust (flat)", "Waist (flat)", "Hips (flat)", "Length")
    GarmentKind.SKIRT -> listOf("Waist (flat)", "Hips (flat)", "Length")
    GarmentKind.SAREE -> listOf("Blouse bust (flat)", "Blouse length", "Skirt waist (flat)", "Skirt length")
    GarmentKind.ONE_SIZE -> AccessoryTypes.SUGGESTIONS[itemType].orEmpty()
    null -> emptyList()
}

/**
 * "Same as your …?": the lender's most recent other listing of the same kind that has
 * measurements, or null. Only the lender's own listings: never body measurements.
 */
fun sameAsCandidate(mine: List<Listing>, kind: GarmentKind?, excludeId: String?): Listing? {
    if (kind == null) return null
    return mine.filter { it.id != excludeId && it.garmentType == kind.key && it.measurements.isNotEmpty() }
        .maxByOrNull { timestampMillis(it.createdAt) }
}

/** "Same as your Maroon lehenga?" */
fun sameAsQuestion(listing: Listing): String = "Same as your ${listing.title}?"

/** The rows and unit "Yes" copies: labels and values as saved, in the saved unit. */
fun copiedMeasurements(listing: Listing): Pair<List<Pair<String, Double>>, String?> =
    listing.measurements.map { it.label to it.value } to listing.measurements.firstOrNull()?.unit
