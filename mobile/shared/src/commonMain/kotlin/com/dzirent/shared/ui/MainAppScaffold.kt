package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.dzirent.shared.model.Profile
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.ui.theme.DzirentAccent
import com.dzirent.shared.ui.theme.OnDzirentAccent
import kotlinx.coroutines.launch

private data class TabItem(val route: String, val label: String, val icon: ImageVector)

private val TabHome = TabItem("home", "Home", Icons.Default.Home)
private val TabInbox = TabItem("inbox", "Inbox", Icons.Default.MailOutline)
private val TabSearch = TabItem("search", "Search", Icons.Default.Search)
private val TabCloset = TabItem("closet", "Closet", Icons.Default.Checkroom)
private val TabSaved = TabItem("saved", "Saved", Icons.Default.BookmarkBorder)
private val TabRoutes = listOf(TabHome, TabInbox, TabSearch, TabCloset, TabSaved).map { it.route }.toSet()

@Composable
fun MainAppScaffold(
    repository: DzirentRepository,
    userProfile: Profile?,
    isGuest: Boolean,
    onSignOut: () -> Unit,
    onNavigateToAuth: () -> Unit,
    onGatedAction: (GatedAction) -> Unit
) {
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf(userProfile) }
    var currentTab by rememberSaveable { mutableStateOf(TabHome.route) }
    var showLocationSetup by remember { mutableStateOf(false) }
    var showFilterSheet by remember { mutableStateOf(false) }

    // Guest location state
    var guestCity by rememberSaveable { mutableStateOf<String?>("Austin, TX") }
    var guestLat by rememberSaveable { mutableStateOf<Double?>(30.27) }
    var guestLng by rememberSaveable { mutableStateOf<Double?>(-97.74) }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val settings = LocalAppSettings.current
    val session = remember(profile?.id, isGuest) {
        BrowseSession(repository, profile?.id, settings.defaultDistanceStep, settings.rentalDays)
    }

    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val onHome = backStackEntry?.destination?.route == TabHome.route

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

    fun openTab(route: String) {
        if (isGuest && (route == TabInbox.route || route == TabCloset.route || route == TabSaved.route)) {
            val action = when (route) {
                TabInbox.route -> GatedAction.MESSAGE_LENDER
                TabCloset.route -> GatedAction.LIST_PIECE
                TabSaved.route -> GatedAction.SAVE_PIECE
                else -> GatedAction.SAVE_PIECE
            }
            onGatedAction(action)
            return
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

    val currentRoute = backStackEntry?.destination?.route
    LaunchedEffect(currentRoute) {
        if (currentRoute != null && currentRoute in TabRoutes) {
            currentTab = currentRoute
        }
    }

    fun closeDrawer() {
        scope.launch { drawerState.close() }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = onHome || drawerState.isOpen,
        drawerContent = {
            SidebarContent(
                profile = profile,
                isGuest = isGuest,
                selectedCategory = session.filters.category,
                onOpenProfile = {
                    closeDrawer()
                    navController.navigate("profile")
                },
                onOpenSettings = {
                    closeDrawer()
                    navController.navigate("settings")
                },
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

        Scaffold(
            bottomBar = {
                NavigationBar {
                    listOf(TabHome, TabInbox).forEach { tab ->
                        BottomTab(tab, selected = currentTab == tab.route, dot = false) {
                            openTab(tab.route)
                        }
                    }
                    SearchTabButton(onClick = { openTab(TabSearch.route) })
                    listOf(TabCloset, TabSaved).forEach { tab ->
                        BottomTab(tab, selected = currentTab == tab.route, dot = false) {
                            openTab(tab.route)
                        }
                    }
                }
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = TabHome.route,
                modifier = Modifier.padding(innerPadding)
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
                        onOpenStudio = { handle -> navController.navigate("studio/$handle") },
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
                        row = row,
                        onBack = { navController.popBackStack() },
                        onOpenListing = { listingId -> navController.navigate("detail/$listingId") }
                    )
                }

                composable("search") {
                    SearchScreen(
                        repository = repository,
                        session = session,
                        profile = profile,
                        isGuest = isGuest,
                        guestCity = guestCity,
                        guestLat = guestLat,
                        guestLng = guestLng,
                        onSetLocation = { showLocationSetup = true },
                        onOpenListing = { listingId -> navController.navigate("detail/$listingId") }
                    )
                }

                composable("detail/{listingId}") { entry ->
                    val listingId = entry.arguments?.getString("listingId") ?: ""
                    ListingDetailScreen(
                        repository = repository,
                        listingId = listingId,
                        currentUserId = profile?.id,
                        isGuest = isGuest,
                        guestLat = guestLat,
                        guestLng = guestLng,
                        onBack = { navController.popBackStack() },
                        onEdit = { id -> navController.navigate("edit/$id") },
                        onMessageLender = { id ->
                            scope.launch {
                                try {
                                    val convId = repository.startConversation(id)
                                    navController.navigate("chat/$convId")
                                } catch (_: Exception) {
                                }
                            }
                        },
                        onOpenStudio = { handle -> navController.navigate("studio/$handle") },
                        onAuthRequired = onGatedAction
                    )
                }

                // --- 3B-2 PLACEHOLDERS ---
                composable("inbox") {
                    ScreenPlaceholder("Inbox", onBack = { navController.popBackStack() })
                }
                composable("closet") {
                    ScreenPlaceholder("Closet", onBack = { navController.popBackStack() })
                }
                composable("saved") {
                    ScreenPlaceholder("Saved", onBack = { navController.popBackStack() })
                }
                composable("studio/{handle}") { entry ->
                    val handle = entry.arguments?.getString("handle") ?: "Studio"
                    ScreenPlaceholder("Studio: @$handle", onBack = { navController.popBackStack() })
                }
                composable("chat/{conversationId}") { entry ->
                    val id = entry.arguments?.getString("conversationId") ?: ""
                    ScreenPlaceholder("Chat ($id)", onBack = { navController.popBackStack() })
                }
                composable("profile") {
                    ScreenPlaceholder("Profile", onBack = { navController.popBackStack() })
                }
                composable("settings") {
                    ScreenPlaceholder("Settings", onBack = { navController.popBackStack() }, onSignOut = onSignOut)
                }
                composable("measurements") {
                    ScreenPlaceholder("Body Measurements", onBack = { navController.popBackStack() })
                }
                composable("edit/{listingId}") { entry ->
                    val id = entry.arguments?.getString("listingId") ?: ""
                    ScreenPlaceholder("Edit Listing ($id)", onBack = { navController.popBackStack() })
                }
            }
        }
    }
}

@Composable
private fun RowScope.BottomTab(
    tab: TabItem,
    selected: Boolean,
    dot: Boolean,
    onClick: () -> Unit
) {
    NavigationBarItem(
        icon = {
            BadgedBox(badge = { if (dot) AccentDot() }) {
                Icon(tab.icon, contentDescription = tab.label)
            }
        },
        label = {
            Text(tab.label, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
        },
        selected = selected,
        onClick = onClick
    )
}

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
            modifier = Modifier.size(56.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Search, contentDescription = "Search", modifier = Modifier.size(28.dp))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenPlaceholder(
    title: String,
    onBack: () -> Unit,
    onSignOut: (() -> Unit)? = null
) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(title) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        Box(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "This screen will be ported in Step 3B-2.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
                if (onSignOut != null) {
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(onClick = onSignOut) {
                        Text("Sign Out")
                    }
                }
            }
        }
    }
}

