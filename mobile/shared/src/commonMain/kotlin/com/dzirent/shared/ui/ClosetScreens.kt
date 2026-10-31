package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.*
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch

private data class ClosetData(
    val listings: List<Listing>,
    val rentedOut: Set<String>
)

@Composable
fun MyClosetScreen(
    repository: DzirentRepository,
    onListItem: () -> Unit,
    onOpenListing: (String) -> Unit,
    onEditListing: (String) -> Unit,
    onOpenChat: (String) -> Unit,
    onBrowse: () -> Unit
) {
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "My Closet",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)
        )
        Button(
            onClick = onListItem,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp)
                .height(48.dp)
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("List an item")
        }
        Spacer(modifier = Modifier.height(4.dp))
        DzirentTabRow(selectedTabIndex = selectedTab) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("My Listings") })
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("My Rentals") })
        }
        when (selectedTab) {
            0 -> MyListingsTabContent(
                repository = repository,
                onOpenListing = onOpenListing,
                onEditListing = onEditListing,
                onListItem = onListItem
            )
            else -> MyRentalsTabContent(
                repository = repository,
                onOpenChat = onOpenChat,
                onBrowse = onBrowse
            )
        }
    }
}

@Composable
private fun MyListingsTabContent(
    repository: DzirentRepository,
    onOpenListing: (String) -> Unit,
    onEditListing: (String) -> Unit,
    onListItem: () -> Unit
) {
    var uiState by remember { mutableStateOf<UiState<ClosetData>>(UiState.Loading) }
    var sort by rememberSaveable { mutableStateOf(ClosetSort.NEWEST) }
    var sortMenuOpen by remember { mutableStateOf(false) }
    var busyIds by remember { mutableStateOf(emptySet<String>()) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var pendingDelete by remember { mutableStateOf<Listing?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            uiState = UiState.Loading
            uiState = try {
                val listings = repository.getMyListings()
                val rentedOut = repository.getRentedOutListingIds()
                UiState.Success(ClosetData(listings, rentedOut))
            } catch (e: Exception) {
                UiState.Error(e.userMessage("Failed to load your closet."))
            }
        }
    }

    fun updateListing(id: String, transform: (Listing) -> Listing?) {
        val data = (uiState as? UiState.Success)?.data ?: return
        uiState = UiState.Success(
            data.copy(listings = data.listings.mapNotNull { if (it.id == id) transform(it) else it })
        )
    }

    fun toggleActive(listing: Listing, active: Boolean) {
        scope.launch {
            busyIds = busyIds + listing.id
            actionError = null
            try {
                val status = if (active) "active" else "paused"
                repository.setListingStatus(listing.id, status)
                updateListing(listing.id) { it.copy(status = status) }
            } catch (e: Exception) {
                actionError = e.userMessage("Couldn't update your listing.")
            }
            busyIds = busyIds - listing.id
        }
    }

    fun delete(listing: Listing) {
        scope.launch {
            busyIds = busyIds + listing.id
            actionError = null
            try {
                repository.deleteListing(listing.id)
                updateListing(listing.id) { null }
            } catch (e: Exception) {
                actionError = e.userMessage("Couldn't delete your listing.")
            }
            busyIds = busyIds - listing.id
        }
    }

    LaunchedEffect(Unit) { load() }

    pendingDelete?.let { listing ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            icon = { Icon(Icons.Default.Delete, contentDescription = null) },
            title = { Text("Delete this listing?") },
            text = { Text("\"${listing.title}\" and its photos will be removed for good. Chats about it will be deleted too.") },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    delete(listing)
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            }
        )
    }

    when (val state = uiState) {
        is UiState.Loading -> LoadingView(message = "Loading your closet...")
        is UiState.Error -> ErrorView(message = state.message, onRetry = { load() })
        is UiState.Success -> {
            if (state.data.listings.isEmpty()) {
                EmptyView(
                    title = "Your Closet is Empty",
                    description = "You haven't listed any clothes yet. Share pieces from your wardrobe.",
                    icon = Icons.Default.Checkroom,
                    onAction = onListItem,
                    actionLabel = "List an item"
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val count = state.data.listings.size
                            Text(
                                text = "$count ${if (count == 1) "piece" else "pieces"}",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.weight(1f)
                            )
                            Box {
                                IconButton(onClick = { sortMenuOpen = true }) {
                                    Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Sort: ${sort.label}")
                                }
                                DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                                    ClosetSort.entries.forEach { option ->
                                        DropdownMenuItem(
                                            text = {
                                                Text(option.label, fontWeight = if (option == sort) FontWeight.Bold else FontWeight.Normal)
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
                    }
                    actionError?.let { msg ->
                        item {
                            Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    items(sortCloset(state.data.listings, sort), key = { it.id }) { listing ->
                        val isBusy = listing.id in busyIds
                        val isRented = listing.id in state.data.rentedOut
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpenListing(listing.id) }
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(12.dp)
                            ) {
                                val cover = listing.photos.minByOrNull { it.position }?.storagePath
                                ListingPhoto(
                                    url = cover,
                                    contentDescription = listing.title,
                                    modifier = Modifier.size(64.dp).clip(RoundedCornerShape(8.dp))
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = listing.title,
                                        style = MaterialTheme.typography.titleMedium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    listing.priceUsd?.let {
                                        Text(formatPrice(it), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                                    }
                                    if (isRented) {
                                        AssistChip(
                                            onClick = {},
                                            label = { Text("Currently rented") },
                                            modifier = Modifier.padding(top = 4.dp)
                                        )
                                    }
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Switch(
                                        checked = listing.status == "active",
                                        onCheckedChange = { toggleActive(listing, it) },
                                        enabled = !isBusy
                                    )
                                    Row {
                                        IconButton(onClick = { onEditListing(listing.id) }) {
                                            Icon(Icons.Default.Edit, contentDescription = "Edit")
                                        }
                                        IconButton(onClick = { pendingDelete = listing }) {
                                            Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MyRentalsTabContent(
    repository: DzirentRepository,
    onOpenChat: (String) -> Unit,
    onBrowse: () -> Unit
) {
    var uiState by remember { mutableStateOf<UiState<List<Rental>>>(UiState.Loading) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            uiState = UiState.Loading
            uiState = try {
                UiState.Success(repository.getMyRentals())
            } catch (e: Exception) {
                UiState.Error(e.userMessage("Failed to load your rentals."))
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    when (val state = uiState) {
        is UiState.Loading -> LoadingView(message = "Loading rentals...")
        is UiState.Error -> ErrorView(message = state.message, onRetry = { load() })
        is UiState.Success -> {
            if (state.data.isEmpty()) {
                EmptyView(
                    title = "No rentals yet",
                    description = "When you rent pieces or someone rents from you, they show up here.",
                    icon = Icons.Default.Checkroom,
                    onAction = onBrowse,
                    actionLabel = "Browse Home"
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(state.data) { rental ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpenChat(rental.conversationId) }
                        ) {
                            ListItem(
                                headlineContent = {
                                    Text("Rental status: ${rental.status.replaceFirstChar { it.uppercase() }}")
                                },
                                supportingContent = {
                                    if (rental.startDate != null && rental.endDate != null) {
                                        Text("Dates: ${rental.startDate} – ${rental.endDate}")
                                    }
                                },
                                leadingContent = {
                                    Icon(Icons.Default.Checkroom, contentDescription = null)
                                },
                                trailingContent = {
                                    Icon(Icons.Default.ChevronRight, contentDescription = null)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

