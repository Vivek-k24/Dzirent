package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.DateRange
import com.dzirent.shared.model.ListingCard
import com.dzirent.shared.model.Profile
import com.dzirent.shared.ui.theme.DzirentAccent
import kotlinx.coroutines.launch
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Home: top bar (avatar, logo, location), sticky date chip, rows ("Likely to fit you",
 * "New near you", "Under $15", "From studios you saved"), then Products and Studios tabs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    session: BrowseSession,
    profile: Profile?,
    isGuest: Boolean,
    guestCity: String?,
    guestLat: Double?,
    guestLng: Double?,
    onOpenSidebar: () -> Unit,
    onSetLocation: () -> Unit,
    onOpenListing: (String) -> Unit,
    onOpenStudio: (String) -> Unit,
    onSeeAll: (HomeRow) -> Unit,
    onOpenMeasurements: () -> Unit,
    onAuthRequired: (GatedAction) -> Unit
) {
    val lat = if (isGuest) guestLat else profile?.approxLat
    val lng = if (isGuest) guestLng else profile?.approxLng
    val city = if (isGuest) guestCity else profile?.city

    val scope = rememberCoroutineScope()
    var showDatePicker by remember { mutableStateOf(false) }
    var studiosTab by rememberSaveable { mutableStateOf(false) }
    val radiusMiles = session.filters.distanceStep.toDouble()

    LaunchedEffect(lat, lng, radiusMiles, session.filters, session.dates) {
        if (lat != null && lng != null) {
            session.load(lat, lng, radiusMiles)
        }
    }

    if (showDatePicker) {
        DateRangePickerDialog(
            title = "Your dates",
            initial = session.dates,
            confirmLabel = "Done",
            onDismiss = { showDatePicker = false },
            onConfirm = { range ->
                session.dates = range
                showDatePicker = false
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        HomeTopBar(
            profile = profile,
            isGuest = isGuest,
            city = city,
            onAvatar = onOpenSidebar,
            onLocation = onSetLocation
        )
        DateBar(text = formatDateChip(session.dates), onClick = { showDatePicker = true })

        if (lat == null || lng == null) {
            EmptyView(
                title = "Set your location",
                description = "Dzirent shows clothes from closets near you. Set your approximate location to start browsing.",
                icon = Icons.Default.LocationOff,
                onAction = onSetLocation,
                actionLabel = "Set my location"
            )
            return@Column
        }

        when (val state = session.state) {
            is UiState.Loading -> LoadingView(message = "Finding pieces near you...")
            is UiState.Error -> ErrorView(
                message = state.message,
                onRetry = { scope.launch { session.load(lat, lng, radiusMiles, force = true) } }
            )
            is UiState.Success -> {
                val sections = remember(state, session.filters, session.dates) { session.sections() } ?: return@Column
                HomeContent(
                    sections = sections,
                    hasMeasurements = !isGuest && sections.likelyFit != null,
                    studiosTab = studiosTab,
                    onTabChange = { studiosTab = it },
                    onOpenListing = onOpenListing,
                    onOpenStudio = { handle ->
                        if (isGuest) {
                            onAuthRequired(GatedAction.OPEN_STUDIO)
                        } else {
                            onOpenStudio(handle)
                        }
                    },
                    onSeeAll = onSeeAll,
                    onOpenMeasurements = {
                        if (isGuest) {
                            onAuthRequired(GatedAction.FIT_MATCHING)
                        } else {
                            onOpenMeasurements()
                        }
                    }
                )
            }
        }
    }
}

@Composable
fun HomeTopBar(
    profile: Profile?,
    isGuest: Boolean,
    city: String?,
    onAvatar: () -> Unit,
    onLocation: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(horizontal = 8.dp)
    ) {
        IconButton(
            onClick = onAvatar,
            modifier = Modifier.align(Alignment.CenterStart)
        ) {
            Avatar(name = if (!isGuest && profile != null) profile.displayName else "?", size = 32.dp)
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.Center)
                .semantics(mergeDescendants = true) { contentDescription = "Dzirent" }
        ) {
            LogoMark(modifier = Modifier.size(22.dp))
            Spacer(modifier = Modifier.width(6.dp))
            LogoWordmark()
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onLocation)
                .padding(horizontal = 4.dp, vertical = 8.dp)
                .widthIn(max = 130.dp)
        ) {
            Icon(Icons.Default.LocationOn, contentDescription = "Location")
            Spacer(modifier = Modifier.width(2.dp))
            Text(
                text = city?.ifBlank { null } ?: "Set location",
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun DateBar(text: String, onClick: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp)
        ) {
            Surface(
                onClick = onClick,
                shape = RoundedCornerShape(50),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Icon(Icons.Default.CalendarToday, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = text, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
    HorizontalDivider(thickness = 0.5.dp)
}

@Composable
private fun HomeContent(
    sections: HomeSections,
    hasMeasurements: Boolean,
    studiosTab: Boolean,
    onTabChange: (Boolean) -> Unit,
    onOpenListing: (String) -> Unit,
    onOpenStudio: (String) -> Unit,
    onSeeAll: (HomeRow) -> Unit,
    onOpenMeasurements: () -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        if (!hasMeasurements) {
            fullWidth("measure-card") {
                MeasurementsPromptCard(onClick = onOpenMeasurements)
            }
        }
        HomeRow.entries.forEach { row ->
            val listings = row.listings(sections)
            if (listings.size >= HOME_ROW_MIN) {
                fullWidth("row-${row.name}") {
                    HomeRowSection(
                        row = row,
                        listings = listings,
                        onSeeAll = { onSeeAll(row) },
                        onOpenListing = onOpenListing
                    )
                }
            }
        }
        fullWidth("tabs") {
            DzirentTabRow(selectedTabIndex = if (studiosTab) 1 else 0) {
                Tab(selected = !studiosTab, onClick = { onTabChange(false) }, text = { Text("Products") })
                Tab(selected = studiosTab, onClick = { onTabChange(true) }, text = { Text("Studios") })
            }
        }
        if (sections.visible.isEmpty()) {
            fullWidth("empty-results") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No pieces found nearby matching your filters.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else if (studiosTab) {
            items(sections.studios, key = { it.studioHandle ?: it.studioName }) { studio ->
                StudioCard(
                    studio = studio,
                    onClick = studio.studioHandle?.let { handle -> { onOpenStudio(handle) } }
                )
            }
        } else {
            items(sections.visible, key = { it.id }) { listing ->
                ListingCard(listing = listing, onClick = { onOpenListing(listing.id) })
            }
        }
    }
}

private fun LazyGridScope.fullWidth(key: String, content: @Composable () -> Unit) {
    item(key = key, span = { GridItemSpan(maxLineSpan) }) { content() }
}

@Composable
fun MeasurementsPromptCard(onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)
        ) {
            Text(
                text = "Add your measurements to see what fits you",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f)
            )
            Icon(Icons.Default.ChevronRight, contentDescription = null)
        }
    }
}

@Composable
fun HomeRowSection(
    row: HomeRow,
    listings: List<ListingCard>,
    onSeeAll: () -> Unit,
    onOpenListing: (String) -> Unit
) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = row.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (row == HomeRow.FIT) DzirentAccent else MaterialTheme.colorScheme.onSurface
                )
                row.subtitle?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            TextButton(onClick = onSeeAll) { Text("See all") }
        }
        Spacer(modifier = Modifier.height(8.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(listings, key = { it.id }) { listing ->
                ListingCard(
                    listing = listing,
                    onClick = { onOpenListing(listing.id) },
                    modifier = Modifier.width(140.dp)
                )
            }
        }
    }
}

@Composable
fun StudioCard(studio: StudioSummary, onClick: (() -> Unit)?) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(vertical = 12.dp)
    ) {
        Avatar(name = studio.studioName, size = 64.dp)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = studio.studioName,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = listOfNotNull(
                "${studio.pieceCount} ${if (studio.pieceCount == 1) "piece" else "pieces"}",
                studio.distance?.let { formatDistance(it) }
            ).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/** Single listing card for Home, Search, and See All. */
@Composable
fun ListingCard(listing: ListingCard, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onClick() }
    ) {
        ListingPhoto(
            url = listing.coverPhotoPath,
            contentDescription = listing.title,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(3f / 4f)
                .clip(RoundedCornerShape(8.dp))
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = listing.title,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = cardSubtitle(listing.price, listing.distance),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SeeAllScreen(
    session: BrowseSession,
    row: HomeRow,
    onBack: () -> Unit,
    onOpenListing: (String) -> Unit
) {
    val listings = session.sections()?.let { row.listings(it) }.orEmpty()
    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(row.title) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        if (listings.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize().padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No pieces currently in ${row.title}.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(listings, key = { it.id }) { listing ->
                    ListingCard(listing = listing, onClick = { onOpenListing(listing.id) })
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateRangePickerDialog(
    title: String,
    initial: DateRange? = null,
    confirmLabel: String = "Done",
    onDismiss: () -> Unit,
    onConfirm: (DateRange) -> Unit
) {
    val state = rememberDateRangePickerState(
        initialSelectedStartDateMillis = initial?.start?.let {
            Instant.fromEpochMilliseconds(it.toEpochDays() * 86_400_000L).toEpochMilliseconds()
        },
        initialSelectedEndDateMillis = initial?.end?.let {
            Instant.fromEpochMilliseconds(it.toEpochDays() * 86_400_000L).toEpochMilliseconds()
        }
    )
    val startMillis = state.selectedStartDateMillis

    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    val sMillis = startMillis ?: return@TextButton
                    val eMillis = state.selectedEndDateMillis ?: sMillis
                    val sDate = Instant.fromEpochMilliseconds(sMillis)
                        .toLocalDateTime(TimeZone.UTC).date
                    val eDate = Instant.fromEpochMilliseconds(eMillis)
                        .toLocalDateTime(TimeZone.UTC).date
                    onConfirm(DateRange(sDate, maxOf(sDate, eDate)))
                },
                enabled = startMillis != null
            ) { Text(confirmLabel) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    ) {
        DateRangePicker(
            state = state,
            title = { Text(title, modifier = Modifier.padding(start = 24.dp, end = 12.dp, top = 16.dp)) },
            showModeToggle = false,
            modifier = Modifier.weight(1f)
        )
    }
}

