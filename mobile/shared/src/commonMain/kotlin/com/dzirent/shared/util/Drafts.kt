package com.dzirent.shared.util

import com.dzirent.shared.model.ListingPhoto
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** One measurement row in a saved draft. */
@Serializable
data class DraftMeasurement(val label: String, val value: String, val template: Boolean = false)

/** One available-dates range in a saved draft (ISO dates). */
@Serializable
data class DraftRange(val start: String, val end: String)

/**
 * A listing in progress, saved on the phone per user as it changes. A new listing's draft is
 * offered when Create listing opens again ("Continue your draft?"); an edit's draft only brings
 * the form back after the screen was recreated (rotation, or the app stopped behind the camera).
 * Photos are the app's own copies (file URIs), so they're still readable after a restart.
 * Once the photos step has uploaded them for the photo check, [listingId], [listingCreated]
 * and [uploaded] say where they went, so a restored draft carries on instead of uploading
 * them again, and [scanId] is the check to keep watching.
 */
@Serializable
data class SavedDraft(
    val version: Int = VERSION,
    val step: Int = 1,
    /** [PhotoSlot.key] -> photo URI of a new photo. */
    val photos: Map<String, String> = emptyMap(),
    /** [PhotoSlot.key] -> id of a photo already on the listing (editing). */
    val savedPhotos: Map<String, String> = emptyMap(),
    val photosChanged: Boolean = false,
    /** The listing's id: a new listing gets it before its draft row is created. */
    val listingId: String? = null,
    /** The paused draft row exists on the server. */
    val listingCreated: Boolean = false,
    /** New photo URI -> the photo it was uploaded as. */
    val uploaded: Map<String, ListingPhoto> = emptyMap(),
    val scanId: String? = null,
    /** [photoSetKey] of the photos [scanId] was asked for. */
    val checkedPhotos: String? = null,
    val title: String = "",
    val category: String? = null,
    val itemType: String? = null,
    val description: String = "",
    val styles: List<String> = emptyList(),
    /** [SuggestField.key] -> its history. */
    val fields: Map<String, FieldState> = emptyMap(),
    val recognizedKind: String? = null,
    val pickedKind: String? = null,
    val sizeLabel: String = "",
    val unit: String? = null,
    val measurements: List<DraftMeasurement> = emptyList(),
    val sameAsAnswered: Boolean = false,
    val priceText: String = "",
    val priceNote: String = "",
    val retailValueText: String = "",
    val depositNote: String = "",
    /** C5: the deposit amount as typed (dollars; shown only while payments are on). */
    val depositAmountText: String = "",
    val ranges: List<DraftRange>? = null,
    val listingDeclarationChecked: Boolean = false,
    val aiReviewNeeded: Boolean = false
) {
    /** Worth asking "Continue your draft?": a photo or something typed. */
    val hasContent: Boolean
        get() = photos.isNotEmpty() || title.isNotBlank() || description.isNotBlank() || priceText.isNotBlank() ||
            measurements.any { it.value.isNotBlank() }

    val dateRanges: List<DateRange>? get() = ranges?.mapNotNull { parseDateRange(it.start, it.end) }

    companion object {
        /** 2: three steps and the server photo check (Step 8B). Older drafts aren't offered. */
        const val VERSION = 2
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

        fun encode(draft: SavedDraft): String = json.encodeToString(serializer(), draft)

        /** Null for anything unreadable or from another draft version, so a bad file never blocks a new listing. */
        fun decode(text: String?): SavedDraft? =
            text?.let { runCatching { json.decodeFromString(serializer(), it) }.getOrNull() }?.takeIf { it.version == VERSION }
    }
}
