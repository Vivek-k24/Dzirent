package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.*
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch

/**
 * A lender's studio: handle in top bar with bookmark, avatar, name, since, bio,
 * style tags, pickup area, reply time and rental counts, a full-width "Message" button,
 * and a 3-column grid of active pieces.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudioScreen(
    repository: DzirentRepository,
    handle: String,
    isGuest: Boolean,
    currentUserId: String?,
    lat: Double? = null,
    lng: Double? = null,
    onBack: () -> Unit,
    onOpenListing: (String) -> Unit,
    onMessageAbout: (listingId: String) -> Unit,
    onAuthRequired: (GatedAction) -> Unit
) {
    val scope = rememberCoroutineScope()
    var uiState by remember { mutableStateOf<UiState<StudioDetail>>(UiState.Loading) }
    var savingBookmark by remember { mutableStateOf(false) }
    var showPiecePicker by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var showBlockConfirm by remember { mutableStateOf(false) }
    var reportTarget by remember { mutableStateOf<ReportTarget?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            uiState = UiState.Loading
            uiState = try {
                val detail = repository.getStudio(handle, lat, lng)
                if (detail != null) UiState.Success(detail)
                else UiState.Error("Studio not found.")
            } catch (e: Exception) {
                UiState.Error(e.userMessage("Couldn't load this studio. Please try again."))
            }
        }
    }

    fun toggleSaved(page: StudioDetail) {
        if (isGuest) {
            onAuthRequired(GatedAction.OPEN_STUDIO)
            return
        }
        if (savingBookmark) return
        scope.launch {
            savingBookmark = true
            try {
                if (page.isSaved) repository.unsaveStudio(page.studioHandle)
                else repository.saveStudio(page.studioHandle)
                uiState = UiState.Success(page.copy(isSaved = !page.isSaved))
            } catch (e: Exception) {
                actionError = e.userMessage("Couldn't update saved studio.")
            }
            savingBookmark = false
        }
    }

    LaunchedEffect(handle) { load() }

    val page = (uiState as? UiState.Success)?.data

    if (showPiecePicker && page != null) {
        PiecePickerSheet(
            pieces = page.listings,
            onPick = { piece ->
                showPiecePicker = false
                onMessageAbout(piece.id)
            },
            onDismiss = { showPiecePicker = false }
        )
    }

    reportTarget?.let { target ->
        ReportDialog(
            repository = repository,
            target = target,
            onDismiss = { reportTarget = null }
        )
    }

    if (showBlockConfirm && page != null) {
        BlockUserDialog(
            name = "@${page.studioHandle}",
            onConfirm = {
                showBlockConfirm = false
                scope.launch {
                    try {
                        repository.blockUser(page.studioHandle)
                        onBack()
                    } catch (e: Exception) {
                        actionError = e.userMessage("Couldn't block user.")
                    }
                }
            },
            onDismiss = { showBlockConfirm = false }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("@$handle", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            },
            actions = {
                if (page != null) {
                    IconButton(onClick = { toggleSaved(page) }, enabled = !savingBookmark) {
                        Icon(
                            if (page.isSaved) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                            contentDescription = if (page.isSaved) "Saved" else "Save studio"
                        )
                    }
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "More")
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text("Report studio") },
                                onClick = {
                                    menuOpen = false
                                    if (isGuest) {
                                        onAuthRequired(GatedAction.MESSAGE_LENDER)
                                    } else {
                                        reportTarget = ReportTarget(
                                            targetType = "user",
                                            targetId = "",
                                            title = "Report @${page.studioHandle}",
                                            targetHandle = page.studioHandle
                                        )
                                    }
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Block studio", color = MaterialTheme.colorScheme.error) },
                                onClick = {
                                    menuOpen = false
                                    if (isGuest) {
                                        onAuthRequired(GatedAction.MESSAGE_LENDER)
                                    } else {
                                        showBlockConfirm = true
                                    }
                                }
                            )
                        }
                    }
                }
            }
        )

        when (val state = uiState) {
            is UiState.Loading -> LoadingView(message = "Loading studio...")
            is UiState.Error -> ErrorView(message = state.message, onRetry = { load() })
            is UiState.Success -> {
                val studio = state.data
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                        ) {
                            Avatar(name = studio.studioName, size = 72.dp)
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = studio.studioName,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "@${studio.studioHandle}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            if (studio.city.isNotBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = studio.city,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            studio.studioBio?.takeIf { it.isNotBlank() }?.let { bio ->
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    text = bio,
                                    style = MaterialTheme.typography.bodyMedium,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(horizontal = 16.dp)
                                )
                            }
                            if (studio.styleTags.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    modifier = Modifier.padding(top = 4.dp)
                                ) {
                                    studio.styleTags.forEach { tag ->
                                        SuggestionChip(
                                            onClick = {},
                                            label = { Text(tag, style = MaterialTheme.typography.labelSmall) }
                                        )
                                    }
                                }
                            }
                            if (studio.pickupArea != null) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Pickup area: ${studio.pickupArea}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            val reply = replyTimeText(studio.replyMinutes)
                            if (reply != null) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = reply,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = {
                                    if (isGuest) {
                                        onAuthRequired(GatedAction.MESSAGE_LENDER)
                                    } else if (studio.listings.size == 1) {
                                        onMessageAbout(studio.listings.first().id)
                                    } else if (studio.listings.isNotEmpty()) {
                                        showPiecePicker = true
                                    }
                                },
                                enabled = studio.listings.isNotEmpty(),
                                modifier = Modifier.fillMaxWidth().height(48.dp)
                            ) {
                                Icon(Icons.Default.MailOutline, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Message")
                            }
                            actionError?.let {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(text = it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }

                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            text = "${studio.listings.size} ${if (studio.listings.size == 1) "piece" else "pieces"}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }

                    items(studio.listings, key = { it.id }) { piece ->
                        Column(modifier = Modifier.clickable { onOpenListing(piece.id) }) {
                            ListingPhoto(
                                url = piece.coverPhotoPath,
                                contentDescription = piece.title,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(3f / 4f)
                                    .clip(RoundedCornerShape(8.dp))
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = piece.title,
                                style = MaterialTheme.typography.labelMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            piece.price?.let { p ->
                                Text(
                                    text = formatPrice(p),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PiecePickerSheet(
    pieces: List<ListingCard>,
    onPick: (ListingCard) -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(
                text = "Which piece are you asking about?",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(12.dp))
            pieces.forEach { piece ->
                ListItem(
                    headlineContent = { Text(piece.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    supportingContent = piece.price?.let { { Text(formatPrice(it)) } },
                    leadingContent = {
                        ListingPhoto(
                            url = piece.coverPhotoPath,
                            contentDescription = piece.title,
                            modifier = Modifier.size(48.dp).clip(RoundedCornerShape(4.dp))
                        )
                    },
                    modifier = Modifier.clickable { onPick(piece) }
                )
                HorizontalDivider()
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

