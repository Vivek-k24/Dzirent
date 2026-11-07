package com.dzirent.shared.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import com.dzirent.shared.data.PhotoAnalysis
import com.dzirent.shared.data.PhotoItem
import com.dzirent.shared.model.Categories
import com.dzirent.shared.model.Listing
import com.dzirent.shared.model.ListingPhoto
import com.dzirent.shared.model.ListingScan
import com.dzirent.shared.model.SuggestionEvent
import com.dzirent.shared.repository.generateUuid
import com.dzirent.shared.util.CheckPhase
import com.dzirent.shared.util.DraftMeasurement
import com.dzirent.shared.util.DraftRange
import com.dzirent.shared.util.FashionStyles
import com.dzirent.shared.util.FieldOrigin
import com.dzirent.shared.util.FieldState
import com.dzirent.shared.util.GarmentKind
import com.dzirent.shared.util.ListingSuggestions
import com.dzirent.shared.util.PhotoReview
import com.dzirent.shared.util.PhotoSlot
import com.dzirent.shared.util.PhotoVerdict
import com.dzirent.shared.util.ReviewState
import com.dzirent.shared.util.STYLE_SEPARATOR
import com.dzirent.shared.util.SavedDraft
import com.dzirent.shared.util.Step2Input
import com.dzirent.shared.util.SuggestField
import com.dzirent.shared.util.Sizes
import com.dzirent.shared.util.checkBanner
import com.dzirent.shared.util.clearedState
import com.dzirent.shared.util.defaultAvailability
import com.dzirent.shared.util.editedState
import com.dzirent.shared.util.fieldsToFill
import com.dzirent.shared.util.garmentKindFor
import com.dzirent.shared.util.isDraft
import com.dzirent.shared.util.measurementLabelsFor
import com.dzirent.shared.util.parseDateRange
import com.dzirent.shared.util.photoGate
import com.dzirent.shared.util.photoMinimumApplies
import com.dzirent.shared.util.photoSetKey
import com.dzirent.shared.util.priceInputText
import com.dzirent.shared.util.suggestedState
import com.dzirent.shared.util.suggestionOutcome
import com.dzirent.shared.util.validateMeasurements
import kotlinx.datetime.LocalDate

/** The editor's three steps. */
const val STEP_PHOTOS = 1
const val STEP_DETAILS = 2
const val STEP_PRICE = 3

/**
 * Everything the three-step listing form holds, and the rules that change it. Snapshot state,
 * so the screens recompose; the decisions themselves are the pure functions in util (tested there).
 */
class ListingEditorState(val original: Listing?, defaultUnit: String, today: LocalDate) {
    val isNew = original == null

    /** A draft row from an earlier photo check: its title and category are placeholders, not the lender's. */
    val isDraft = original?.isDraft == true

    /** The listing's id. A new listing gets one now; a restored draft brings back its own. */
    var listingId by mutableStateOf(original?.id ?: generateUuid())

    var step by mutableIntStateOf(STEP_PHOTOS)

    // ---- Photos ----
    val slots = mutableStateMapOf<PhotoSlot, PhotoItem>()
    /** The phone's instant checks per photo key. */
    val reviews = mutableStateMapOf<String, PhotoReview>()
    val analyses = mutableStateMapOf<String, PhotoAnalysis>()
    var photosChanged by mutableStateOf(false)

    // ---- The server's photo check ----
    var checkPhase by mutableStateOf(CheckPhase.NONE)
    var uploadError by mutableStateOf<String?>(null)
    var scanId by mutableStateOf<String?>(null)
    var scan by mutableStateOf<ListingScan?>(null)
    /** [currentPhotoKey] of the photos [scanId] was asked for. */
    var checkedPhotos by mutableStateOf<String?>(null)
    /** The server's warnings per saved photo id, once the check is done. */
    val serverWarnings = mutableStateMapOf<String, List<String>>()
    /** The check said costume jewelry: the accessory declaration is needed. */
    var jewelrySuggested by mutableStateOf(false)

    // ---- Details ----
    var title by mutableStateOf(textValue(if (isDraft) "" else original?.title.orEmpty()))
    var category by mutableStateOf(if (isDraft) null else original?.category)
    var itemType by mutableStateOf(original?.itemType)
    var description by mutableStateOf(textValue(original?.description.orEmpty()))
    var styles by mutableStateOf(original?.listingStyles.orEmpty().filter { it in FashionStyles.ALL })
    val fields = mutableStateMapOf<SuggestField, FieldState>()
    /** What the photo check suggested; the lender's own pick wins. */
    var recognizedKind by mutableStateOf<GarmentKind?>(null)
    var pickedKind by mutableStateOf(GarmentKind.fromKey(original?.garmentType))

    // ---- Size, price and dates ----
    var sizeLabel by mutableStateOf(original?.sizeLabel.orEmpty())
    var unit by mutableStateOf(original?.measurements?.firstOrNull()?.unit ?: defaultUnit)
    var measurementRows by mutableStateOf(
        original?.measurements.orEmpty().map { MeasurementRow(it.id ?: generateUuid(), it.label, formatNumber(it.value)) }
    )
    var sameAsAnswered by mutableStateOf(!isNew && !isDraft)
    var priceText by mutableStateOf(priceInputText(original?.priceUsd))
    var priceNote by mutableStateOf(original?.priceNote.orEmpty())
    var retailValueText by mutableStateOf(original?.retailValue?.let { formatNumber(it) }.orEmpty())
    var depositNote by mutableStateOf(original?.depositNote.orEmpty())
    var ranges by mutableStateOf(
        if (original == null || (isDraft && original.availability.isEmpty())) listOf(defaultAvailability(today))
        else original.availability.mapNotNull { parseDateRange(it.startDate, it.endDate) }
    )
    var listingDeclarationChecked by mutableStateOf(false)
    var aiReviewNeeded by mutableStateOf(original?.aiReviewNeeded ?: false)

    /**
     * The text filter's refusal at publish, by database column ("title", "description",
     * "price_note", "deposit_note"); shown under that field until it's edited.
     */
    var textErrors by mutableStateOf<Map<String, String>>(emptyMap())

    fun clearTextError(column: String) {
        if (column in textErrors) textErrors = textErrors - column
    }

    init {
        original?.let { listing ->
            val photos = listing.photos.sortedBy { it.position }
            com.dzirent.shared.util.slotsForSaved(photos.map { it.slot }).zip(photos).forEach { (slot, photo) ->
                slots[slot] = PhotoItem.Existing(photo)
            }
            // What was saved counts as the lender's own: suggestions only fill what's still empty.
            // A draft row's placeholders were never the lender's.
            if (!isDraft) {
                if (listing.title.isNotBlank()) fields[SuggestField.TITLE] = FieldState(FieldOrigin.EDITED)
                fields[SuggestField.CATEGORY] = FieldState(FieldOrigin.EDITED)
            }
            if (listing.description.isNotBlank()) fields[SuggestField.DESCRIPTION] = FieldState(FieldOrigin.EDITED)
            if (listing.listingStyles.isNotEmpty()) fields[SuggestField.STYLE] = FieldState(FieldOrigin.EDITED)
        }
    }

    val isAccessory: Boolean get() = category == Categories.ACCESSORIES
    val kind: GarmentKind? get() = garmentKindFor(recognizedKind, pickedKind, category)

    fun field(f: SuggestField) = fields[f] ?: FieldState()

    // ---- Photos ----

    /** The phone's checks for the photo in [slot] (Close-up and Size tag only count sharpness and light). */
    fun reviewOf(slot: PhotoSlot): PhotoReview? {
        val item = slots[slot] ?: return null
        return when (item) {
            is PhotoItem.Existing -> PhotoReview.Saved
            is PhotoItem.New -> (reviews[item.key] ?: PhotoReview.Checking).copy(fullChecks = slot.fullChecks)
        }
    }

    val verdicts: Map<PhotoSlot, PhotoVerdict> get() = slots.keys.associateWith { reviewOf(it)!!.verdict }

    fun photosGate() = photoGate(
        slots.keys.associateWith { reviewOf(it)!! },
        minimumApplies = photoMinimumApplies(isNew || isDraft, photosChanged)
    )

    fun reviewFor(analysis: PhotoAnalysis): PhotoReview =
        analysis.checks?.let { PhotoReview(ReviewState.CHECKED, it) } ?: PhotoReview(ReviewState.UNREADABLE)

    fun removePhoto(slot: PhotoSlot) {
        slots.remove(slot)
        photosChanged = true
    }

    /** Which photo sits in which slot now. */
    fun currentPhotoKey(): String = photoSetKey(slots.mapValues { it.value.key })

    /** The photos changed since they were last sent for the check (or never were). */
    val photosNeedCheck: Boolean get() = scanId == null || checkedPhotos != currentPhotoKey()

    val banner get() = checkBanner(checkPhase, scan, uploadError)

    // ---- Suggestions from the photo check ----

    /** Fills empty, never-touched fields from [s] (suggest once); never what the lender typed. */
    fun applySuggestion(s: ListingSuggestions) {
        fieldsToFill(fields, currentValues(), s).forEach { (field, value) ->
            when (field) {
                SuggestField.TITLE -> title = textValue(value.take(80))
                SuggestField.DESCRIPTION -> description = textValue(value)
                SuggestField.CATEGORY -> {
                    category = value
                    itemType = if (value == Categories.ACCESSORIES) s.itemType else null
                }
                SuggestField.STYLE -> styles = value.split(STYLE_SEPARATOR).filter { it in FashionStyles.ALL }
                    .take(FashionStyles.LISTING_MAX)
            }
            fields[field] = suggestedState(value, s.label)
        }
        if (pickedKind == null) recognizedKind = s.kind
        jewelrySuggested = s.isJewelry
    }

    private fun currentValues() = mapOf(
        SuggestField.TITLE to title.text,
        SuggestField.CATEGORY to category.orEmpty(),
        SuggestField.DESCRIPTION to description.text,
        SuggestField.STYLE to styles.joinToString(STYLE_SEPARATOR)
    )

    // ---- The lender's own edits ----

    fun editTitle(value: TextFieldValue) {
        if (value.text.length > 80) return
        if (value.text != title.text) {
            fields[SuggestField.TITLE] = editedState(field(SuggestField.TITLE), value.text)
            clearTextError("title")
        }
        title = value
    }

    fun editDescription(value: TextFieldValue) {
        if (value.text.length > 1000) return
        if (value.text != description.text) {
            fields[SuggestField.DESCRIPTION] = editedState(field(SuggestField.DESCRIPTION), value.text)
            clearTextError("description")
        }
        description = value
    }

    fun pickCategory(value: String) {
        fields[SuggestField.CATEGORY] = editedState(field(SuggestField.CATEGORY), value)
        category = value
        if (value != Categories.ACCESSORIES) itemType = null
    }

    fun editStyles(value: List<String>) {
        fields[SuggestField.STYLE] = editedState(field(SuggestField.STYLE), value.joinToString(STYLE_SEPARATOR))
        styles = value
    }

    fun clear(f: SuggestField) {
        fields[f] = clearedState(field(f))
        when (f) {
            SuggestField.TITLE -> title = textValue("")
            SuggestField.DESCRIPTION -> description = textValue("")
            SuggestField.CATEGORY -> {
                category = null
                itemType = null
            }
            SuggestField.STYLE -> styles = emptyList()
        }
    }

    // ---- Size, price and dates ----

    /** Template rows for the kind, when nothing has been typed into the measurements yet. */
    fun refreshMeasurementTemplate() {
        if (measurementRows.any { !it.isUnused }) return
        val labels = measurementLabelsFor(kind, itemType)
        if (measurementRows.map { it.label } != labels) measurementRows = labels.map { MeasurementRow(label = it, template = true) }
    }

    /** One-size kinds get their size label without a picker. */
    fun refreshFixedSize() {
        val k = kind ?: return
        Sizes.fixedLabel(k)?.let { if (sizeLabel != it) sizeLabel = it }
        if (Sizes.fixedLabel(k) == null && sizeLabel == Sizes.ONE_SIZE) sizeLabel = ""
    }

    val usedMeasurementRows: List<MeasurementRow> get() = measurementRows.filterNot { it.isUnused }

    val measurementsOk: Boolean get() = validateMeasurements(usedMeasurementRows.map { it.toInput() }).all { it == null }

    fun step2Input(hasLocation: Boolean) = Step2Input(
        sizeLabel = sizeLabel,
        priceText = priceText,
        isAccessory = isAccessory,
        listingDeclarationChecked = listingDeclarationChecked,
        retailValueText = retailValueText,
        priceNote = priceNote,
        description = description.text,
        measurementsOk = measurementsOk,
        ranges = ranges,
        hasLocation = hasLocation
    )

    /** kept / cleared / edited for each field a suggestion filled, at publish. */
    fun outcomeEvents(listingId: String): List<SuggestionEvent> = SuggestField.entries.mapNotNull { f ->
        val state = field(f)
        val final = when (f) {
            SuggestField.TITLE -> title.text
            SuggestField.CATEGORY -> category.orEmpty()
            SuggestField.DESCRIPTION -> description.text
            SuggestField.STYLE -> styles.joinToString(STYLE_SEPARATOR)
        }
        val action = suggestionOutcome(state, final) ?: return@mapNotNull null
        SuggestionEvent(f.key, state.label.orEmpty(), action, listingId)
    }

    // ---- Drafts ----

    /** [listingCreated] and [uploaded] come from the publisher: where the photos already went. */
    fun toDraft(listingCreated: Boolean, uploaded: Map<String, ListingPhoto>) = SavedDraft(
        step = step,
        photos = slots.filterValues { it is PhotoItem.New }.map { (slot, item) -> slot.key to item.key }.toMap(),
        savedPhotos = slots.mapNotNull { (slot, item) -> (item as? PhotoItem.Existing)?.let { slot.key to it.photo.id } }.toMap(),
        photosChanged = photosChanged,
        listingId = listingId,
        listingCreated = listingCreated,
        uploaded = uploaded,
        scanId = scanId,
        checkedPhotos = checkedPhotos,
        title = title.text,
        category = category,
        itemType = itemType,
        description = description.text,
        styles = styles,
        fields = fields.mapKeys { it.key.key },
        recognizedKind = recognizedKind?.key,
        pickedKind = pickedKind?.key,
        sizeLabel = sizeLabel,
        unit = unit,
        measurements = measurementRows.map { DraftMeasurement(it.label, it.valueText, it.template) },
        sameAsAnswered = sameAsAnswered,
        priceText = priceText,
        priceNote = priceNote,
        retailValueText = retailValueText,
        depositNote = depositNote,
        ranges = ranges.map { DraftRange(it.start.toString(), it.end.toString()) },
        listingDeclarationChecked = listingDeclarationChecked,
        aiReviewNeeded = aiReviewNeeded
    )

    /**
     * Restores a saved draft. Its photos are checked on the phone again; the server check it was
     * waiting for is picked up again. A photo added meanwhile (a camera shot arriving after a
     * restart) stays, in a free slot.
     */
    fun restore(draft: SavedDraft) {
        val meanwhile = slots.filterValues { it is PhotoItem.New }
        val saved = original?.photos.orEmpty().associateBy { it.id }
        slots.clear()
        draft.savedPhotos.forEach { (key, id) ->
            val slot = PhotoSlot.fromKey(key) ?: return@forEach
            saved[id]?.let { slots[slot] = PhotoItem.Existing(it) }
        }
        draft.photos.forEach { (key, uri) -> PhotoSlot.fromKey(key)?.let { slots[it] = PhotoItem.New(uri) } }
        meanwhile.forEach { (slot, item) ->
            if (slots.values.none { it.key == item.key }) {
                val free = if (slot !in slots) slot else PhotoSlot.FILL_ORDER.firstOrNull { it !in slots }
                if (free != null) slots[free] = item
            }
        }
        draft.listingId?.let { listingId = it }
        scanId = draft.scanId
        checkedPhotos = draft.checkedPhotos
        title = textValue(draft.title)
        category = draft.category
        itemType = draft.itemType
        description = textValue(draft.description)
        styles = draft.styles.filter { it in FashionStyles.ALL }
        fields.clear()
        draft.fields.forEach { (key, state) -> SuggestField.entries.firstOrNull { it.key == key }?.let { fields[it] = state } }
        recognizedKind = GarmentKind.fromKey(draft.recognizedKind)
        pickedKind = GarmentKind.fromKey(draft.pickedKind)
        sizeLabel = draft.sizeLabel
        draft.unit?.let { unit = it }
        measurementRows = draft.measurements.map { MeasurementRow(label = it.label, valueText = it.value, template = it.template) }
        sameAsAnswered = draft.sameAsAnswered
        priceText = draft.priceText
        priceNote = draft.priceNote
        retailValueText = draft.retailValueText
        depositNote = draft.depositNote
        draft.dateRanges?.let { ranges = it }
        listingDeclarationChecked = draft.listingDeclarationChecked
        aiReviewNeeded = aiReviewNeeded || draft.aiReviewNeeded
        photosChanged = isNew || draft.photosChanged || meanwhile.isNotEmpty()
        step = draft.step.coerceIn(STEP_PHOTOS, STEP_PRICE)
    }

    /** Forgets a check that no longer applies (its draft row is gone). */
    fun forgetCheck() {
        scanId = null
        scan = null
        checkedPhotos = null
        checkPhase = CheckPhase.NONE
        serverWarnings.clear()
    }
}

/** Text with the cursor at the end, for text the app puts in a field. */
fun textValue(text: String) = TextFieldValue(text, TextRange(text.length))

/** 40.0 -> "40", 32.5 -> "32.5" for editable text fields. */
fun formatNumber(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()
