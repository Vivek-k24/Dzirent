package com.dzirent.shared.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.AvailabilityRange
import com.dzirent.shared.model.ListingDetail
import com.dzirent.shared.model.ListingMeasurementDetail
import com.dzirent.shared.model.ListingPhotoDetail
import com.dzirent.shared.platform.MeasureUnit
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListingDetailScreen(
    repository: DzirentRepository,
    listingId: String,
    currentUserId: String?,
    isGuest: Boolean,
    guestLat: Double? = null,
    guestLng: Double? = null,
    onBack: () -> Unit,
    onEdit: (listingId: String) -> Unit,
    onMessageLender: (listingId: String) -> Unit,
    onOpenStudio: (studioHandle: String) -> Unit,
    onAuthRequired: (GatedAction) -> Unit
) {
    var uiState by remember { mutableStateOf<UiState<ListingDetail>>(UiState.Loading) }
    var isSaved by remember { mutableStateOf(false) }
    var savingBookmark by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun loadDetail() {
        scope.launch {
            uiState = UiState.Loading
            try {
                val detail = repository.getListing(
                    listingId = listingId,
                    lat = guestLat,
                    lng = guestLng
                )
                if (detail != null) {
                    uiState = UiState.Success(detail)
                    if (!isGuest && currentUserId != null) {
                        isSaved = repository.isListingSaved(listingId)
                    }
                } else {
                    uiState = UiState.Error("Listing not found.")
                }
            } catch (e: Exception) {
                uiState = UiState.Error(e.userMessage("Failed to load listing details."))
            }
        }
    }

    LaunchedEffect(listingId) {
        loadDetail()
    }

    fun toggleSaved() {
        if (isGuest) {
            onAuthRequired(GatedAction.SAVE_PIECE)
            return
        }
        if (savingBookmark) return
        scope.launch {
            savingBookmark = true
            try {
                if (isSaved) {
                    repository.unsaveListing(listingId)
                    isSaved = false
                } else {
                    repository.saveListing(listingId)
                    isSaved = true
                }
            } catch (_: Exception) {
            } finally {
                savingBookmark = false
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Listing Details") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            },
            actions = {
                val loaded = (uiState as? UiState.Success)?.data
                if (loaded != null) {
                    IconButton(onClick = { toggleSaved() }, enabled = !savingBookmark) {
                        Icon(
                            imageVector = if (isSaved) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                            contentDescription = if (isSaved) "Remove from Saved" else "Save piece",
                            tint = if (isSaved) MaterialTheme.colorScheme.primary else LocalContentColor.current
                        )
                    }
                }
            }
        )

        when (val state = uiState) {
            is UiState.Loading -> LoadingView(message = "Loading listing...")
            is UiState.Error -> ErrorView(message = state.message, onRetry = { loadDetail() })
            is UiState.Success -> {
                val listing = state.data
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp)
                ) {
                    PhotoCarousel(photos = listing.photos, title = listing.title)
                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = listing.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))

                    Text(
                        text = listOfNotNull(
                            listOfNotNull(listing.category, listing.itemType).joinToString(" · "),
                            listing.sizeLabel.ifBlank { null }?.let { "Size $it" }
                        ).joinToString(" | "),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.secondary
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = listing.price?.let { formatPrice(it) } ?: "Contact lender",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )

                    if (listing.priceNote.isNotBlank()) {
                        Text(
                            text = listing.priceNote,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))

                    // Studio Header
                    val studioHandle = listing.studioHandle
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                if (isGuest) {
                                    onAuthRequired(GatedAction.OPEN_STUDIO)
                                } else if (!studioHandle.isNullOrBlank()) {
                                    onOpenStudio(studioHandle)
                                }
                            }
                            .padding(vertical = 4.dp)
                    ) {
                        Avatar(name = listing.studioName ?: "Studio", size = 32.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = listing.studioName?.ifBlank { null } ?: "Studio",
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = listOfNotNull(
                                    studioHandle?.let { "@$it" },
                                    listing.city.ifBlank { null },
                                    formatDistance(listing.distance)
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Icon(
                            imageVector = Icons.Default.ChevronRight,
                            contentDescription = "Open studio",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    DetailSection("Description") {
                        Text(
                            text = listing.description.ifBlank { "No description provided." },
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }

                    if (listing.measurements.isNotEmpty()) {
                        DetailSection("Measurements") {
                            MeasurementsTable(listing.measurements)
                        }
                    }

                    DetailSection("Available dates") {
                        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
                        val upcoming = listing.availability.filter {
                            runCatching { LocalDate.parse(it.endDate) >= today }.getOrDefault(true)
                        }
                        if (upcoming.isEmpty()) {
                            Text(
                                text = if (listing.availability.isEmpty()) "Ask lender about dates" else "No upcoming dates. Ask lender in chat.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            upcoming.forEach { range ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(vertical = 2.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.DateRange,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "${range.startDate} to ${range.endDate}",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            }
                        }
                    }

                    val deposit = listing.depositNote
                    if (!deposit.isNullOrBlank()) {
                        DetailSection("Deposit") {
                            Text(text = deposit, style = MaterialTheme.typography.bodyMedium)
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                    PolicyNotice(text = DzirentPolicy.LISTING_NOTICE)
                    Spacer(modifier = Modifier.height(12.dp))

                    Button(
                        onClick = {
                            if (isGuest) {
                                onAuthRequired(GatedAction.MESSAGE_LENDER)
                            } else {
                                onMessageLender(listing.id)
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(50.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Message Lender")
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }
        }
    }
}

@Composable
private fun DetailSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
    Text(text = title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    Spacer(modifier = Modifier.height(8.dp))
    Column(content = content)
}

@Composable
private fun PhotoCarousel(photos: List<ListingPhotoDetail>, title: String) {
    val shape = RoundedCornerShape(12.dp)
    if (photos.isEmpty()) {
        NoPhotoPlaceholder(
            modifier = Modifier
                .fillMaxWidth()
                .height(260.dp)
                .clip(shape)
        )
        return
    }
    val pagerState = rememberPagerState { photos.size }
    HorizontalPager(
        state = pagerState,
        modifier = Modifier
            .fillMaxWidth()
            .height(320.dp)
            .clip(shape)
    ) { page ->
        ListingPhoto(
            url = photos[page].storagePath,
            contentDescription = "$title, photo ${page + 1} of ${photos.size}",
            modifier = Modifier.fillMaxSize()
        )
    }
    if (photos.size > 1) {
        Row(
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
        ) {
            repeat(photos.size) { index ->
                val selected = pagerState.currentPage == index
                Box(
                    modifier = Modifier
                        .padding(horizontal = 3.dp)
                        .size(if (selected) 8.dp else 6.dp)
                        .clip(CircleShape)
                        .background(
                            if (selected) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.outlineVariant
                        )
                )
            }
        }
    }
}

@Composable
private fun MeasurementsTable(measurements: List<ListingMeasurementDetail>) {
    val unit = LocalAppSettings.current.measureUnit
    Column {
        measurements.forEachIndexed { index, m ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(modifier = Modifier.padding(vertical = 8.dp)) {
                Text(
                    text = m.label,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f)
                )
                val displayValue = if (m.unit == "cm" && unit == MeasureUnit.INCHES) {
                    val inches = m.value / 2.54
                    val rounded = (inches * 10).toLong() / 10.0
                    "$rounded in"
                } else if (m.unit == "in" && unit == MeasureUnit.CENTIMETERS) {
                    val cm = m.value * 2.54
                    val rounded = (cm * 10).toLong() / 10.0
                    "$rounded cm"
                } else {
                    "${m.value} ${m.unit}"
                }
                Text(
                    text = displayValue,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

