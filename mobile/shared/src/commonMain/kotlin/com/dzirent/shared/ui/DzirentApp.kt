package com.dzirent.shared.ui

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
import com.dzirent.shared.platform.AppSettings
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.ui.theme.DzirentTheme

sealed class AuthScreenState {
    object Loading : AuthScreenState()
    object AuthFlow : AuthScreenState()
    data class Authenticated(val profile: Profile) : AuthScreenState()
    object Guest : AuthScreenState()
}

/**
 * Main Dzirent Composable entry point.
 */
@Composable
fun DzirentApp(
    repository: DzirentRepository = remember { DzirentRepository() },
    appSettings: AppSettings = remember { AppSettings() }
) {
    var screenState by remember { mutableStateOf<AuthScreenState>(AuthScreenState.Loading) }
    var firstVisitSeen by rememberSaveable { mutableStateOf(false) }
    var pendingGatedAction by remember { mutableStateOf<GatedAction?>(null) }
    var authStartDestination by rememberSaveable { mutableStateOf("welcome") }

    LaunchedEffect(Unit) {
        repository.awaitAuth()
        val profile = runCatching { repository.getCurrentProfile() }.getOrNull()
        if (profile != null) {
            screenState = AuthScreenState.Authenticated(profile)
        } else {
            // Guest mode: first time user sees first visit sheet
            screenState = AuthScreenState.Guest
        }
    }

    DzirentTheme(darkTheme = isSystemInDarkTheme()) {
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
                                screenState = AuthScreenState.Authenticated(profile)
                            },
                            onBrowseAsGuest = {
                                firstVisitSeen = true
                                screenState = AuthScreenState.Guest
                            }
                        )
                    }
                    is AuthScreenState.Authenticated -> {
                        MainAppScaffold(
                            repository = repository,
                            userProfile = state.profile,
                            isGuest = false,
                            onSignOut = {
                                screenState = AuthScreenState.Guest
                            },
                            onNavigateToAuth = {
                                authStartDestination = "login"
                                screenState = AuthScreenState.AuthFlow
                            },
                            onGatedAction = {}
                        )
                    }
                    is AuthScreenState.Guest -> {
                        MainAppScaffold(
                            repository = repository,
                            userProfile = null,
                            isGuest = true,
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

