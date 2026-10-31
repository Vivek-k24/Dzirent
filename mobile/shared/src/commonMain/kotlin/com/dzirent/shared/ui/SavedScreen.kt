package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.ListingCard
import com.dzirent.shared.model.SavedStudioCard
import com.dzirent.shared.model.UiState
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch

private data class SavedData(
    val pieces: List<ListingCard>,
    val studios: List<SavedStudioCard>
)

/**
 * Saved: saved Pieces and saved Studios.
 */
@Composable
fun SavedScreen(
    repository: DzirentRepository,
    lat: Double? = null,
    lng: Double? = null,
    onOpenListing: (String) -> Unit,
    onOpenStudio: (String) -> Unit,
    onBrowse: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var uiState by remember { mutableStateOf<UiState<SavedData>>(UiState.Loading) }
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    var actionError by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            uiState = UiState.Loading
            uiState = try {
                val pieces = repository.browseListings(savedOnly = true, lat = lat, lng = lng)
                val studios = repository.mySavedStudios(lat = lat, lng = lng)
                UiState.Success(SavedData(pieces, studios))
            } catch (e: Exception) {
                UiState.Error(e.userMessage("Couldn't load your saved items. Please try again."))
            }
        }
    }

    fun removePiece(piece: ListingCard) {
        val current = (uiState as? UiState.Success)?.data ?: return
        uiState = UiState.Success(current.copy(pieces = current.pieces.filterNot { it.id == piece.id }))
        scope.launch {
            try {
                repository.unsaveListing(piece.id)
            } catch (e: Exception) {
                actionError = e.userMessage("Couldn't remove saved piece.")
                load()
            }
        }
    }

    fun removeStudio(studio: SavedStudioCard) {
        val current = (uiState as? UiState.Success)?.data ?: return
        uiState = UiState.Success(current.copy(studios = current.studios.filterNot { it.studioHandle == studio.studioHandle }))
        scope.launch {
            try {
                repository.unsaveStudio(studio.studioHandle)
            } catch (e: Exception) {
                actionError = e.userMessage("Couldn't remove saved studio.")
                load()
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Saved",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)
        )
        DzirentTabRow(selectedTabIndex = selectedTab) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Pieces") })
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Studios") })
        }

        actionError?.let {
            Text(
                text = it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(16.dp)
            )
        }

        when (val state = uiState) {
            is UiState.Loading -> LoadingView(message = "Loading saved items...")
            is UiState.Error -> ErrorView(message = state.message, onRetry = { load() })
            is UiState.Success -> {
                if (selectedTab == 0) {
                    if (state.data.pieces.isEmpty()) {
                        EmptyView(
                            title = "No saved pieces yet",
                            description = "When you bookmark pieces you like, they show up here.",
                            icon = Icons.Default.BookmarkBorder,
                            onAction = onBrowse,
                            actionLabel = "Browse Home"
                        )
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(state.data.pieces, key = { it.id }) { piece ->
                                ListItem(
                                    headlineContent = {
                                        Text(piece.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    },
                                    supportingContent = {
                                        Text(cardSubtitle(piece.price, piece.distance))
                                    },
                                    leadingContent = {
                                        ListingPhoto(
                                            url = piece.coverPhotoPath,
                                            contentDescription = piece.title,
                                            modifier = Modifier.size(56.dp).clip(RoundedCornerShape(8.dp))
                                        )
                                    },
                                    trailingContent = {
                                        IconButton(onClick = { removePiece(piece) }) {
                                            Icon(Icons.Default.Close, contentDescription = "Remove")
                                        }
                                    },
                                    modifier = Modifier.clickable { onOpenListing(piece.id) }
                                )
                                HorizontalDivider()
                            }
                        }
                    }
                } else {
                    if (state.data.studios.isEmpty()) {
                        EmptyView(
                            title = "No saved studios yet",
                            description = "When you bookmark studios you like, they show up here.",
                            icon = Icons.Default.Storefront,
                            onAction = onBrowse,
                            actionLabel = "Browse Home"
                        )
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(state.data.studios, key = { it.studioHandle }) { studio ->
                                ListItem(
                                    headlineContent = {
                                        Text(studio.studioName, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    },
                                    supportingContent = {
                                        val dist = formatDistance(studio.distance)
                                        val count = "${studio.pieceCount} ${if (studio.pieceCount == 1) "piece" else "pieces"}"
                                        val line = listOfNotNull("@${studio.studioHandle}", count, dist).joinToString(" · ")
                                        Text(line)
                                    },
                                    leadingContent = {
                                        Avatar(name = studio.studioName, size = 48.dp)
                                    },
                                    trailingContent = {
                                        IconButton(onClick = { removeStudio(studio) }) {
                                            Icon(Icons.Default.Close, contentDescription = "Remove")
                                        }
                                    },
                                    modifier = Modifier.clickable { onOpenStudio(studio.studioHandle) }
                                )
                                HorizontalDivider()
                            }
                        }
                    }
                }
            }
        }
    }
}

