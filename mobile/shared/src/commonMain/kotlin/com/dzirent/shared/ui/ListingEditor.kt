package com.dzirent.shared.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.*
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ListingEditorScreen(
    repository: DzirentRepository,
    profile: Profile?,
    listingId: String?,
    onSetLocation: () -> Unit,
    onBack: () -> Unit,
    onSaved: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var loadState by remember(listingId) {
        mutableStateOf<UiState<Listing?>>(if (listingId == null) UiState.Success(null) else UiState.Loading)
    }

    var title by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf(Categories.ALL.first()) }
    var itemType by rememberSaveable { mutableStateOf<String?>(null) }
    var sizeLabel by rememberSaveable { mutableStateOf("M") }
    var priceText by rememberSaveable { mutableStateOf("") }
    var priceNote by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var styles by rememberSaveable { mutableStateOf(listOf<String>()) }
    var measurementUnit by rememberSaveable { mutableStateOf("in") }
    var measurementRows by remember { mutableStateOf(listOf<MeasurementRow>()) }
    var availabilityRanges by remember { mutableStateOf(listOf<DateRange>()) }

    var accessoryDeclarationChecked by rememberSaveable { mutableStateOf(false) }
    var showDeclarationModal by remember { mutableStateOf(false) }
    var hasSignedDeclaration by remember { mutableStateOf(false) }

    var isSaving by remember { mutableStateOf(false) }
    var showValidationErrors by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    fun loadListing() {
        if (listingId == null) {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            availabilityRanges = listOf(DateRange(today, today))
            return
        }
        scope.launch {
            loadState = UiState.Loading
            loadState = try {
                val detail = repository.getListingDetail(listingId)
                if (detail != null) {
                    title = detail.title
                    category = detail.category
                    itemType = detail.itemType
                    sizeLabel = detail.sizeLabel
                    priceText = detail.priceUsd?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() } ?: ""
                    priceNote = detail.priceNote
                    description = detail.description
                    styles = detail.listingStyles
                    measurementRows = detail.measurements.map {
                        MeasurementRow(id = it.id ?: generateListingRowId(), label = it.label, valueText = it.value.toString())
                    }
                    measurementUnit = detail.measurements.firstOrNull()?.unit ?: "in"
                    availabilityRanges = detail.availability.mapNotNull { parseDateRange(it.startDate, it.endDate) }
                    UiState.Success(detail)
                } else {
                    UiState.Error("Listing not found.")
                }
            } catch (e: Exception) {
                UiState.Error(e.userMessage("Couldn't load listing."))
            }
        }
    }

    LaunchedEffect(listingId) {
        loadListing()
        hasSignedDeclaration = runCatching { repository.hasAccessoryDeclaration(AccessoryDeclaration.VERSION) }.getOrDefault(false)
    }

    if (showDeclarationModal) {
        AccessoryDeclarationScreen(
            onSign = { legalName ->
                repository.recordAccessoryDeclaration(legalName, AccessoryDeclaration.VERSION, "1.0.0")
                hasSignedDeclaration = true
                accessoryDeclarationChecked = true
            },
            onDismiss = { showDeclarationModal = false }
        )
    }

    fun saveListing() {
        showValidationErrors = true
        errorMessage = null

        if (profile?.hasLocation != true) {
            errorMessage = "Please set your location before publishing."
            return
        }

        val price = priceText.trim().toDoubleOrNull()
        val mInputs = measurementRows.map { it.toInput() }
        val validation = validateListingForm(title, price, mInputs)
        if (!validation.isValid) {
            errorMessage = validation.firstError ?: "Please fix errors in the form."
            return
        }

        if (category == Categories.ACCESSORIES && !accessoryDeclarationChecked) {
            if (!hasSignedDeclaration) {
                showDeclarationModal = true
            } else {
                errorMessage = "Please confirm the accessory declaration checkbox."
            }
            return
        }

        scope.launch {
            isSaving = true
            try {
                val listingToSave = Listing(
                    id = listingId ?: "",
                    lenderId = profile.id,
                    title = title.trim(),
                    category = category,
                    itemType = itemType,
                    sizeLabel = sizeLabel.trim(),
                    description = description.trim(),
                    priceUsd = price,
                    priceNote = priceNote.trim(),
                    city = profile.city,
                    approxLat = profile.approxLat ?: 0.0,
                    approxLng = profile.approxLng ?: 0.0,
                    listingStyles = styles
                )

                val saved = if (listingId == null) {
                    repository.createListing(listingToSave)
                } else {
                    repository.updateListing(listingToSave)
                }

                // Save measurements
                val cleanMeasurements = measurementRows.mapNotNull { row ->
                    val v = row.valueText.trim().toDoubleOrNull()
                    if (row.label.isNotBlank() && v != null) {
                        ListingMeasurement(
                            listingId = saved.id,
                            label = row.label.trim(),
                            value = v,
                            unit = measurementUnit
                        )
                    } else null
                }
                repository.saveListingMeasurements(saved.id, cleanMeasurements)

                // Save availability
                val cleanAvailability = availabilityRanges.map { range ->
                    Availability(
                        listingId = saved.id,
                        startDate = range.start.toString(),
                        endDate = range.end.toString()
                    )
                }
                repository.saveAvailability(saved.id, cleanAvailability)

                if (category == Categories.ACCESSORIES) {
                    runCatching { repository.recordListingDeclaration(saved.id, AccessoryDeclaration.VERSION) }
                }

                onSaved()
            } catch (e: Exception) {
                errorMessage = e.userMessage("Couldn't save your listing. Please try again.")
            }
            isSaving = false
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(if (listingId == null) "New Listing" else "Edit Listing") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )

        when (val state = loadState) {
            is UiState.Loading -> LoadingView(message = "Loading listing...")
            is UiState.Error -> ErrorView(message = state.message, onRetry = { loadListing() })
            is UiState.Success -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 24.dp, vertical = 8.dp)
                ) {
                    // Title
                    Text("Title", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    OutlinedTextField(
                        value = title,
                        onValueChange = { if (it.length <= 80) title = it },
                        label = { Text("Title (3-80 characters)") },
                        supportingText = { Text("${title.length}/80") },
                        isError = showValidationErrors && title.trim().length !in 3..80,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    // Category
                    Text("Category", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Categories.ALL.forEach { cat ->
                            FilterChip(
                                selected = category == cat,
                                onClick = { category = cat },
                                label = { Text(cat) }
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))

                    // Item type if Accessories
                    if (category == Categories.ACCESSORIES) {
                        Text("Accessory type", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(8.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            AccessoryTypes.ALL.forEach { type ->
                                FilterChip(
                                    selected = itemType == type,
                                    onClick = { itemType = type },
                                    label = { Text(type) }
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    // Size label
                    Text("Size", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    OutlinedTextField(
                        value = sizeLabel,
                        onValueChange = { sizeLabel = it },
                        label = { Text("Size label (e.g. S, M, L, 32, One Size)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    // Price
                    Text("Price per day", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    OutlinedTextField(
                        value = priceText,
                        onValueChange = { priceText = it },
                        label = { Text("Price ($ USD)") },
                        prefix = { Text("$") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = priceNote,
                        onValueChange = { if (it.length <= PRICE_NOTE_MAX) priceNote = it },
                        label = { Text("Price details (optional)") },
                        supportingText = { Text("${priceNote.length}/$PRICE_NOTE_MAX") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    // Description
                    Text("Description", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    OutlinedTextField(
                        value = description,
                        onValueChange = { if (it.length <= DESCRIPTION_MAX) description = it },
                        label = { Text("Describe the piece (optional)") },
                        supportingText = { Text("${description.length}/$DESCRIPTION_MAX") },
                        minLines = 3,
                        maxLines = 6,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(16.dp))

                    // Style tags
                    Text("Styles (up to ${FashionStyles.LISTING_MAX})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FashionStyles.ALL.forEach { s ->
                            val selected = s in styles
                            FilterChip(
                                selected = selected,
                                onClick = {
                                    styles = if (selected) styles - s
                                    else if (styles.size < FashionStyles.LISTING_MAX) styles + s
                                    else styles
                                },
                                label = { Text(s) }
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))

                    // Measurements
                    MeasurementsSection(
                        unit = measurementUnit,
                        onUnitChange = { measurementUnit = it },
                        rows = measurementRows,
                        onRowsChange = { measurementRows = it },
                        showAllErrors = showValidationErrors
                    )
                    Spacer(modifier = Modifier.height(16.dp))

                    // Availability
                    AvailabilitySection(
                        ranges = availabilityRanges,
                        onRangesChange = { availabilityRanges = it }
                    )
                    Spacer(modifier = Modifier.height(16.dp))

                    // Accessory declaration
                    if (category == Categories.ACCESSORIES) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(AccessoryDeclaration.TITLE, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Checkbox(
                                        checked = accessoryDeclarationChecked,
                                        onCheckedChange = { checked ->
                                            if (checked && !hasSignedDeclaration) {
                                                showDeclarationModal = true
                                            } else {
                                                accessoryDeclarationChecked = checked
                                            }
                                        }
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = AccessoryDeclaration.LISTING_CHECKBOX,
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    errorMessage?.let {
                        Text(
                            text = it,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { saveListing() },
                        enabled = !isSaving,
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) {
                        Text(if (isSaving) "Saving..." else if (listingId == null) "Publish listing" else "Save changes")
                    }
                    Spacer(modifier = Modifier.height(32.dp))
                }
            }
        }
    }
}

private fun generateListingRowId(): String =
    "row_${kotlin.random.Random.nextInt(100000)}"

