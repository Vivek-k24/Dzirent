package com.dzirent.shared.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
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
import com.dzirent.shared.repository.ChatSubscription
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.ui.theme.DzirentAccent
import com.dzirent.shared.ui.theme.OnDzirentAccent
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// --- INBOX SCREEN ---

@Composable
fun InboxScreen(
    repository: DzirentRepository,
    onConversationClick: (String) -> Unit,
    onBrowse: () -> Unit
) {
    var uiState by remember { mutableStateOf<UiState<List<ConversationCard>>>(UiState.Loading) }
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    var activitySeenThisVisit by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            uiState = UiState.Loading
            uiState = try {
                UiState.Success(repository.myConversations())
            } catch (e: Exception) {
                UiState.Error(e.userMessage("Failed to load your inbox."))
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    val conversations = (uiState as? UiState.Success)?.data.orEmpty()
    val hasUnread = conversations.any { it.unread }

    LaunchedEffect(selectedTab) {
        if (selectedTab == 1 && !activitySeenThisVisit) {
            activitySeenThisVisit = true
            try { repository.markActivitySeen() } catch (_: Exception) {}
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Inbox",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)
        )
        DzirentTabRow(selectedTabIndex = selectedTab) {
            Tab(
                selected = selectedTab == 0,
                onClick = { selectedTab = 0 },
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Messages")
                        if (hasUnread) {
                            Spacer(modifier = Modifier.width(6.dp))
                            AccentDot()
                        }
                    }
                }
            )
            Tab(
                selected = selectedTab == 1,
                onClick = { selectedTab = 1 },
                text = { Text("Activity") }
            )
        }

        when (val state = uiState) {
            is UiState.Loading -> LoadingView(message = "Loading inbox...")
            is UiState.Error -> ErrorView(message = state.message, onRetry = { load() })
            is UiState.Success -> {
                if (selectedTab == 0) {
                    if (state.data.isEmpty()) {
                        EmptyView(
                            title = "No messages yet",
                            description = "When you message a lender or a renter messages you, your chats show up here.",
                            icon = Icons.Default.ChatBubbleOutline,
                            onAction = onBrowse,
                            actionLabel = "Browse Home"
                        )
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(state.data, key = { it.id }) { conv ->
                                ListItem(
                                    headlineContent = {
                                        Text(
                                            text = conv.otherHandle?.let { "@$it" } ?: conv.otherName.ifBlank { "Dzirent member" },
                                            fontWeight = if (conv.unread) FontWeight.Bold else FontWeight.Normal,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    },
                                    supportingContent = {
                                        Column {
                                            Text(
                                                text = conv.lastMessage ?: "Started a chat",
                                                fontWeight = if (conv.unread) FontWeight.Bold else FontWeight.Normal,
                                                color = if (conv.unread) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            if (conv.listingTitle.isNotBlank()) {
                                                Text(
                                                    text = "Piece: ${conv.listingTitle}",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    maxLines = 1
                                                )
                                            }
                                        }
                                    },
                                    leadingContent = {
                                        if (!conv.coverPhotoPath.isNullOrBlank()) {
                                            ListingPhoto(
                                                url = conv.coverPhotoPath,
                                                contentDescription = conv.listingTitle,
                                                modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp))
                                            )
                                        } else {
                                            Avatar(name = conv.otherName.ifBlank { "D" }, size = 48.dp)
                                        }
                                    },
                                    trailingContent = {
                                        if (conv.unread) AccentDot()
                                    },
                                    modifier = Modifier.clickable { onConversationClick(conv.id) }
                                )
                                HorizontalDivider()
                            }
                        }
                    }
                } else {
                    EmptyView(
                        title = "No activity yet",
                        description = "Rental updates and reminders will appear here.",
                        icon = Icons.Default.NotificationsNone,
                        onAction = onBrowse,
                        actionLabel = "Browse Home"
                    )
                }
            }
        }
    }
}

// --- CHAT SCREEN ---

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    repository: DzirentRepository,
    conversationId: String,
    currentUserId: String,
    onBack: () -> Unit,
    onOpenListing: (String) -> Unit,
    onOpenStudio: (String) -> Unit
) {
    val scope = rememberCoroutineScope()
    var conversationCard by remember { mutableStateOf<ConversationCard?>(null) }
    var messages by remember { mutableStateOf<List<Message>>(emptyList()) }
    var rental by remember { mutableStateOf<Rental?>(null) }
    var textInput by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var showBlockConfirm by remember { mutableStateOf(false) }
    var reportTarget by remember { mutableStateOf<ReportTarget?>(null) }
    val listState = rememberLazyListState()

    fun mergeMessages(fresh: List<Message>) {
        val existingIds = messages.mapNotNull { it.id }.toSet()
        val toAdd = fresh.filter { it.id == null || it.id !in existingIds }
        if (toAdd.isNotEmpty()) {
            messages = (messages + toAdd).sortedBy { it.createdAt.orEmpty() }
        }
    }

    suspend fun loadInitial() {
        try {
            val convList = repository.myConversations(conversationId = conversationId)
            conversationCard = convList.firstOrNull()
            val history = repository.getMessages(conversationId)
            mergeMessages(history)
            rental = repository.getRental(conversationId)
            repository.markConversationRead(conversationId)
        } catch (e: Exception) {
            error = e.userMessage("Couldn't load chat.")
        }
    }

    LaunchedEffect(conversationId) {
        var subscription: ChatSubscription? = null
        try {
            subscription = runCatching { repository.subscribeToChat(conversationId) }.getOrNull()
            subscription?.let { sub ->
                launch {
                    sub.messages.collect { msg ->
                        mergeMessages(listOf(msg))
                        if (msg.senderId != currentUserId) {
                            runCatching { repository.markConversationRead(conversationId) }
                        }
                    }
                }
                launch {
                    sub.rentals.collect { r -> rental = r }
                }
            }
            loadInitial()
            awaitCancellation()
        } finally {
            subscription?.let { withContext(NonCancellable) { it.close() } }
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    reportTarget?.let { target ->
        ReportDialog(
            repository = repository,
            target = target,
            onDismiss = { reportTarget = null }
        )
    }

    if (showBlockConfirm && conversationCard != null) {
        val card = conversationCard!!
        val name = card.otherHandle?.let { "@$it" } ?: card.otherName
        BlockUserDialog(
            name = name,
            onConfirm = {
                showBlockConfirm = false
                scope.launch {
                    try {
                        card.otherHandle?.let { repository.blockUser(it) }
                        onBack()
                    } catch (e: Exception) {
                        error = e.userMessage("Couldn't block user.")
                    }
                }
            },
            onDismiss = { showBlockConfirm = false }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = {
                val card = conversationCard
                Column {
                    Text(
                        text = card?.otherHandle?.let { "@$it" } ?: card?.otherName ?: "Chat",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    card?.otherHandle?.let {
                        Text(
                            text = "View studio",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable { onOpenStudio(it) }
                        )
                    }
                }
            },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            },
            actions = {
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Default.MoreVert, contentDescription = "More")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        conversationCard?.otherHandle?.let { handle ->
                            DropdownMenuItem(
                                text = { Text("Report user") },
                                onClick = {
                                    menuOpen = false
                                    reportTarget = ReportTarget(
                                        targetType = "user",
                                        targetId = "",
                                        title = "Report @$handle",
                                        targetHandle = handle
                                    )
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Block user", color = MaterialTheme.colorScheme.error) },
                                onClick = {
                                    menuOpen = false
                                    showBlockConfirm = true
                                }
                            )
                        }
                    }
                }
            }
        )

        // Listing preview banner
        conversationCard?.let { card ->
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenListing(card.listingId) }
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().padding(8.dp)
                ) {
                    ListingPhoto(
                        url = card.coverPhotoPath,
                        contentDescription = card.listingTitle,
                        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(6.dp))
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(card.listingTitle, style = MaterialTheme.typography.titleSmall, maxLines = 1)
                        card.price?.let {
                            Text(formatPrice(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                    card.requestedDates?.let { range ->
                        AssistChip(
                            onClick = {},
                            label = { Text("${range.start} – ${range.end}") }
                        )
                    }
                }
            }
        }

        // Messages list
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(messages) { msg ->
                val isMe = msg.senderId == currentUserId
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (isMe) Arrangement.End else Arrangement.Start
                ) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (isMe) DzirentAccent else MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = if (isMe) OnDzirentAccent else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.widthIn(max = 280.dp)
                    ) {
                        Text(
                            text = msg.body,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }
        }

        error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp))
        }

        // Input bar
        Surface(
            tonalElevation = 4.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                OutlinedTextField(
                    value = textInput,
                    onValueChange = { textInput = it },
                    placeholder = { Text("Write a message...") },
                    maxLines = 4,
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(
                    onClick = {
                        val trimmed = textInput.trim()
                        if (trimmed.isNotBlank() && !isSending) {
                            scope.launch {
                                isSending = true
                                error = null
                                try {
                                    val sent = repository.sendMessage(conversationId, trimmed)
                                    textInput = ""
                                    mergeMessages(listOf(sent))
                                } catch (e: Exception) {
                                    error = e.userMessage("Couldn't send message.")
                                }
                                isSending = false
                            }
                        }
                    },
                    enabled = textInput.isNotBlank() && !isSending
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Send",
                        tint = if (textInput.isNotBlank()) DzirentAccent else MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
    }
}

