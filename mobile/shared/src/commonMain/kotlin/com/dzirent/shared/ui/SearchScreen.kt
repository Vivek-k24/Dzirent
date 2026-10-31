package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.ListingCard
import com.dzirent.shared.model.Profile
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun SearchScreen(
    repository: DzirentRepository,
    session: BrowseSession,
    profile: Profile?,
    isGuest: Boolean,
    guestCity: String?,
    guestLat: Double?,
    guestLng: Double?,
    onSetLocation: () -> Unit,
    onOpenListing: (String) -> Unit
) {
    val lat = if (isGuest) guestLat else profile?.approxLat
    val lng = if (isGuest) guestLng else profile?.approxLng

    var query by rememberSaveable { mutableStateOf("") }
    var recentSearches by rememberSaveable { mutableStateOf(listOf("Evening Dress", "Designer Bag", "Cocktail")) }
    var sort by rememberSaveable { mutableStateOf(SearchSort.NEAREST) }
    var sortMenuOpen by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showFilters by remember { mutableStateOf(false) }
    var anyDates by rememberSaveable { mutableStateOf(false) }

    val focusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()

    var searchResults by remember { mutableStateOf<List<ListingCard>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var searchError by remember { mutableStateOf<String?>(null) }

    val radiusMiles = session.filters.distanceStep.toDouble()

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    suspend fun executeSearch(text: String) {
        if (lat == null || lng == null) return
        isSearching = true
        searchError = null
        try {
            val results = repository.browseListings(
                query = text.trim().ifBlank { null },
                lat = lat,
                lng = lng,
                radiusMiles = radiusMiles,
                category = session.filters.category,
                itemType = session.filters.itemType,
                size = session.filters.size,
                minPrice = session.filters.minPrice,
                maxPrice = session.filters.maxPrice,
                startDate = if (anyDates) null else session.dates.start.toString(),
                endDate = if (anyDates) null else session.dates.end.toString(),
                sort = sort.dbSort,
                limit = 30
            )
            searchResults = results
        } catch (e: Exception) {
            searchError = e.userMessage("Couldn't search listings. Please try again.")
        } finally {
            isSearching = false
        }
    }

    // Debounced search when query, filters, or sort change
    LaunchedEffect(query, session.filters, session.dates, anyDates, sort, lat, lng) {
        if (query.trim().isBlank()) {
            searchResults = emptyList()
            return@LaunchedEffect
        }
        delay(350)
        executeSearch(query)
    }

    fun saveRecent(q: String) {
        val trimmed = q.trim()
        if (trimmed.isNotBlank() && trimmed !in recentSearches) {
            recentSearches = (listOf(trimmed) + recentSearches).take(10)
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
                anyDates = false
                showDatePicker = false
            }
        )
    }

    if (showFilters) {
        FilterSheet(
            current = session.filters,
            onApply = { applied ->
                session.filters = applied
                showFilters = false
            },
            onDismiss = { showFilters = false }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { if (it.length <= 80) query = it },
            placeholder = { Text("Search pieces") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { query = "" }) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear search")
                    }
                }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = {
                saveRecent(query)
                focusManager.clearFocus()
                scope.launch { executeSearch(query) }
            }),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .focusRequester(focusRequester)
        )

        if (query.isBlank()) {
            RecentSearches(
                recent = recentSearches,
                onPick = { picked ->
                    query = picked
                    saveRecent(picked)
                    focusManager.clearFocus()
                },
                onClear = { recentSearches = emptyList() }
            )
            return@Column
        }

        if (lat == null || lng == null) {
            EmptyView(
                title = "Set your location",
                description = "Search looks at pieces near you. Set your approximate location first.",
                icon = Icons.Default.LocationOff,
                onAction = onSetLocation,
                actionLabel = "Set my location"
            )
            return@Column
        }

        // Active filter chips and "Filter results" button
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
        ) {
            LazyRow(
                contentPadding = PaddingValues(start = 16.dp, end = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f)
            ) {
                item(key = "dates") {
                    if (anyDates) {
                        AssistChip(
                            onClick = { showDatePicker = true },
                            label = { Text("Any dates") },
                            leadingIcon = {
                                Icon(Icons.Default.CalendarToday, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                        )
                    } else {
                        InputChip(
                            selected = false,
                            onClick = { anyDates = true },
                            label = { Text(formatDateChip(session.dates)) },
                            leadingIcon = {
                                Icon(Icons.Default.CalendarToday, contentDescription = null, modifier = Modifier.size(16.dp))
                            },
                            trailingIcon = {
                                Icon(Icons.Default.Close, contentDescription = "Remove dates", modifier = Modifier.size(16.dp))
                            }
                        )
                    }
                }

                session.filters.category?.let { cat ->
                    item(key = "cat") {
                        InputChip(
                            selected = false,
                            onClick = { session.filters = session.filters.withCategory(null) },
                            label = { Text(cat) },
                            trailingIcon = {
                                Icon(Icons.Default.Close, contentDescription = "Remove category", modifier = Modifier.size(16.dp))
                            }
                        )
                    }
                }

                session.filters.itemType?.let { itemType ->
                    item(key = "itemType") {
                        InputChip(
                            selected = false,
                            onClick = { session.filters = session.filters.copy(itemType = null) },
                            label = { Text(itemType) },
                            trailingIcon = {
                                Icon(Icons.Default.Close, contentDescription = "Remove item type", modifier = Modifier.size(16.dp))
                            }
                        )
                    }
                }

                session.filters.size?.let { size ->
                    item(key = "size") {
                        InputChip(
                            selected = false,
                            onClick = { session.filters = session.filters.copy(size = null) },
                            label = { Text("Size $size") },
                            trailingIcon = {
                                Icon(Icons.Default.Close, contentDescription = "Remove size", modifier = Modifier.size(16.dp))
                            }
                        )
                    }
                }
            }

            TextButton(
                onClick = { showFilters = true },
                contentPadding = PaddingValues(horizontal = 12.dp),
                modifier = Modifier.padding(end = 8.dp)
            ) {
                Icon(Icons.Default.Tune, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Filter")
            }
        }

        if (isSearching) {
            LoadingView(message = "Searching...")
            return@Column
        }

        searchError?.let { err ->
            ErrorView(message = err, onRetry = { scope.launch { executeSearch(query) } })
            return@Column
        }

        if (searchResults.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize().padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No pieces found matching \"$query\".",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            return@Column
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(start = 16.dp, end = 4.dp, bottom = 8.dp)
        ) {
            Text(
                text = "${searchResults.size} ${if (searchResults.size == 1) "result" else "results"}",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f)
            )
            Box {
                IconButton(onClick = { sortMenuOpen = true }) {
                    Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Sort: ${sort.label}")
                }
                DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                    SearchSort.entries.forEach { option ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    option.label,
                                    fontWeight = if (option == sort) FontWeight.Bold else FontWeight.Normal
                                )
                            },
                            onClick = {
                                sort = option
                                sortMenuOpen = false
                            }
                        )
                    }
                }
            }
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(searchResults, key = { it.id }) { listing ->
                ListingCard(
                    listing = listing,
                    onClick = {
                        saveRecent(query)
                        onOpenListing(listing.id)
                    }
                )
            }
        }
    }
}

@Composable
private fun RecentSearches(recent: List<String>, onPick: (String) -> Unit, onClear: () -> Unit) {
    if (recent.isEmpty()) {
        Text(
            text = "Search titles and descriptions of pieces near you.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        )
        return
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(start = 16.dp, end = 8.dp)
    ) {
        Text(
            text = "Recent searches",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f)
        )
        TextButton(onClick = onClear) { Text("Clear") }
    }
    recent.forEach { item ->
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onPick(item) }
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            Icon(
                Icons.Default.History,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(item, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

