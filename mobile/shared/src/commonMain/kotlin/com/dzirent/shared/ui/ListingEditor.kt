package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dzirent.shared.data.DeclarationCache
import com.dzirent.shared.data.ListingDraft
import com.dzirent.shared.data.ListingPublisher
import com.dzirent.shared.data.PhotoItem
import com.dzirent.shared.data.PublishStepException
import com.dzirent.shared.model.*
import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.util.AccessoryDeclaration
import com.dzirent.shared.util.CHECKING_PHOTOS
import com.dzirent.shared.util.CheckPhase
import com.dzirent.shared.util.DRAFT_CATEGORY
import com.dzirent.shared.util.DRAFT_TITLE
import com.dzirent.shared.util.DistanceUnit
import com.dzirent.shared.util.PhotoSlot
import com.dzirent.shared.util.SavedDraft
import com.dzirent.shared.util.declarationNeeded
import com.dzirent.shared.util.detailsMissing
import com.dzirent.shared.util.isDraft
import com.dzirent.shared.util.parsePrice
import com.dzirent.shared.util.step2Missing
import com.dzirent.shared.util.suggestionsFrom
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.lastOrNull
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.repository.generateUuid
import com.dzirent.shared.util.PhotoReview
import com.dzirent.shared.util.today

private const val DEPOSIT_NOTE_MAX = 120

/** The listing columns the database's text filter checks; its refusal names one of them. */
private val LISTING_TEXT_COLUMNS = setOf("title", "description", "price_note", "deposit_note")

/** How long the editor follows a photo check (a cold start of the vision service takes about a minute). */
private const val CHECK_TIMEOUT_MS = 180_000L

/** Stands in for a listing the owner-only read didn't return: someone else's, or deleted. */
private val NOT_YOURS = Listing(id = "", lenderId = "", title = "", category = "", approxLat = 0.0, approxLng = 0.0, status = "")
private fun noLocationToPublish(unit: DistanceUnit) =
    "Set your location before publishing. Listings show your approximate area (${unit.locationPrecision}), never your exact address."

/**
 * Create (listingId == null) or edit a listing. Editing loads the listing first and is
 * limited to its owner; RLS enforces the same rule on the server.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListingEditorScreen(
    repository: DzirentRepository,
    profile: Profile,
    listingId: String?,
    onSetLocation: () -> Unit,
    onBack: (() -> Unit)?,
    onSaved: () -> Unit
) {
    var loadState by remember(listingId) {
        mutableStateOf<UiState<Listing?>>(if (listingId == null) UiState.Success(null) else UiState.Loading)
    }
    val scope = rememberCoroutineScope()

    fun load() {
        if (listingId == null) return
        scope.launch {
            loadState = UiState.Loading
            loadState = try {
                UiState.Success(repository.getMyListing(listingId) ?: NOT_YOURS)
            } catch (e: Exception) {
                UiState.Error(e.userMessage("Couldn't load this listing. Please try again."))
            }
        }
    }

    LaunchedEffect(listingId) { load() }

    Column(modifier = Modifier.fillMaxSize()) {
        if (onBack != null) {
            TopAppBar(
                title = { Text(if (listingId == null) "New Listing" else "Edit Listing") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
        when (val state = loadState) {
            is UiState.Loading -> LoadingView(message = "Loading listing...")
            is UiState.Error -> ErrorView(message = state.message, onRetry = { load() })
            is UiState.Success -> {
                val original = state.data
                if (original != null && (original === NOT_YOURS || original.lenderId != profile.id)) {
                    EmptyView(
                        title = "Not your listing",
                        description = "You can only edit your own listings.",
                        icon = Icons.Default.Lock
                    )
                } else {
                    ListingEditorForm(
                        repository = repository,
                        profile = profile,
                        original = original,
                        showTitle = onBack == null,
                        onSetLocation = onSetLocation,
                        onSaved = onSaved
                    )
                }
            }
        }
    }
}

private sealed class PublishState {
    object Idle : PublishState()
    data class Running(val progress: String) : PublishState()
    data class Failed(val step: String, val message: String) : PublishState()
}

/**
 * A listing in three steps. Step 1: photos in slots (Front, Back, Close-up required), checked on
 * the phone as they're added. Leaving it uploads them (a new listing is saved as a paused draft
 * first) and asks the server to check them. Step 2: title, category, description and style,
 * filled from an allowed check while the lender types. Step 3: size, measurements, price and
 * dates, then Publish. With vision_required on, publishing waits for the check and the database
 * decides; otherwise it publishes as before. New listings are also saved as a draft on the phone.
 */
@OptIn(ExperimentalMaterial3Api::class, FlowPreview::class)
@Composable
private fun ListingEditorForm(
    repository: DzirentRepository,
    profile: Profile,
    original: Listing?,
    showTitle: Boolean,
    onSetLocation: () -> Unit,
    onSaved: () -> Unit
) {
    val device = LocalDevice.current
    val scope = rememberCoroutineScope()
    val settings = LocalAppSettings.current
    val today = remember { today() }
    val state = remember { ListingEditorState(original, settings.measureUnit.key, today) }
    val isNew = state.isNew
    val publisher = remember { ListingPublisher(repository, device, original) }
    val analyzer = device.photoAnalyzer
    val photoStore = remember { device.photoStore(profile.id) }
    val drafts = remember { device.draftStore(profile.id, original?.id) }
    val declarationCache = remember { DeclarationCache(device.prefs) }

    var errorMessage by remember { mutableStateOf<String?>(null) }
    var publishState by remember { mutableStateOf<PublishState>(PublishState.Idle) }
    var showWhatCanIList by remember { mutableStateOf(false) }

    // The database's flag: while it's on, a listing goes live only after an allowed photo check.
    var visionRequired by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        visionRequired = runCatching { repository.getAppSettings()["vision_required"] == true }.getOrDefault(false)
    }

    // ---- Accessory declaration (once per user) ----
    var declarationSigned by remember { mutableStateOf(declarationCache.isSigned(profile.id, AccessoryDeclaration.VERSION)) }
    var declarationChecked by remember { mutableStateOf(declarationSigned) }
    var showDeclaration by remember { mutableStateOf(false) }
    var declarationOffered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!declarationSigned) {
            // Offline, this says "not signed"; signing again only adds another record.
            val signed = runCatching { repository.hasAccessoryDeclaration(AccessoryDeclaration.VERSION) }.getOrDefault(false)
            if (signed) {
                declarationCache.markSigned(profile.id, AccessoryDeclaration.VERSION)
                declarationSigned = true
            }
        }
        declarationChecked = true
    }
    val declarationPending = declarationNeeded(state.category, state.jewelrySuggested, declarationSigned)
    // Shown by itself the first time it's needed (Accessories picked or suggested, or jewelry
    // found), once the server has said whether it was signed on another phone.
    LaunchedEffect(declarationPending, declarationChecked) {
        if (declarationPending && declarationChecked && !declarationOffered) {
            declarationOffered = true
            showDeclaration = true
        }
    }

    // ---- Each new photo is checked once, on the phone, as it's added ----
    val photoKeys = state.slots.values.map { it.key }.toSet()
    LaunchedEffect(photoKeys) {
        state.slots.values.filterIsInstance<PhotoItem.New>().filter { it.key !in state.reviews }.forEach { item ->
            state.reviews[item.key] = PhotoReview.Checking
            // The form's scope, so moving on doesn't cancel a check in progress.
            scope.launch {
                val analysis = analyzer.analyze(item.uri)
                state.analyses[item.key] = analysis
                state.reviews[item.key] = state.reviewFor(analysis)
            }
        }
    }

    // ---- The server's photo check ----

    /** A new listing's row while only its photos are saved: paused, with placeholder details. */
    fun draftRow(): Listing? {
        if (original != null) return original
        return Listing(
            id = state.listingId,
            lenderId = profile.id,
            title = DRAFT_TITLE,
            category = DRAFT_CATEGORY,
            city = profile.city,
            approxLat = profile.approxLat ?: return null,
            approxLng = profile.approxLng ?: return null,
            status = "paused"
        )
    }

    fun orderedPhotos(): List<Pair<PhotoSlot, PhotoItem>> = PhotoSlot.entries.mapNotNull { slot -> state.slots[slot]?.let { slot to it } }

    var syncJob by remember { mutableStateOf<Job?>(null) }

    /** Puts the photos on the listing as they are now and asks for their check, in the background. */
    fun startPhotoCheck() {
        val row = draftRow() ?: return
        val key = state.currentPhotoKey()
        syncJob?.cancel()
        syncJob = scope.launch {
            state.checkPhase = CheckPhase.UPLOADING
            state.uploadError = null
            state.scan = null
            state.serverWarnings.clear()
            try {
                val ordered = orderedPhotos()
                publisher.syncPhotos(row, ordered.map { it.second }, ordered.map { it.first.key })
                state.checkedPhotos = key
                state.scanId = repository.requestScan(state.listingId)
                state.checkPhase = CheckPhase.CHECKING
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                state.checkPhase = CheckPhase.UPLOAD_FAILED
                state.uploadError = (e as? PublishStepException)?.message ?: e.userMessage("Couldn't upload your photos. Please try again.")
            }
        }
    }

    /** Asks again for the check of the photos already on the listing (after a failed or slow one). */
    fun checkAgain() {
        if (state.checkPhase == CheckPhase.UPLOAD_FAILED || state.photosNeedCheck) {
            startPhotoCheck()
            return
        }
        scope.launch {
            state.checkPhase = CheckPhase.CHECKING
            state.scan = null
            runCatching { repository.requestScan(state.listingId) }
                .onSuccess { state.scanId = it }
                .onFailure {
                    state.uploadError = it.userMessage("Couldn't check your photos. Please try again.")
                    state.checkPhase = CheckPhase.UPLOAD_FAILED
                }
        }
    }

    // Follows the current check to its end, then makes sure it is the check of the photos as
    // they are now (the server starts a newer one when they changed meanwhile).
    LaunchedEffect(state.scanId) {
        val id = state.scanId ?: return@LaunchedEffect
        state.checkPhase = CheckPhase.CHECKING
        val last = withTimeoutOrNull(CHECK_TIMEOUT_MS) {
            repository.watchScan(id).onEach { state.scan = it }.lastOrNull()
        }
        if (last == null || !last.finished) {
            state.checkPhase = CheckPhase.TIMED_OUT
            return@LaunchedEffect
        }
        if (last.status == "done") {
            val current = runCatching { repository.requestScan(state.listingId) }.getOrNull()
            if (current != null && current != id) {
                state.scanId = current
                return@LaunchedEffect
            }
        }
        state.serverWarnings.clear()
        runCatching { repository.getPhotoScans(id) }.getOrNull()?.forEach { state.serverWarnings[it.photoId] = it.warnings }
        suggestionsFrom(last)?.let { state.applySuggestion(it) }
        state.checkPhase = CheckPhase.FINISHED
    }

    // A draft row reopened from My closet: pick up its check.
    LaunchedEffect(Unit) {
        if (state.isDraft && state.scanId == null && state.slots.isNotEmpty()) checkAgain()
    }

    // ---- Drafts: restore, and save as things change ----
    var draftOffer by remember { mutableStateOf<SavedDraft?>(null) }
    var draftChecked by remember { mutableStateOf(false) }
    var finished by remember { mutableStateOf(false) }

    /** Restores [saved], and starts a fresh draft row if the saved one was deleted or published meanwhile. */
    suspend fun restoreDraft(saved: SavedDraft) {
        state.restore(saved)
        publisher.restore(saved.listingCreated, saved.uploaded)
        if (isNew && saved.listingCreated) {
            val row = try {
                repository.getMyListing(state.listingId)
            } catch (e: Exception) {
                return // Offline: carry on with the saved draft row.
            }
            if (row == null || !row.isDraft) {
                state.listingId = generateUuid()
                publisher.reset()
                state.forgetCheck()
            }
        }
    }

    // Survives rotation and the app being stopped while the camera is open: then the form comes
    // back without asking. Opening Create listing afresh asks; opening Edit afresh starts clean.
    var sessionStarted by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        val saved = drafts.load()
        when {
            sessionStarted && saved != null -> restoreDraft(saved)
            !isNew -> drafts.clear()
            saved == null || !saved.hasContent -> photoStore.prune(state.slots.values.map { it.key }.toSet())
            else -> draftOffer = saved
        }
        draftChecked = true
        sessionStarted = true
    }
    if (draftChecked) {
        LaunchedEffect(Unit) {
            snapshotFlow { state.toDraft(publisher.created, publisher.uploadedPhotos) }
                .drop(1)
                .debounce(600)
                .collect { draft -> if (draftOffer == null && !finished) drafts.save(draft) }
        }
    }
    draftOffer?.let { saved ->
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Continue your draft?") },
            text = { Text(saved.title.ifBlank { "You have a listing you didn't finish." }) },
            confirmButton = {
                TextButton(onClick = {
                    draftOffer = null
                    scope.launch { restoreDraft(saved) }
                }) { Text("Continue") }
            },
            dismissButton = {
                TextButton(onClick = {
                    draftOffer = null
                    scope.launch {
                        drafts.clear()
                        photoStore.clear()
                        // Its draft row on the server goes too (never a listing that was published since).
                        val id = saved.listingId
                        if (saved.listingCreated && id != null) {
                            runCatching {
                                if (repository.getMyListing(id)?.isDraft == true) repository.deleteListing(id)
                            }
                        }
                    }
                }) { Text("Start over") }
            }
        )
    }

    // ---- Moving between the steps ----
    fun next() {
        when (state.step) {
            STEP_PHOTOS -> {
                state.photosGate()?.let { errorMessage = it.message; return }
                if (isNew && !profile.hasLocation) {
                    errorMessage = noLocationToPublish(settings.distanceUnit)
                    return
                }
                errorMessage = null
                // Unchanged photos keep their check; an edit that didn't touch them needs none.
                if (state.photosNeedCheck && (isNew || state.isDraft || state.photosChanged)) startPhotoCheck()
                state.step = STEP_DETAILS
            }
            STEP_DETAILS -> {
                val missing = detailsMissing(state.title.text, state.category, state.itemType, declarationPending)
                if (missing != null) {
                    errorMessage = missing.message
                    if (missing.button == "Sign the declaration") showDeclaration = true
                    return
                }
                errorMessage = null
                state.step = STEP_PRICE
            }
        }
    }

    /** With vision_required on: the check of the photos as they are now, finished, before going live. */
    suspend fun awaitCheck(onProgress: (String) -> Unit) {
        if (!visionRequired) return
        onProgress(CHECKING_PHOTOS)
        val id = runCatching { repository.requestScan(state.listingId) }.getOrNull() ?: return
        withTimeoutOrNull(CHECK_TIMEOUT_MS) { repository.watchScan(id).lastOrNull() }
        // The database's publish gate decides; its words are shown if it says no.
    }

    // ---- Publish ----
    fun publish() {
        state.photosGate()?.let {
            errorMessage = it.message
            state.step = STEP_PHOTOS
            return
        }
        detailsMissing(state.title.text, state.category, state.itemType, declarationPending)?.let {
            errorMessage = it.message
            state.step = STEP_DETAILS
            if (declarationPending) showDeclaration = true
            return
        }
        if (isNew && !profile.hasLocation) {
            errorMessage = noLocationToPublish(settings.distanceUnit)
            return
        }
        step2Missing(state.step2Input(profile.hasLocation || !isNew))?.let {
            errorMessage = it.message
            return
        }
        errorMessage = null
        val base = draftRow() ?: return
        val category = state.category!!
        val ordered = orderedPhotos()
        val draft = ListingDraft(
            listing = base.copy(
                title = state.title.text.trim(),
                category = category,
                itemType = if (state.isAccessory) state.itemType else null,
                listingStyles = state.styles,
                garmentType = state.kind?.key,
                aiReviewNeeded = state.aiReviewNeeded,
                sizeLabel = state.sizeLabel.trim(),
                description = state.description.text.trim(),
                priceUsd = parsePrice(state.priceText),
                priceNote = state.priceNote.trim(),
                retailValue = state.retailValueText.toDoubleOrNull(),
                depositNote = state.depositNote.trim().ifBlank { null },
                autoPausedReason = null,
                photos = emptyList(),
                measurements = emptyList(),
                availability = emptyList(),
                lender = null
            ),
            photos = ordered.map { it.second },
            slots = ordered.map { it.first.key },
            measurements = state.usedMeasurementRows.map { row ->
                ListingMeasurement(
                    id = row.key,
                    listingId = state.listingId,
                    label = row.label.trim(),
                    value = row.valueText.trim().toDouble(),
                    unit = state.unit
                )
            },
            availability = state.ranges.sortedBy { it.start }.map { range ->
                Availability(
                    id = generateUuid(),
                    listingId = state.listingId,
                    startDate = range.start.toString(),
                    endDate = range.end.toString()
                )
            },
            listingDeclarationVersion = AccessoryDeclaration.VERSION.takeIf { state.isAccessory }
        )
        scope.launch {
            publishState = PublishState.Running("Starting...")
            try {
                // The photo upload for the check finishes first, so photos are never uploaded twice.
                syncJob?.join()
                publisher.publish(draft, beforeGoingLive = { progress -> awaitCheck(progress) }) { progress ->
                    publishState = PublishState.Running(progress)
                }
                finished = true
                repository.logSuggestionEvents(state.outcomeEvents(state.listingId))
                drafts.clear()
                // An edit only removes its own copies: a new-listing draft may use the folder too.
                if (isNew) photoStore.clear() else photoStore.delete(draft.photos.filterIsInstance<PhotoItem.New>().map { it.key })
                publishState = PublishState.Idle
                onSaved()
            } catch (e: PublishStepException) {
                val refused = e.cause as? DzirentException
                val column = refused?.field
                if (refused != null && column in LISTING_TEXT_COLUMNS) {
                    // The text filter said no: back to the form, the message under that field, nothing lost.
                    state.textErrors = mapOf(column!! to (refused.message ?: "Please change this text."))
                    state.step = if (column == "title" || column == "description") STEP_DETAILS else STEP_PRICE
                    errorMessage = refused.message
                    publishState = PublishState.Idle
                } else {
                    publishState = PublishState.Failed(e.step, e.message ?: "Please try again.")
                }
            }
        }
    }

    when (val ps = publishState) {
        is PublishState.Running -> {
            LoadingView(message = ps.progress)
            return
        }
        is PublishState.Failed -> {
            PublishFailedView(
                step = ps.step,
                message = ps.message,
                goesLive = isNew || state.isDraft,
                onRetry = { publish() },
                onBackToEdit = { publishState = PublishState.Idle }
            )
            return
        }
        PublishState.Idle -> Unit
    }

    if (showDeclaration) {
        AccessoryDeclarationScreen(
            onSign = { name ->
                repository.recordAccessoryDeclaration(name, AccessoryDeclaration.VERSION, device.appVersion)
                declarationCache.markSigned(profile.id, AccessoryDeclaration.VERSION)
                declarationSigned = true
                showDeclaration = false
            },
            onDismiss = { showDeclaration = false }
        )
    }
    if (showWhatCanIList) WhatCanIListSheet(onDismiss = { showWhatCanIList = false })

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
        ) {
            if (showTitle) {
                Text(
                    text = if (isNew) "Create New Listing" else "Edit Listing",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )
                Spacer(modifier = Modifier.height(16.dp))
            }
            Text(
                text = "Step ${state.step} of 3 · " + when (state.step) {
                    STEP_PHOTOS -> "Photos"
                    STEP_DETAILS -> "Details"
                    else -> "Size, price and dates"
                },
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(8.dp))

            if (isNew && !profile.hasLocation) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(text = noLocationToPublish(settings.distanceUnit), color = MaterialTheme.colorScheme.onErrorContainer)
                        Spacer(modifier = Modifier.height(8.dp))
                        TextButton(onClick = onSetLocation) { Text("Set my location") }
                    }
                }
            }

            errorMessage?.let {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                ) {
                    Text(text = it, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(16.dp))
                }
            }

            val photosMissing = state.photosGate()
            val detailsGap = detailsMissing(state.title.text, state.category, state.itemType, declarationPending)
            when (state.step) {
                STEP_PHOTOS -> {
                    PhotosStep(
                        state = state,
                        photoStore = photoStore,
                        serverWarnings = { slot ->
                            state.slots[slot]?.let { publisher.photoOf(it) }?.let { state.serverWarnings[it.id] }.orEmpty()
                        },
                        onMessage = { errorMessage = it }
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(onClick = { next() }, modifier = Modifier.fillMaxWidth().height(50.dp)) {
                        Text(photosMissing?.button ?: "Next")
                    }
                }
                STEP_DETAILS -> {
                    PhotoCheckBanner(
                        banner = state.banner,
                        onRetry = { checkAgain() },
                        onReplacePhotos = { errorMessage = null; state.step = STEP_PHOTOS }
                    )
                    DetailsStep(state = state, onOpenDeclaration = { showDeclaration = true })
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(onClick = { next() }, modifier = Modifier.fillMaxWidth().height(50.dp)) {
                        Text(detailsGap?.button ?: "Next")
                    }
                    TextButton(onClick = { errorMessage = null; state.step = STEP_PHOTOS }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                        Text("Back to photos")
                    }
                }
                else -> {
                    PhotoCheckBanner(
                        banner = state.banner,
                        onRetry = { checkAgain() },
                        onReplacePhotos = { errorMessage = null; state.step = STEP_PHOTOS }
                    )
                    SizePriceDatesStep(
                        state = state,
                        repository = repository,
                        profile = profile,
                        today = today,
                        onWhatCanIList = { showWhatCanIList = true }
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    val input = state.step2Input(profile.hasLocation || !isNew)
                    val missing = photosMissing ?: detailsGap ?: step2Missing(input)
                    ReadyList(photosDone = photosMissing == null, detailsDone = detailsGap == null, input = input)
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = { publish() },
                        modifier = Modifier.fillMaxWidth().height(50.dp)
                    ) { Text(missing?.button ?: if (isNew || state.isDraft) "Publish listing" else "Save changes") }
                    TextButton(onClick = { errorMessage = null; state.step = STEP_DETAILS }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                        Text("Back to details")
                    }
                }
            }
        }
    }
}

@Composable
private fun PublishFailedView(
    step: String,
    message: String,
    goesLive: Boolean,
    onRetry: () -> Unit,
    onBackToEdit: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Warning,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(48.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Stopped at: $step",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = message, style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = if (goesLive) "Your listing stays hidden until this finishes." else "Your changes aren't all saved yet.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Retry")
        }
        TextButton(onClick = onBackToEdit) { Text("Back to edit") }
    }
}

/** Optional retail value and deposit note, with a deposit tip for valuable pieces. */
@Composable
fun DepositFields(
    retailValueText: String,
    onRetailValueChange: (String) -> Unit,
    depositNote: String,
    onDepositNoteChange: (String) -> Unit,
    retailError: String? = null,
    /** The text filter's refusal for the deposit note, if any. */
    depositNoteError: String? = null
) {
    OutlinedTextField(
        value = retailValueText,
        onValueChange = { input -> onRetailValueChange(input.filter { it.isDigit() || it == '.' }) },
        label = { Text("Retail value (\$) - optional") },
        isError = retailError != null,
        supportingText = retailError?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        singleLine = true,
        modifier = Modifier.fillMaxWidth()
    )
    val retailValue = retailValueText.toDoubleOrNull()
    if (retailError == null && retailValue != null && retailValue >= DzirentPolicy.DEPOSIT_SUGGESTION_USD) {
        Spacer(modifier = Modifier.height(8.dp))
        PolicyNotice(text = DzirentPolicy.DEPOSIT_TIP)
    }
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(
        value = depositNote,
        onValueChange = { if (it.length <= DEPOSIT_NOTE_MAX) onDepositNoteChange(it) },
        label = { Text("Deposit note - optional") },
        placeholder = { Text("e.g. \$40 refundable deposit, cash at pickup") },
        isError = depositNoteError != null,
        supportingText = { Text(depositNoteError ?: "${depositNote.length}/$DEPOSIT_NOTE_MAX") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth()
    )
}
