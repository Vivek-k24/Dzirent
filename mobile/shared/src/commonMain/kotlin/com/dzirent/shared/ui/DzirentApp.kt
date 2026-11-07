package com.dzirent.shared.ui

import com.dzirent.shared.util.*
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.dzirent.shared.model.Profile
import com.dzirent.shared.platform.DeviceServices
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.platform.SettingsStorage
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.ui.theme.DzirentTheme
import kotlinx.coroutines.launch

sealed class AuthScreenState {
    object Loading : AuthScreenState()
    object AuthFlow : AuthScreenState()
    data class Authenticated(val profile: Profile) : AuthScreenState()
    /** Signed in, but the current Terms of Use or Privacy Policy isn't accepted yet. */
    data class NeedsTerms(val profile: Profile) : AuthScreenState()
    /** Signed in, but the age gate blocked the account (Dzirent is 18+). */
    data class AgeBlocked(val profile: Profile) : AuthScreenState()
    object Guest : AuthScreenState()
}

/**
 * Where a signed-in account goes: the age gate first (the app store's age signal, on sign-in and
 * once a day), then the terms step while the current versions aren't accepted. If the terms
 * check can't run (no connection), the app opens and asks again next time.
 */
private suspend fun signedInState(
    repository: DzirentRepository,
    device: DeviceServices,
    profile: Profile,
    onSignIn: Boolean
): AuthScreenState = when {
    AgeGate.check(repository, device, profile.id, onSignIn) -> AuthScreenState.AgeBlocked(profile)
    runCatching { repository.needsLegalAcceptance() }.getOrDefault(false) -> AuthScreenState.NeedsTerms(profile)
    else -> AuthScreenState.Authenticated(profile)
}

/**
 * Main Dzirent Composable entry point.
 */
@Composable
fun DzirentApp(
    repository: DzirentRepository = remember { DzirentRepository.shared },
    appSettings: AppSettings = remember { AppSettings() },
    settingsStorage: SettingsStorage? = null,
    /** The chat a tapped notification asks for; opened once someone is signed in. */
    openChatId: String? = null,
    onOpenChatHandled: () -> Unit = {}
) {
    var screenState by remember { mutableStateOf<AuthScreenState>(AuthScreenState.Loading) }
    var firstVisitSeen by rememberSaveable { mutableStateOf(false) }
    var pendingGatedAction by remember { mutableStateOf<GatedAction?>(null) }
    var authStartDestination by rememberSaveable { mutableStateOf("welcome") }
    val device = LocalDevice.current
    val push = device.push
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        repository.awaitAuth()
        val profile = runCatching { repository.getCurrentProfile() }.getOrNull()
        if (profile != null) {
            screenState = signedInState(repository, device, profile, onSignIn = false)
        } else {
            // Guest mode: first time user sees first visit sheet
            screenState = AuthScreenState.Guest
        }
    }

    // This phone gets the signed-in account's notifications (each sign-in and app start).
    val signedInId = (screenState as? AuthScreenState.Authenticated)?.profile?.id
    LaunchedEffect(signedInId) {
        if (signedInId != null) registerPush(repository, push, signedInId)
    }
    // Chat notifications are for signed-in accounts; a guest just lands on Home.
    LaunchedEffect(openChatId, screenState) {
        if (openChatId != null && (screenState is AuthScreenState.Guest || screenState is AuthScreenState.AuthFlow)) {
            onOpenChatHandled()
        }
    }

    DzirentTheme(darkTheme = appSettings.theme.isDark(isSystemInDarkTheme())) {
        CompositionLocalProvider(LocalAppSettings provides appSettings) {
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.background
            ) {
                when (val state = screenState) {
                    is AuthScreenState.Loading -> {
                        LoadingView(message = "Starting Dzirent...")
                    }
                    is AuthScreenState.AuthFlow -> {
                        AuthNavHost(
                            repository = repository,
                            startDestination = authStartDestination,
                            onLoginSuccess = { profile ->
                                firstVisitSeen = true
                                screenState = AuthScreenState.Loading
                                scope.launch { screenState = signedInState(repository, device, profile, onSignIn = true) }
                            },
                            onBrowseAsGuest = {
                                firstVisitSeen = true
                                screenState = AuthScreenState.Guest
                            }
                        )
                    }
                    is AuthScreenState.AgeBlocked -> {
                        AgeBlockedScreen(
                            repository = repository,
                            onSignedOut = { screenState = AuthScreenState.Guest }
                        )
                    }
                    is AuthScreenState.NeedsTerms -> {
                        TermsUpdateScreen(
                            repository = repository,
                            onAgreed = { screenState = AuthScreenState.Authenticated(state.profile) },
                            onSignedOut = { screenState = AuthScreenState.Guest }
                        )
                    }
                    is AuthScreenState.Authenticated -> {
                        MainAppScaffold(
                            repository = repository,
                            userProfile = state.profile,
                            isGuest = false,
                            settingsStorage = settingsStorage,
                            onSignOut = {
                                screenState = AuthScreenState.Guest
                            },
                            onNavigateToAuth = {
                                authStartDestination = "login"
                                screenState = AuthScreenState.AuthFlow
                            },
                            onGatedAction = {},
                            openChatId = openChatId,
                            onOpenChatHandled = onOpenChatHandled
                        )
                    }
                    is AuthScreenState.Guest -> {
                        MainAppScaffold(
                            repository = repository,
                            userProfile = null,
                            isGuest = true,
                            settingsStorage = settingsStorage,
                            onSignOut = {},
                            onNavigateToAuth = {
                                authStartDestination = "login"
                                screenState = AuthScreenState.AuthFlow
                            },
                            onGatedAction = { action ->
                                pendingGatedAction = action
                            }
                        )

                        if (!firstVisitSeen) {
                            FirstVisitBottomSheet(
                                onSignIn = {
                                    firstVisitSeen = true
                                    authStartDestination = "login"
                                    screenState = AuthScreenState.AuthFlow
                                },
                                onSignUp = {
                                    firstVisitSeen = true
                                    authStartDestination = "signup"
                                    screenState = AuthScreenState.AuthFlow
                                },
                                onBrowseGuest = {
                                    firstVisitSeen = true
                                }
                            )
                        }

                        pendingGatedAction?.let { action ->
                            SignUpPromptDialog(
                                action = action,
                                onDismiss = { pendingGatedAction = null },
                                onSignIn = {
                                    pendingGatedAction = null
                                    authStartDestination = "login"
                                    screenState = AuthScreenState.AuthFlow
                                },
                                onSignUp = {
                                    pendingGatedAction = null
                                    authStartDestination = "signup"
                                    screenState = AuthScreenState.AuthFlow
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AuthNavHost(
    repository: DzirentRepository,
    startDestination: String = "welcome",
    onLoginSuccess: (Profile) -> Unit,
    onBrowseAsGuest: () -> Unit
) {
    val authNavController = rememberNavController()

    PlatformNavigationBackHandler(authNavController)
    NavHost(
        navController = authNavController,
        startDestination = startDestination
    ) {
        composable("welcome") {
            WelcomeScreen(
                onNavigateToLogin = { authNavController.navigate("login") },
                onNavigateToSignUp = { authNavController.navigate("signup") },
                onBrowseAsGuest = onBrowseAsGuest
            )
        }
        composable("login") {
            LoginScreen(
                repository = repository,
                onLoginSuccess = onLoginSuccess,
                onNavigateToSignUp = { authNavController.navigate("signup") },
                onNavigateToWelcome = { authNavController.popBackStack("welcome", inclusive = false) }
            )
        }
        composable("signup") {
            SignUpScreen(
                repository = repository,
                onSignUpSuccess = onLoginSuccess,
                onNavigateToLogin = { authNavController.navigate("login") },
                onNavigateToWelcome = { authNavController.popBackStack("welcome", inclusive = false) }
            )
        }
    }
}

