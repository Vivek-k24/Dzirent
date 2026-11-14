package com.dzirent.shared.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import com.dzirent.shared.platform.LocalDevice
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.dzirent.shared.model.*
import com.dzirent.shared.repository.CANT_MESSAGE_USER
import com.dzirent.shared.repository.ChatSubscription
import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.repository.InboxSnapshot
import com.dzirent.shared.util.ActivityItem
import com.dzirent.shared.util.DateRange
import com.dzirent.shared.util.ErrorCatalog
import com.dzirent.shared.util.RentalAction
import com.dzirent.shared.util.RentalStatus
import com.dzirent.shared.util.chatDatesLine
import com.dzirent.shared.util.datesAsked
import com.dzirent.shared.util.datesQuestion
import com.dzirent.shared.util.formatInboxTime
import com.dzirent.shared.util.formatMessageTime
import com.dzirent.shared.util.parseDateRange
import com.dzirent.shared.util.timestampMillis
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// --- INBOX SCREEN ---

/**
 * Two tabs: Messages (my chats, unread ones marked) and Activity (the latest step of each
 * rental, C3). [onNewsChanged] keeps the dot on the Inbox tab in sync.
 */
@Composable
fun InboxScreen(
    repository: DzirentRepository,
    currentUserId: String,
    onConversationClick: (conversationId: String) -> Unit,
    onNewsChanged: (Boolean) -> Unit,
    onBrowse: () -> Unit
) {
    var uiState by remember { mutableStateOf<UiState<InboxSnapshot>>(UiState.Loading) }
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    // Items that were new when this visit started keep their mark until the screen closes.
    var activitySeenThisVisit by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            uiState = UiState.Loading
            try {
                val snapshot = repository.getInboxSnapshot()
                uiState = UiState.Success(snapshot)
                onNewsChanged(snapshot.hasNews)
            } catch (e: Exception) {
                uiState = UiState.Error(e.userMessage("Failed to load your inbox."))
            }
        }
    }

    // Runs each time the Inbox tab is opened, since the screen re-enters composition.
    LaunchedEffect(currentUserId) { load() }

    val snapshot = (uiState as? UiState.Success)?.data
    LaunchedEffect(selectedTab, snapshot) {
        if (selectedTab == 1 && snapshot != null && !activitySeenThisVisit) {
            activitySeenThisVisit = true
            repository.markActivitySeen()
            onNewsChanged(snapshot.unreadIds.isNotEmpty())
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        ScreenTitle("Inbox")
        DzirentTabRow(selectedTabIndex = selectedTab) {
            Tab(
                selected = selectedTab == 0,
                onClick = { selectedTab = 0 },
                text = { TabLabel("Messages", dot = snapshot?.unreadIds?.isNotEmpty() == true) }
            )
            Tab(
                selected = selectedTab == 1,
                onClick = { selectedTab = 1 },
                text = {
                    TabLabel("Activity", dot = !activitySeenThisVisit && snapshot?.activity?.any { it.isNew } == true)
                }
            )
        }
        when (val state = uiState) {
            is UiState.Loading -> LoadingView(message = "Loading your inbox...")
            is UiState.Error -> ErrorView(message = state.message, onRetry = { load() })
            is UiState.Success -> if (selectedTab == 0) {
                MessagesList(state.data, currentUserId, onConversationClick, onBrowse)
            } else {
                ActivityList(state.data.activity, onConversationClick, onBrowse)
            }
        }
    }
}

@Composable
private fun TabLabel(text: String, dot: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text, maxLines = 1)
        if (dot) {
            Spacer(modifier = Modifier.width(6.dp))
            AccentDot()
        }
    }
}

@Composable
private fun MessagesList(
    snapshot: InboxSnapshot,
    currentUserId: String,
    onConversationClick: (String) -> Unit,
    onBrowse: () -> Unit
) {
    if (snapshot.conversations.isEmpty()) {
        EmptyView(
            title = "No messages yet",
            description = "When you message a lender or a renter messages you, your chats show up here.",
            icon = Icons.Default.ChatBubbleOutline,
            onAction = onBrowse,
            actionLabel = "Browse Home"
        )
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        items(snapshot.conversations, key = { it.id }) { conv ->
            InboxRow(
                conv = conv,
                currentUserId = currentUserId,
                unread = conv.id in snapshot.unreadIds,
                onClick = { onConversationClick(conv.id) }
            )
        }
    }
}

@Composable
private fun ActivityList(items: List<ActivityItem>, onConversationClick: (String) -> Unit, onBrowse: () -> Unit) {
    if (items.isEmpty()) {
        EmptyView(
            title = "No activity yet",
            description = "Rental updates and reminders about your chats show up here.",
            icon = Icons.Default.NotificationsNone,
            onAction = onBrowse,
            actionLabel = "Browse Home"
        )
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(items, key = { "${it.kind}-${it.conversationId}" }) { item ->
            ListItem(
                headlineContent = {
                    Text(
                        text = item.text,
                        fontWeight = if (item.isNew) FontWeight.Bold else FontWeight.Normal,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                supportingContent = { Text(formatInboxTime(item.time.toString())) },
                trailingContent = if (item.isNew) {
                    { AccentDot() }
                } else null,
                modifier = Modifier.clickable { onConversationClick(item.conversationId) }
            )
            HorizontalDivider()
        }
    }
}

@Composable
private fun InboxRow(conv: Conversation, currentUserId: String, unread: Boolean, onClick: () -> Unit) {
    val last = conv.lastMessage
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ListingThumbnail(listing = conv.listing, size = 56.dp)
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = conv.otherUser(currentUserId)?.displayName?.ifBlank { null } ?: "Dzirent member",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    if (unread) {
                        AccentDot()
                        Spacer(modifier = Modifier.width(6.dp))
                    }
                    Text(
                        text = formatInboxTime(last?.createdAt ?: conv.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = conv.listing?.title ?: "Listing no longer available",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = when {
                        last == null -> "No messages yet"
                        last.senderId == currentUserId -> "You: ${last.body}"
                        else -> last.body
                    },
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = if (unread) FontWeight.Bold else FontWeight.Normal,
                    color = if (unread) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

// --- CHAT SCREEN ---

private const val PHOTOS_QUESTION = "Can I see more photos?"
private const val MESSAGE_MAX = 2000

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    repository: DzirentRepository,
    conversationId: String,
    currentUserId: String,
    onBack: () -> Unit,
    onOpenListing: (listingId: String) -> Unit,
    /** Home's current date range: the chat chip asks about it. */
    myDates: DateRange,
    /** Text to start the message box with, e.g. a question about dates. */
    initialDraft: String? = null
) {
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    val safetyTips = remember { SafetyTipStore(device.prefs) }
    var showSafetyTip by remember(conversationId) { mutableStateOf(!safetyTips.isDismissed(conversationId)) }
    val notificationPrompt = remember { NotificationPromptStore(device.prefs) }
    var showNotificationPrompt by remember { mutableStateOf(false) }
    val turnOnNotifications = rememberTurnOnNotifications { }

    // While this chat is on screen its notifications don't show; it already updates live.
    LifecycleResumeEffect(conversationId) {
        device.push.chatShown(conversationId)
        onPauseOrDispose { device.push.chatHidden(conversationId) }
    }

    var uiState by remember { mutableStateOf<UiState<Conversation>>(UiState.Loading) }
    var messages by remember { mutableStateOf<List<Message>>(emptyList()) }
    // C3: the chat's latest rental (get_rental), signed links to its condition photos, and the
    // listing's open and booked days for "Request to rent".
    var rental by remember { mutableStateOf<RentalView?>(null) }
    var photoLinks by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var listingDetail by remember { mutableStateOf<ListingDetail?>(null) }
    var liveUnavailable by remember { mutableStateOf(false) }

    var input by remember { mutableStateOf(initialDraft.orEmpty()) }
    var isSending by remember { mutableStateOf(false) }
    var sendError by remember { mutableStateOf<String?>(null) }
    var sendRefused by remember { mutableStateOf(false) }
    val suspended = rememberSuspensionNotice(repository)
    var actionError by remember { mutableStateOf<String?>(null) }
    var isSavingRental by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var showRequestDialog by remember { mutableStateOf(false) }
    var showCancelDialog by remember { mutableStateOf(false) }
    // C5: payments and claims (dialogs), a plain notice after a step, and the server's rental rules.
    var showPayDialog by remember { mutableStateOf(false) }
    var showClaimDialog by remember { mutableStateOf(false) }
    var claimAnswer by remember { mutableStateOf<Boolean?>(null) }
    var showReceipt by remember { mutableStateOf(false) }
    var rentalNotice by remember { mutableStateOf<String?>(null) }
    var rentalSettings by remember { mutableStateOf<RentalSettings?>(null) }
    LaunchedEffect(Unit) { rentalSettings = runCatching { repository.rentalSettings() }.getOrNull() }
    /** The condition photo stage whose camera-or-gallery choice is showing. */
    var choosingPhotoStage by remember { mutableStateOf<String?>(null) }
    var uploadingStage by remember { mutableStateOf<String?>(null) }
    var iBlocked by remember { mutableStateOf(false) }
    var showBlockConfirm by remember { mutableStateOf(false) }
    var reportTarget by remember { mutableStateOf<ReportTarget?>(null) }

    val listState = rememberLazyListState()

    /** Adds messages, skipping ids we already have (my own send arrives live too). */
    fun merge(incoming: List<Message>) {
        val known = messages.map { it.id }.toSet()
        val fresh = incoming.filter { it.id !in known }
        if (fresh.isNotEmpty()) messages = (messages + fresh).sortedBy { timestampMillis(it.createdAt) }
    }

    /** Reloads the rental card and links its condition photos (the bucket is private). */
    suspend fun reloadRental() {
        val loaded = repository.getChatRental(conversationId)
        rental = loaded
        val missing = loaded?.photos?.map { it.storagePath }?.filter { it !in photoLinks }.orEmpty()
        if (missing.isNotEmpty()) {
            photoLinks = photoLinks + runCatching { repository.conditionPhotoLinks(missing) }.getOrDefault(emptyMap())
        }
    }

    suspend fun loadAll() {
        uiState = UiState.Loading
        try {
            val conversation = repository.getConversation(conversationId)
            val history = repository.getMessages(conversationId)
            iBlocked = repository.haveIBlocked(conversation.otherUserId(currentUserId))
            merge(history)
            reloadRental()
            uiState = UiState.Success(conversation)
            repository.markConversationRead(conversationId)
        } catch (e: Exception) {
            uiState = UiState.Error(e.userMessage("Couldn't open this chat. Please try again."))
        }
    }

    // Subscribe when the chat opens, then load history (so nothing sent in between is
    // missed), and leave the realtime channel when the chat closes.
    LaunchedEffect(conversationId) {
        var subscription: ChatSubscription? = null
        try {
            subscription = try {
                repository.subscribeToChat(conversationId)
            } catch (e: Exception) {
                liveUnavailable = true
                null
            }
            subscription?.let { sub ->
                launch {
                    sub.messages.collect { message ->
                        merge(listOf(message))
                        // I'm looking at it, so it's read.
                        if (message.senderId != currentUserId) repository.markConversationRead(conversationId)
                    }
                }
                // Any change to this chat's rentals: reload the card (timeline and photos too).
                launch { sub.rentals.collect { runCatching { reloadRental() } } }
            }
            loadAll()
            awaitCancellation()
        } finally {
            subscription?.let { sub -> withContext(NonCancellable) { sub.close() } }
        }
    }

    LaunchedEffect(messages.size) {
        val count = listState.layoutInfo.totalItemsCount
        if (messages.isNotEmpty() && count > 0) listState.animateScrollToItem(count - 1)
    }

    val conversation = (uiState as? UiState.Success)?.data
    val otherName = conversation?.otherUser(currentUserId)?.displayName?.ifBlank { null } ?: "Dzirent member"

    fun send(text: String) {
        val body = text.trim()
        if (body.isEmpty() || isSending) return
        scope.launch {
            isSending = true
            sendError = null
            try {
                merge(listOf(repository.sendMessage(conversationId, body)))
                // Keep anything typed while sending; clear only the text we sent.
                if (input.trim() == body) input = ""
                // Right after the first message sent on this phone, offer notifications (once).
                if (!notificationPrompt.asked) {
                    notificationPrompt.markAsked()
                    if (!device.push.canNotify()) showNotificationPrompt = true
                }
                // A dates question from the renter saves its dates for both people to see.
                val conv = conversation
                val asked = datesAsked(body, myDates)
                if (conv != null && conv.renterId == currentUserId && asked != null && asked != conv.requestedDates &&
                    repository.setConversationDates(conversationId, asked)
                ) {
                    (uiState as? UiState.Success)?.let { current ->
                        uiState = UiState.Success(
                            current.data.copy(requestedStart = asked.start.toString(), requestedEnd = asked.end.toString())
                        )
                    }
                }
            } catch (e: Exception) {
                sendError = e.userMessage("Couldn't send your message. Please try again.")
                // The text filter said no: sending the same text again can't work.
                sendRefused = (e as? DzirentException)?.field != null
            }
            isSending = false
        }
    }

    /** Runs one rental step on the server, then reloads the card. */
    fun rentalStep(block: suspend () -> Unit) {
        scope.launch {
            isSavingRental = true
            actionError = null
            try {
                block()
                reloadRental()
            } catch (e: Exception) {
                actionError = e.userMessage("Couldn't update the rental. Please try again.")
            }
            isSavingRental = false
        }
    }

    fun openRequestDialog() {
        val conv = conversation ?: return
        scope.launch {
            actionError = null
            try {
                listingDetail = repository.getListing(conv.listingId)
                if (listingDetail == null) actionError = ErrorCatalog.shown("DZ-E4011").text else showRequestDialog = true
            } catch (e: Exception) {
                actionError = e.userMessage("Couldn't load this piece's dates. Please try again.")
            }
        }
    }

    // Condition photos: picked or taken, compressed on the phone, uploaded to the private bucket.
    val conditionPhotoStore = remember(currentUserId) { device.photoStore("rentals-$currentUserId") }
    val startConditionPhotos = rememberPhotoSources(
        photoStore = conditionPhotoStore,
        maxPhotos = 6,
        onPhotos = { uris ->
            val current = rental
            val stage = uploadingStage
            if (current != null && stage != null && uris.isNotEmpty()) {
                rentalStep {
                    try {
                        uris.forEach { uri ->
                            val bytes = device.readPhoto(uri)?.let { device.imageCompressor.compressImage(it) }
                                ?: throw DzirentException("One of the photos couldn't be read. Pick a different one.")
                            repository.uploadConditionPhoto(current.id, stage, bytes)
                        }
                    } finally {
                        conditionPhotoStore.delete(uris)
                    }
                }
            }
        },
        onMessage = { actionError = it }
    )

    // C5: Stripe's payment sheet. On success the webhook marks the rental paid; the card updates live.
    val paymentSheet = rememberPaymentSheetLauncher { outcome ->
        isSavingRental = false
        when (outcome) {
            PaymentSheetOutcome.Completed -> {
                rentalNotice = "Payment sent. The rental shows Paid in a moment."
                scope.launch { runCatching { reloadRental() } }
            }
            PaymentSheetOutcome.Canceled -> Unit
            is PaymentSheetOutcome.Failed -> actionError = ErrorCatalog.shown(outcome.code).text
        }
    }

    fun pay() {
        val current = rental ?: return
        if (!paymentSheet.available) {
            actionError = ErrorCatalog.shown("DZ-E4049").text
            return
        }
        scope.launch {
            isSavingRental = true
            actionError = null
            rentalNotice = null
            try {
                val start = repository.startPayment(current.id)
                paymentSheet.present(start.publishableKey, start.clientSecret)
            } catch (e: Exception) {
                actionError = e.userMessage("Couldn't start the payment. Please try again.")
                isSavingRental = false
            }
        }
    }

    fun onRentalAction(action: RentalAction) {
        val current = rental ?: return
        rentalNotice = null
        when (action) {
            RentalAction.ACCEPT -> rentalStep { repository.respondRental(current.id, accept = true) }
            RentalAction.DECLINE -> rentalStep { repository.respondRental(current.id, accept = false) }
            RentalAction.CANCEL -> showCancelDialog = true
            RentalAction.ADD_PICKUP_PHOTOS -> choosingPhotoStage = "pickup"
            RentalAction.ADD_RETURN_PHOTOS -> choosingPhotoStage = "return"
            RentalAction.MARK_PICKED_UP -> rentalStep { repository.markPickedUp(current.id) }
            RentalAction.MARK_RETURNED -> rentalStep { repository.markReturned(current.id) }
            RentalAction.COMPLETE -> rentalStep { repository.completeRental(current.id) }
            RentalAction.PAY -> showPayDialog = true
            RentalAction.PLACE_HOLD -> rentalStep {
                if (repository.placeDepositHold(current.id) != "picked_up") {
                    rentalNotice = "The deposit hold is being confirmed. Tap again in a moment to mark it picked up."
                }
            }
            RentalAction.FILE_CLAIM -> showClaimDialog = true
            RentalAction.ACCEPT_CLAIM -> claimAnswer = true
            RentalAction.DISPUTE_CLAIM -> claimAnswer = false
            RentalAction.RECEIPT -> showReceipt = true
        }
    }

    if (showPayDialog) {
        rental?.let { current ->
            PayDialog(
                rental = current,
                onDismiss = { showPayDialog = false },
                onContinue = { showPayDialog = false; pay() }
            )
        }
    }

    if (showClaimDialog) {
        rental?.let { current ->
            ClaimDialog(
                rental = current,
                photoLinks = photoLinks,
                onDismiss = { showClaimDialog = false },
                onConfirm = { amount, reason, photos ->
                    showClaimDialog = false
                    rentalStep { repository.fileClaim(current.id, amount, reason, photos) }
                }
            )
        }
    }

    claimAnswer?.let { accept ->
        val claim = rental?.claim
        if (claim == null) {
            claimAnswer = null
        } else {
            ClaimAnswerDialog(
                accept = accept,
                amount = claim.amount,
                onDismiss = { claimAnswer = null },
                onConfirm = { note ->
                    claimAnswer = null
                    rentalStep { repository.respondClaim(claim.id, accept, note) }
                }
            )
        }
    }

    if (showReceipt) {
        rental?.let { current -> ReceiptDialog(rental = current, onDismiss = { showReceipt = false }) }
    }

    fun setBlocked(block: Boolean) {
        val conv = conversation ?: return
        val otherId = conv.otherUserId(currentUserId)
        scope.launch {
            actionError = null
            try {
                if (block) repository.blockUserById(otherId) else repository.unblockUserById(otherId)
                iBlocked = block
                sendError = null
            } catch (e: Exception) {
                actionError = e.userMessage(if (block) "Couldn't block this user." else "Couldn't unblock this user.")
            }
        }
    }

    if (showRequestDialog) {
        val detail = listingDetail
        RentalRequestDialog(
            pricePerDay = detail?.price,
            windows = detail?.availability.orEmpty().mapNotNull { parseDateRange(it.startDate, it.endDate) },
            booked = detail?.booked.orEmpty().mapNotNull { parseDateRange(it.startDate, it.endDate) },
            initial = conversation?.requestedDates ?: myDates,
            onDismiss = { showRequestDialog = false },
            onConfirm = { range ->
                showRequestDialog = false
                val conv = conversation
                if (conv != null) rentalStep { repository.requestRental(conv.listingId, range) }
            }
        )
    }

    if (showCancelDialog) {
        CancelRentalDialog(
            onDismiss = { showCancelDialog = false },
            onConfirm = { reason ->
                showCancelDialog = false
                rental?.let { current -> rentalStep { repository.cancelRental(current.id, reason) } }
            }
        )
    }

    choosingPhotoStage?.let { stage ->
        AlertDialog(
            onDismissRequest = { choosingPhotoStage = null },
            title = { Text(if (stage == "pickup") "Photos at pickup" else "Photos at return", modifier = Modifier.asHeading()) },
            text = { Text("Show the piece's condition: front, back and any marks. Only the two of you (and Dzirent if there's a report) see them.") },
            confirmButton = {
                TextButton(onClick = { choosingPhotoStage = null; uploadingStage = stage; startConditionPhotos(PhotoSource.Camera) }) { Text("Camera") }
            },
            dismissButton = {
                TextButton(onClick = { choosingPhotoStage = null; uploadingStage = stage; startConditionPhotos(PhotoSource.Gallery) }) { Text("Gallery") }
            }
        )
    }

    if (showNotificationPrompt) {
        NotificationPromptDialog(
            onTurnOn = {
                showNotificationPrompt = false
                turnOnNotifications()
            },
            onDismiss = { showNotificationPrompt = false }
        )
    }

    if (showBlockConfirm) {
        BlockUserDialog(
            name = otherName,
            onConfirm = { showBlockConfirm = false; setBlocked(true) },
            onDismiss = { showBlockConfirm = false }
        )
    }

    reportTarget?.let { target ->
        ReportDialog(
            repository = repository,
            reporterId = currentUserId,
            target = target,
            onDismiss = { reportTarget = null }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = {
                Column {
                    Text(otherName, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    conversation?.listing?.title?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
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
                if (conversation != null) {
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "More options")
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            val open = rental?.status in RentalStatus.OPEN
                            if (conversation.renterId == currentUserId && !open && !iBlocked) {
                                DropdownMenuItem(
                                    text = { Text("Request to rent") },
                                    leadingIcon = { Icon(Icons.Default.EventAvailable, contentDescription = null) },
                                    enabled = !isSavingRental,
                                    onClick = { menuOpen = false; openRequestDialog() }
                                )
                            }
                            rental?.let { current ->
                                DropdownMenuItem(
                                    text = { Text("Report this rental") },
                                    leadingIcon = { Icon(Icons.Default.Flag, contentDescription = null) },
                                    onClick = {
                                        menuOpen = false
                                        reportTarget = ReportTarget("rental", current.id, "Report this rental")
                                    }
                                )
                            }
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text("Report user") },
                                leadingIcon = { Icon(Icons.Default.Flag, contentDescription = null) },
                                onClick = {
                                    menuOpen = false
                                    reportTarget = ReportTarget("user", conversation.otherUserId(currentUserId), "Report $otherName")
                                }
                            )
                            DropdownMenuItem(
                                text = { Text(if (iBlocked) "Unblock user" else "Block user") },
                                leadingIcon = { Icon(Icons.Default.Block, contentDescription = null) },
                                onClick = {
                                    menuOpen = false
                                    if (iBlocked) setBlocked(false) else showBlockConfirm = true
                                }
                            )
                        }
                    }
                }
            }
        )

        when (val state = uiState) {
            is UiState.Loading -> LoadingView(message = "Loading messages...")
            is UiState.Error -> ErrorView(message = state.message, onRetry = { scope.launch { loadAll() } })
            is UiState.Success -> {
                val conv = state.data
                PinnedListing(
                    listing = conv.listing,
                    datesLine = chatDatesLine(conv.requestedDates, iAmRenter = conv.renterId == currentUserId),
                    onClick = { onOpenListing(conv.listingId) }
                )
                if (iBlocked) {
                    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Block, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "You blocked this user",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                modifier = Modifier.weight(1f)
                            )
                            TextButton(onClick = { setBlocked(false) }) { Text("Unblock") }
                        }
                    }
                }
                if (isSavingRental) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                if (liveUnavailable) {
                    Text(
                        text = "Live updates are off. Leave and reopen the chat to see new messages.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                    )
                }

                LazyColumn(
                    state = listState,
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    if (showSafetyTip) {
                        item(key = "safety") {
                            PolicyNotice(
                                text = DzirentPolicy.CHAT_SAFETY_TIP,
                                onDismiss = {
                                    safetyTips.dismiss(conversationId)
                                    showSafetyTip = false
                                }
                            )
                        }
                    }
                    rental?.let { current ->
                        item(key = "rental") {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                RentalCard(
                                    rental = current,
                                    photoLinks = photoLinks,
                                    busy = isSavingRental,
                                    onAction = { onRentalAction(it) },
                                    settings = rentalSettings
                                )
                                rentalNotice?.let {
                                    Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.announced())
                                }
                            }
                        }
                    }
                    // The renter's way in: a request card when there's no open rental.
                    if (conv.renterId == currentUserId && rental?.status !in RentalStatus.OPEN && !iBlocked && suspended == null) {
                        item(key = "request") {
                            OutlinedButton(
                                onClick = { openRequestDialog() },
                                enabled = !isSavingRental,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.EventAvailable, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(if (rental == null) "Request to rent" else "Request to rent again")
                            }
                        }
                    }
                    if (messages.isEmpty() && !iBlocked) {
                        item(key = "empty") {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 24.dp)
                            ) {
                                Text(
                                    text = "Say hi to $otherName",
                                    style = MaterialTheme.typography.titleSmall
                                )
                                // Quick replies are questions for the lender, so only the renter gets them.
                                if (conv.renterId == currentUserId) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    listOf(datesQuestion(myDates), PHOTOS_QUESTION).forEach { reply ->
                                        SuggestionChip(onClick = { input = reply }, label = { Text(reply) })
                                    }
                                }
                            }
                        }
                    }
                    items(messages, key = { it.id }) { msg ->
                        val isMe = msg.senderId == currentUserId
                        MessageBubble(
                            message = msg,
                            isMe = isMe,
                            onLongPress = if (isMe) null else {
                                { reportTarget = ReportTarget("message", msg.id, "Report message") }
                            }
                        )
                    }
                }

                (sendError ?: actionError)?.let { message ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 16.dp)
                    ) {
                        Text(
                            text = message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f).announced()
                        )
                        if (sendError != null && sendError != CANT_MESSAGE_USER && !sendRefused) {
                            TextButton(onClick = { send(input) }, enabled = !isSending) { Text("Retry") }
                        } else {
                            TextButton(onClick = { actionError = null; if (sendRefused) sendError = null }) { Text("OK") }
                        }
                    }
                }

                // Suspended: the notice instead of the message box (the database refuses sending anyway).
                if (suspended != null) {
                    SuspensionNotice(suspended, modifier = Modifier.padding(8.dp))
                } else Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = input,
                        onValueChange = { if (it.length <= MESSAGE_MAX) input = it; sendError = null },
                        placeholder = { Text(if (iBlocked) "You blocked this user" else "Type a message...") },
                        enabled = !iBlocked,
                        modifier = Modifier.weight(1f),
                        maxLines = 4
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp).padding(2.dp))
                    } else {
                        IconButton(onClick = { send(input) }, enabled = input.isNotBlank() && !iBlocked) {
                            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PinnedListing(listing: Listing?, datesLine: String?, onClick: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = listing != null) { onClick() }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ListingThumbnail(listing = listing, size = 44.dp)
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = listing?.title ?: "Listing no longer available",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                listing?.priceLabel?.ifBlank { null }?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                datesLine?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (listing != null) Icon(Icons.Default.ChevronRight, contentDescription = "Open listing")
        }
    }
}

/** A chat bubble. Long-pressing someone else's message reports it. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(message: Message, isMe: Boolean, onLongPress: (() -> Unit)?) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = if (isMe) Alignment.CenterEnd else Alignment.CenterStart
    ) {
        Surface(
            color = if (isMe) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.secondaryContainer,
            shape = shape,
            modifier = Modifier
                .widthIn(max = 280.dp)
                .clip(shape)
                .then(
                    if (onLongPress != null) {
                        Modifier.combinedClickable(
                            onClick = {},
                            onLongClick = onLongPress,
                            onLongClickLabel = "Report message"
                        )
                    } else {
                        Modifier
                    }
                )
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                Text(text = message.body, style = MaterialTheme.typography.bodyMedium)
                Text(
                    text = formatMessageTime(message.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.End)
                )
            }
        }
    }
}
