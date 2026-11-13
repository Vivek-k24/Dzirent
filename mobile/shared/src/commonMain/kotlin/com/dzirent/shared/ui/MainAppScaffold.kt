package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Checkroom
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.dzirent.shared.model.Profile
import com.dzirent.shared.model.Roles
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.platform.SettingsStorage
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.ui.theme.DzirentAccent
import com.dzirent.shared.ui.theme.OnDzirentAccent
import com.dzirent.shared.util.GuideTarget
import com.dzirent.shared.util.HomeRow
import com.dzirent.shared.util.LinkTarget
import com.dzirent.shared.util.SetupItem
import com.dzirent.shared.util.SetupStatus
import com.dzirent.shared.util.datesQuestion
import com.dzirent.shared.util.defaultBrowseRange
import com.dzirent.shared.util.guideSteps
import com.dzirent.shared.util.hasAnyBodyMeasurement
import com.dzirent.shared.util.setupItems
import com.dzirent.shared.util.today
import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** A bottom-bar destination. Labels are one short word so five tabs fit on narrow phones. */
private data class TabItem(val route: String, val label: String, val icon: ImageVector)

private val TabHome = TabItem("home", "Home", Icons.Default.Home)
private val TabInbox = TabItem("inbox", "Inbox", Icons.Default.MailOutline)
private val TabSearch = TabItem("search", "Search", Icons.Default.Search)
private val TabCloset = TabItem("closet", "Closet", Icons.Default.Checkroom)
private val TabSaved = TabItem("saved", "Saved", Icons.Default.BookmarkBorder)
private val TabRoutes = listOf(TabHome, TabInbox, TabSearch, TabCloset, TabSaved).map { it.route }.toSet()

/** How often the Inbox dot re-checks for news while the app is open. */
private const val INBOX_REFRESH_MS = 60_000L

/**
 * The signed-in app, as in the reference. Guests ([isGuest], no [userProfile]) get the same
 * shell; everything that needs an account asks them to sign up ([onGatedAction]).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainAppScaffold(
    repository: DzirentRepository,
    userProfile: Profile?,
    isGuest: Boolean,
    settingsStorage: SettingsStorage?,
    onSignOut: () -> Unit,
    onNavigateToAuth: () -> Unit,
    onGatedAction: (GatedAction) -> Unit,
    /** A chat to open now (a tapped notification); [onOpenChatHandled] once it is opened. */
    openChatId: String? = null,
    onOpenChatHandled: () -> Unit = {},
    /** A dzirent.com link to open now (P5C); [onOpenLinkHandled] once it is opened. */
    openLink: LinkTarget? = null,
    onOpenLinkHandled: () -> Unit = {}
) {
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    // Profile lives here so a role change on the Profile screen updates the app at once.
    var profile by remember { mutableStateOf(userProfile) }
    val me = profile?.id.orEmpty()
    var currentTab by rememberSaveable { mutableStateOf(TabHome.route) }
    var showLocationSetup by remember { mutableStateOf(false) }
    var inboxHasNews by remember { mutableStateOf(false) }
    val backStackEntry by navController.currentBackStackEntryAsState()

    // Guests have no profile; their place is kept for this visit only.
    var guestCity by rememberSaveable { mutableStateOf<String?>("Austin, TX") }
    var guestLat by rememberSaveable { mutableStateOf<Double?>(30.27) }
    var guestLng by rememberSaveable { mutableStateOf<Double?>(-97.74) }

    // Filters (set from the sidebar), dates and nearby listings, shared by Home and Search.
    val settings = LocalAppSettings.current
    val session = remember(profile?.id, isGuest) {
        BrowseSession(repository, profile?.id.orEmpty(), settings.defaultDistanceStep, settings.rentalDays)
    }
    // Changing a default in Settings applies to the current browse right away.
    LaunchedEffect(session, settings.defaultDistanceStep) {
        session.filters = session.filters.copy(distanceStep = settings.defaultDistanceStep)
    }
    LaunchedEffect(session, settings.rentalDays) {
        session.dates = defaultBrowseRange(today(), settings.rentalDays)
    }
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    var showFilterSheet by remember { mutableStateOf(false) }
    val onHome = backStackEntry?.destination?.route == TabHome.route

    // First run: the welcome checklist (which includes location) and the "Show me around" guide.
    val onboarding = remember(profile?.id) { profile?.let { OnboardingStore(device.prefs, it.id) } }
    var showWelcome by remember { mutableStateOf(false) }
    var guideActive by rememberSaveable { mutableStateOf(false) }
    val guideTargets = remember { GuideTargets() }
    var setupCardDismissed by remember(profile?.id) { mutableStateOf(onboarding?.setupCardDismissed ?: true) }
    // Measurements and first piece are loaded; location and studio are read from the profile.
    var loadedSetup by remember(profile?.id) { mutableStateOf<SetupStatus?>(null) }
    val setupStatus = profile?.let { p -> loadedSetup?.copy(location = p.hasLocation, studio = !p.studioHandle.isNullOrBlank()) }
    val route = backStackEntry?.destination?.route

    // Once per user on this device, right after their first sign-up or login. This replaces
    // the old automatic location prompt, so there is never a second popup.
    LaunchedEffect(profile?.id) {
        if (onboarding != null && !onboarding.welcomeSeen) {
            onboarding.markWelcomeSeen()
            showWelcome = true
        }
    }

    suspend fun refreshSetup() {
        val p = profile ?: return
        runCatching {
            val body = repository.getPrivateProfile(p.id)
            val hasPiece = Roles.canLend(p.role) && repository.getMyListings(p.id).isNotEmpty()
            SetupStatus(location = p.hasLocation, measurements = hasAnyBodyMeasurement(body), studio = false, firstPiece = hasPiece)
        }.onSuccess { loadedSetup = it }
    }
    LaunchedEffect(route, showWelcome) {
        if (showWelcome || route == "profile") refreshSetup()
    }

    // The Inbox dot: refresh on every screen change and once a minute.
    suspend fun refreshInboxDot() {
        if (profile == null) return
        runCatching { repository.getInboxSnapshot(me).hasNews }.onSuccess { inboxHasNews = it }
    }
    LaunchedEffect(backStackEntry?.destination?.route) { refreshInboxDot() }
    LaunchedEffect(profile?.id) {
        while (profile != null) {
            delay(INBOX_REFRESH_MS)
            refreshInboxDot()
        }
    }

    if (showLocationSetup) {
        LocationSetupDialog(
            repository = repository,
            profile = profile,
            onDismiss = { showLocationSetup = false },
            onSaved = { updated ->
                profile = updated
                showLocationSetup = false
            },
            onGuestLocationSet = { city, lat, lng ->
                guestCity = city
                guestLat = lat
                guestLng = lng
                showLocationSetup = false
            }
        )
    }

    /**
     * Home always shows Home itself. Screens opened from it (Settings, Profile, a listing...)
     * sit on Home's back stack, so restoring its saved state would bring them back; popping
     * to Home drops them. Tapping the tab you are on returns to its root. The other tabs
     * keep their place when you switch between them.
     */
    fun openTab(route: String) {
        if (isGuest) {
            when (route) {
                TabInbox.route -> return onGatedAction(GatedAction.MESSAGE_LENDER)
                TabCloset.route -> return onGatedAction(GatedAction.LIST_PIECE)
                TabSaved.route -> return onGatedAction(GatedAction.SAVE_PIECE)
            }
        }
        when {
            route == TabHome.route -> navController.navigate(route) {
                popUpTo(TabHome.route) { saveState = true }
                launchSingleTop = true
            }
            route == currentTab && navController.popBackStack(route, inclusive = false) -> Unit
            else -> navController.navigate(route) {
                popUpTo(TabHome.route) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
        currentTab = route
    }

    // Back from a tab's root lands on Home, so the selected tab follows the back stack too.
    LaunchedEffect(route) {
        if (route != null && route in TabRoutes) currentTab = route
    }

    fun openChat(conversationId: String, draft: String? = null) =
        navController.navigate("chat/$conversationId" + (draft?.let { "?draft=${it.encodeURLParameter()}" } ?: ""))

    // A tapped notification opens its chat, once the NavHost has its graph.
    LaunchedEffect(openChatId) {
        val conversationId = openChatId ?: return@LaunchedEffect
        snapshotFlow { backStackEntry }.first { it != null }
        openChat(conversationId)
        onOpenChatHandled()
    }

    /** Opens the chat about a listing (creating it if needed), optionally with a draft message. */
    fun startChat(listingId: String, lenderId: String, draft: String? = null) {
        if (isGuest) return onGatedAction(GatedAction.MESSAGE_LENDER)
        scope.launch {
            try {
                val conversation = repository.getOrCreateConversation(
                    listingId = listingId,
                    renterId = me,
                    lenderId = lenderId
                )
                openChat(conversation.id, draft)
            } catch (e: Exception) {
                device.toast(e.userMessage("Couldn't open the chat. Please try again."))
            }
        }
    }

    fun openStudio(lenderId: String) {
        if (isGuest) return onGatedAction(GatedAction.OPEN_STUDIO)
        if (lenderId.isNotBlank()) navController.navigate("studio/$lenderId")
    }

    // A dzirent.com link opened in the app (P5C), once the NavHost has its graph. The studio
    // route takes the studio handle (get_studio), so a link's handle opens it directly.
    LaunchedEffect(openLink) {
        val link = openLink ?: return@LaunchedEffect
        snapshotFlow { backStackEntry }.first { it != null }
        when (link) {
            is LinkTarget.Listing -> navController.navigate("detail/${link.id}")
            is LinkTarget.Studio -> openStudio(link.handle)
        }
        onOpenLinkHandled()
    }

    fun closeDrawer() {
        scope.launch { drawerState.close() }
    }

    /** Sidebar rows that leave Home close the drawer first, so Back returns to Home. */
    fun openFromDrawer(route: String) {
        closeDrawer()
        navController.navigate(route)
    }

    /**
     * The guide points at Home's date chip and avatar, so it always runs on Home. Home is
     * always at the bottom of the back stack; popping to it (rather than opening the Home
     * tab, which restores screens like Settings opened from it) shows Home itself.
     */
    fun startGuide() {
        showWelcome = false
        closeDrawer()
        if (!onHome) navController.popBackStack(TabHome.route, inclusive = false)
        currentTab = TabHome.route
        guideActive = true
    }

    val signedIn = profile
    if (showWelcome && signedIn != null) {
        WelcomeDialog(
            items = setupItems(Roles.canLend(signedIn.role)),
            status = setupStatus,
            onItem = { item ->
                showWelcome = false
                when (item) {
                    SetupItem.LOCATION -> showLocationSetup = true
                    SetupItem.MEASUREMENTS -> navController.navigate("measurements")
                    SetupItem.STUDIO -> navController.navigate("mystudio")
                    SetupItem.FIRST_PIECE -> navController.navigate("list")
                }
            },
            onShowMeAround = { startGuide() },
            onLater = { showWelcome = false }
        )
    }

    PlatformBackHandler(enabled = drawerState.isOpen) { closeDrawer() }

    if (showFilterSheet) {
        FilterSheet(
            current = session.filters,
            onApply = { applied ->
                session.filters = applied
                showFilterSheet = false
                closeDrawer()
                if (!onHome) openTab(TabHome.route)
            },
            onDismiss = { showFilterSheet = false }
        )
    }

    CompositionLocalProvider(LocalGuideTargets provides guideTargets) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Swipe to open only on Home, where the avatar opens the same drawer.
            ModalNavigationDrawer(
                drawerState = drawerState,
                gesturesEnabled = onHome || drawerState.isOpen,
                drawerContent = {
                    SidebarContent(
                        profile = profile,
                        isGuest = isGuest,
                        selectedCategory = session.filters.category,
                        onOpenProfile = { openFromDrawer("profile") },
                        onOpenSettings = { openFromDrawer("settings") },
                        onSelectCategory = { category ->
                            session.filters = session.filters.withCategory(category)
                            closeDrawer()
                            if (!onHome) openTab(TabHome.route)
                        },
                        onOpenFilter = { showFilterSheet = true },
                        onSignIn = {
                            closeDrawer()
                            onNavigateToAuth()
                        }
                    )
                }
            ) {
                Scaffold(
                    bottomBar = {
                        NavigationBar {
                            listOf(TabHome, TabInbox).forEach { tab ->
                                BottomTab(tab, selected = currentTab == tab.route, dot = tab == TabInbox && inboxHasNews) {
                                    openTab(tab.route)
                                }
                            }
                            SearchTabButton(onClick = { openTab(TabSearch.route) })
                            BottomTab(
                                TabCloset,
                                selected = currentTab == TabCloset.route,
                                dot = false,
                                modifier = Modifier.guideTarget(GuideTarget.CLOSET)
                            ) { openTab(TabCloset.route) }
                            BottomTab(
                                TabSaved,
                                selected = currentTab == TabSaved.route,
                                dot = false,
                                modifier = Modifier.guideTarget(GuideTarget.SAVED)
                            ) { openTab(TabSaved.route) }
                        }
                    }
                ) { innerPadding ->
                    PlatformNavigationBackHandler(navController)
                    NavHost(
                        navController = navController,
                        startDestination = TabHome.route,
                        modifier = Modifier.padding(innerPadding).consumeScaffoldInsets(innerPadding)
                    ) {
                        composable("home") {
                            HomeScreen(
                                session = session,
                                profile = profile,
                                isGuest = isGuest,
                                guestCity = guestCity,
                                guestLat = guestLat,
                                guestLng = guestLng,
                                onOpenSidebar = { scope.launch { drawerState.open() } },
                                onSetLocation = { showLocationSetup = true },
                                onOpenListing = { listingId -> navController.navigate("detail/$listingId") },
                                onOpenStudio = { lenderId -> openStudio(lenderId) },
                                onSeeAll = { row -> navController.navigate("seeall/${row.name}") },
                                onOpenMeasurements = { navController.navigate("measurements") },
                                onAuthRequired = onGatedAction
                            )
                        }
                        composable("seeall/{row}") { entry ->
                            val rowName = entry.arguments?.getString("row")
                            val row = HomeRow.entries.firstOrNull { it.name == rowName } ?: HomeRow.NEW
                            SeeAllScreen(
                                session = session,
                                me = me,
                                lat = if (isGuest) guestLat else profile?.approxLat,
                                lng = if (isGuest) guestLng else profile?.approxLng,
                                row = row,
                                onBack = { navController.popBackStack() },
                                onOpenListing = { listingId -> navController.navigate("detail/$listingId") }
                            )
                        }
                        composable("search") {
                            SearchScreen(
                                session = session,
                                profile = profile,
                                isGuest = isGuest,
                                guestCity = guestCity,
                                guestLat = guestLat,
                                guestLng = guestLng,
                                settingsStorage = settingsStorage,
                                repository = repository,
                                onSetLocation = { showLocationSetup = true },
                                onOpenListing = { listingId -> navController.navigate("detail/$listingId") }
                            )
                        }
                        composable("detail/{listingId}") { entry ->
                            val listingId = entry.arguments?.getString("listingId") ?: ""
                            ListingDetailScreen(
                                repository = repository,
                                listingId = listingId,
                                currentUserId = me,
                                onBack = { navController.popBackStack() },
                                onEdit = { id -> navController.navigate("edit/$id") },
                                onMessageLender = { targetListingId, lenderId -> startChat(targetListingId, lenderId) },
                                onOpenStudio = { lenderId -> openStudio(lenderId) },
                                onGuestAction = if (isGuest) onGatedAction else null,
                                dates = session.dates
                            )
                        }
                        composable("studio/{lenderId}") { entry ->
                            val lenderId = entry.arguments?.getString("lenderId") ?: ""
                            StudioScreen(
                                repository = repository,
                                lenderId = lenderId,
                                currentUserId = me,
                                onBack = { navController.popBackStack() },
                                onOpenListing = { id -> navController.navigate("detail/$id") },
                                onMessageAbout = { piece ->
                                    startChat(piece.id, piece.lenderId, datesQuestion(session.dates))
                                },
                                // "From studios you saved" changes.
                                onSavedChanged = { session.invalidate() }
                            )
                        }
                        composable("inbox") {
                            InboxScreen(
                                repository = repository,
                                currentUserId = me,
                                onConversationClick = { conversationId -> openChat(conversationId) },
                                onNewsChanged = { inboxHasNews = it },
                                onBrowse = { openTab(TabHome.route) }
                            )
                        }
                        composable(
                            "chat/{conversationId}?draft={draft}",
                            arguments = listOf(navArgument("draft") { type = NavType.StringType; nullable = true; defaultValue = null })
                        ) { entry ->
                            val conversationId = entry.arguments?.getString("conversationId") ?: ""
                            ChatScreen(
                                repository = repository,
                                conversationId = conversationId,
                                currentUserId = me,
                                onBack = { navController.popBackStack() },
                                onOpenListing = { id -> navController.navigate("detail/$id") },
                                myDates = session.dates,
                                initialDraft = entry.arguments?.getString("draft")
                            )
                        }
                        composable("list") {
                            val p = profile ?: return@composable
                            ListingEditorScreen(
                                repository = repository,
                                profile = p,
                                listingId = null,
                                onSetLocation = { showLocationSetup = true },
                                onBack = { navController.popBackStack() },
                                onSaved = { navController.popBackStack() }
                            )
                        }
                        composable("edit/{listingId}") { entry ->
                            val p = profile ?: return@composable
                            val listingId = entry.arguments?.getString("listingId") ?: ""
                            ListingEditorScreen(
                                repository = repository,
                                profile = p,
                                listingId = listingId,
                                onSetLocation = { showLocationSetup = true },
                                onBack = { navController.popBackStack() },
                                onSaved = { navController.popBackStack() }
                            )
                        }
                        composable("closet") {
                            val p = profile ?: return@composable
                            // Lenders see their listings (and "List an item"); renters see their rentals.
                            if (Roles.canLend(p.role)) {
                                MyClosetScreen(
                                    repository = repository,
                                    currentUserId = p.id,
                                    showRentalsTab = p.role == Roles.BOTH,
                                    onListItem = { navController.navigate("list") },
                                    onOpenListing = { id -> navController.navigate("detail/$id") },
                                    onEditListing = { id -> navController.navigate("edit/$id") },
                                    onOpenChat = { conversationId -> openChat(conversationId) },
                                    onBrowse = { openTab(TabHome.route) }
                                )
                            } else {
                                MyRentalsScreen(
                                    repository = repository,
                                    currentUserId = p.id,
                                    onOpenChat = { conversationId -> openChat(conversationId) },
                                    onBrowse = { openTab(TabHome.route) }
                                )
                            }
                        }
                        composable("saved") {
                            SavedScreen(
                                repository = repository,
                                currentUserId = me,
                                onOpenListing = { id -> navController.navigate("detail/$id") },
                                onOpenStudio = { lenderId -> openStudio(lenderId) },
                                onMessageAboutDates = { piece ->
                                    startChat(piece.id, piece.lenderId, datesQuestion(session.dates))
                                },
                                onBrowse = { openTab(TabHome.route) },
                                onStudiosChanged = { session.invalidate() }
                            )
                        }
                        composable("profile") {
                            val p = profile ?: return@composable
                            ProfileScreen(
                                repository = repository,
                                profile = p,
                                onProfileUpdated = { updated -> profile = updated },
                                onBack = { navController.popBackStack() },
                                onOpenMeasurements = { navController.navigate("measurements") },
                                onOpenMyStudio = { navController.navigate("mystudio") },
                                showFinishSetup = setupStatus?.basicsDone == false && !setupCardDismissed,
                                onOpenSetup = { showWelcome = true },
                                onDismissSetup = {
                                    onboarding?.dismissSetupCard()
                                    setupCardDismissed = true
                                }
                            )
                        }
                        composable("mystudio") {
                            val p = profile ?: return@composable
                            MyStudioScreen(
                                repository = repository,
                                profile = p,
                                onBack = { navController.popBackStack() },
                                onSaved = { updated ->
                                    profile = updated
                                    navController.popBackStack()
                                }
                            )
                        }
                        composable("settings") {
                            SettingsScreen(
                                repository = repository,
                                settingsStore = settingsStorage,
                                profile = profile,
                                onBack = { navController.popBackStack() },
                                onSetLocation = { showLocationSetup = true },
                                onOpenBlockedUsers = { navController.navigate("blocked") },
                                onClearSearchHistory = { settingsStorage?.clearRecentSearches(me) },
                                onAppTour = { startGuide() },
                                onOpenAbout = { navController.navigate("about") },
                                onSignOut = onSignOut,
                                onAccountDeleted = {
                                    settingsStorage?.clearRecentSearches(me)
                                    onSignOut()
                                }
                            )
                        }
                        composable("about") {
                            AboutScreen(
                                onBack = { navController.popBackStack() },
                                onOpenHowItWorks = { navController.navigate("policy") },
                                onOpenCommunityPolicy = { navController.navigate("community") },
                                onOpenLicenses = { navController.navigate("licenses") }
                            )
                        }
                        composable("licenses") {
                            LicensesScreen(onBack = { navController.popBackStack() })
                        }
                        composable("measurements") {
                            val p = profile ?: return@composable
                            BodyMeasurementsScreen(
                                repository = repository,
                                userId = p.id,
                                onBack = {
                                    // The fit row depends on these, so Home loads them again.
                                    session.invalidate()
                                    navController.popBackStack()
                                }
                            )
                        }
                        composable("blocked") {
                            BlockedUsersScreen(
                                repository = repository,
                                currentUserId = me,
                                onBack = { navController.popBackStack() }
                            )
                        }
                        composable("policy") {
                            HowDzirentWorksScreen(onBack = { navController.popBackStack() })
                        }
                        composable("community") {
                            CommunityPolicyScreen(onBack = { navController.popBackStack() })
                        }
                    }
                }
            }
            // Above the drawer and bottom bar, so it can point at both and block taps underneath.
            if (guideActive) {
                GuideOverlay(
                    steps = guideSteps(profile?.role?.let { Roles.canLend(it) } ?: false),
                    targets = guideTargets,
                    onFinish = { guideActive = false }
                )
            }
        }
    }
}

@Composable
private fun RowScope.BottomTab(
    tab: TabItem,
    selected: Boolean,
    dot: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    NavigationBarItem(
        modifier = modifier,
        icon = {
            BadgedBox(badge = { if (dot) AccentDot() }) {
                // The label below already names the tab; the icon adds only the new-activity dot.
                Icon(tab.icon, contentDescription = if (dot) "New activity" else null)
            }
        },
        label = {
            Text(tab.label, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
        },
        selected = selected,
        onClick = onClick
    )
}

/** The raised, accent-colored Search button in the middle of the bottom bar. */
@Composable
private fun RowScope.SearchTabButton(onClick: () -> Unit) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .weight(1f)
            .align(Alignment.CenterVertically)
    ) {
        Surface(
            onClick = onClick,
            shape = CircleShape,
            color = DzirentAccent,
            contentColor = OnDzirentAccent,
            shadowElevation = 6.dp,
            modifier = Modifier
                .size(56.dp)
                .guideTarget(GuideTarget.SEARCH)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Search, contentDescription = TabSearch.label, modifier = Modifier.size(28.dp))
            }
        }
    }
}

/** System Back while [enabled] (Android's back gesture; iOS's swipe from the left edge). */
@Composable
expect fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit)

/**
 * System Back pops [navController] while it has somewhere to go back to. Android's NavHost does
 * this itself (no-op there); iOS wires it to the edge swipe.
 */
@Composable
expect fun PlatformNavigationBackHandler(navController: NavHostController)

/**
 * iOS: the Scaffold's padding counts as used, so a screen's own TopAppBar doesn't add the status
 * bar inset a second time. Android: unchanged (returns this modifier).
 */
expect fun Modifier.consumeScaffoldInsets(padding: PaddingValues): Modifier
