package com.dzirent.shared.ui

import com.dzirent.shared.util.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checkroom
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.PASSWORD_MIN_LENGTH
import com.dzirent.shared.model.Profile
import com.dzirent.shared.model.UsCity
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch

@Composable
fun WelcomeScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToSignUp: () -> Unit,
    onBrowseAsGuest: (() -> Unit)? = null
) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.Checkroom,
                contentDescription = "Dzirent Logo",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(96.dp)
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "Dzirent",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Rent outfits from closets near you",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(48.dp))

            Button(
                onClick = onNavigateToLogin,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text("Log In")
            }
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = onNavigateToSignUp,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text("Sign Up")
            }

            if (onBrowseAsGuest != null) {
                Spacer(modifier = Modifier.height(16.dp))
                TextButton(
                    onClick = onBrowseAsGuest,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                ) {
                    Text("Browse as guest")
                }
            }
        }
    }
}

/**
 * E1: "Continue with Google" (Supabase OAuth in Custom Tabs, back through dzirent://auth/callback).
 * Android only: the iPhone keeps password sign-in until Apple and Google sign-in come together there.
 */
@Composable
fun GoogleSignInButton(repository: DzirentRepository, onError: (String) -> Unit) {
    if (LocalDevice.current.push.platform != "android") return
    val scope = rememberCoroutineScope()
    var starting by remember { mutableStateOf(false) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f))
        Text("  or  ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider(modifier = Modifier.weight(1f))
    }
    OutlinedButton(
        onClick = {
            scope.launch {
                starting = true
                try {
                    repository.signInWithGoogle()
                } catch (e: Exception) {
                    onError(e.userMessage("Google sign-in isn't available right now."))
                }
                starting = false
            }
        },
        enabled = !starting,
        modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
    ) {
        Text(if (starting) "Opening Google..." else "Continue with Google")
    }
}

/**
 * E1: "Forgot password?": the address (prefilled from the sign-in screen), then always the same
 * neutral answer. The emailed link opens the website's reset page in the browser.
 */
@Composable
fun ForgotPasswordScreen(
    repository: DzirentRepository,
    initialEmail: String,
    onBack: () -> Unit
) {
    var email by remember { mutableStateOf(initialEmail) }
    var sending by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<ShownError?>(null) }
    var sent by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = "Forgot your password?",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.asHeading()
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Enter your account's email. We'll send a link to choose a new password.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(24.dp))
            if (sent) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                ) {
                    Text(
                        text = NEUTRAL_RESET,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.padding(16.dp).announced()
                    )
                }
            }
            OutlinedTextField(
                value = email,
                onValueChange = { email = it; problem = null },
                label = { Text("Email") },
                leadingIcon = { Icon(Icons.Default.Mail, contentDescription = null) },
                isError = problem != null,
                supportingText = problem?.let { { Text(it.text, modifier = Modifier.announced()) } },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = {
                    scope.launch {
                        sending = true
                        when (val result = repository.requestPasswordReset(email)) {
                            is EmailRequest.Sent -> sent = true
                            is EmailRequest.Problem -> problem = result.error
                        }
                        sending = false
                    }
                },
                enabled = !sending,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text(if (sending) "Sending..." else if (sent) "Send another link" else "Send the link")
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                Text("Back to Log In")
            }
        }
    }
}

@Composable
fun LoginScreen(
    repository: DzirentRepository,
    onLoginSuccess: (Profile) -> Unit,
    onNavigateToSignUp: () -> Unit,
    onNavigateToWelcome: () -> Unit,
    onForgotPassword: (String) -> Unit = {},
    onNeedsConfirmation: (String) -> Unit = {},
    /** E1: a Google sign-in that came back with a refusal. */
    initialError: String? = null,
    onInitialErrorShown: () -> Unit = {}
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf(initialError) }
    LaunchedEffect(initialError) { if (initialError != null) onInitialErrorShown() }
    // E1: the account exists but its email isn't confirmed yet (DZ-E1005): offer the link again.
    var unconfirmed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    if (isLoading) {
        LoadingView(message = "Signing in...")
        return
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = "Welcome Back",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Log in to browse or list clothing nearby",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(32.dp))

            if (errorMessage != null) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    ),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = errorMessage ?: "",
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.announced()
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row {
                            TextButton(
                                onClick = {
                                    errorMessage = null
                                    isLoading = false
                                }
                            ) {
                                Text("Retry")
                            }
                            if (unconfirmed) {
                                TextButton(onClick = { onNeedsConfirmation(email.trim()) }) {
                                    Text("Send the link again")
                                }
                            }
                        }
                    }
                }
            }

            OutlinedTextField(
                value = email,
                onValueChange = { email = it; errorMessage = null; unconfirmed = false },
                label = { Text("Email") },
                leadingIcon = { Icon(Icons.Default.Mail, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it; errorMessage = null },
                label = { Text("Password") },
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            // E1: its own screen with an email field and the neutral answer.
            TextButton(
                onClick = { onForgotPassword(email.trim()) },
                modifier = Modifier.align(Alignment.End).heightIn(min = 48.dp)
            ) {
                Text("Forgot password?")
            }
            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = {
                    if (email.isBlank() || password.isBlank()) {
                        errorMessage = "Please enter both email and password."
                        return@Button
                    }
                    scope.launch {
                        isLoading = true
                        errorMessage = null
                        try {
                            repository.signIn(email.trim(), password.trim())
                            val profile = repository.getCurrentProfile()
                            isLoading = false
                            if (profile != null) {
                                onLoginSuccess(profile)
                            } else {
                                errorMessage = "Profile not found. Please try again."
                            }
                        } catch (e: Exception) {
                            isLoading = false
                            unconfirmed = (e as? DzirentException)?.code == "DZ-E1005"
                            errorMessage = e.userMessage("Failed to log in. Please check your credentials.")
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text("Log In")
            }
            GoogleSignInButton(repository = repository, onError = { errorMessage = it })

            Spacer(modifier = Modifier.height(16.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(text = "Don't have an account? ")
                TextButton(onClick = onNavigateToSignUp) {
                    Text("Sign Up")
                }
            }
            TextButton(onClick = onNavigateToWelcome) {
                Text("Back to Welcome")
            }
        }
    }
}

@Composable
fun SignUpScreen(
    repository: DzirentRepository,
    onSignUpSuccess: (Profile) -> Unit,
    onNavigateToLogin: () -> Unit,
    onNavigateToWelcome: () -> Unit
) {
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var city by remember { mutableStateOf<UsCity?>(null) }
    var cityText by remember { mutableStateOf("") }
    var showCityHint by remember { mutableStateOf(false) }
    var selectedRole by remember { mutableStateOf("both") }
    var adultConfirmed by remember { mutableStateOf(false) }
    var termsAccepted by remember { mutableStateOf(false) }
    var showPolicy by remember { mutableStateOf(false) }
    // The text filter's refusal for the display name, shown under the field.
    var nameError by remember { mutableStateOf<String?>(null) }

    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var confirmationSentTo by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current

    if (isLoading) {
        LoadingView(message = "Creating account...")
        return
    }

    val sentTo = confirmationSentTo
    if (sentTo != null) {
        EmailConfirmationView(repository = repository, email = sentTo, onGoToLogin = onNavigateToLogin)
        return
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "Create Account",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Join Dzirent to rent or share clothes nearby",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(24.dp))

            if (errorMessage != null) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    ),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = errorMessage ?: "",
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.announced()
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        TextButton(
                            onClick = {
                                errorMessage = null
                                isLoading = false
                            }
                        ) {
                            Text("Retry")
                        }
                    }
                }
            }

            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it; nameError = null },
                label = { Text("Display Name") },
                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                isError = nameError != null,
                supportingText = nameError?.let { { Text(it, modifier = Modifier.announced()) } },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                leadingIcon = { Icon(Icons.Default.Mail, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                visualTransformation = PasswordVisualTransformation(),
                supportingText = { Text("At least $PASSWORD_MIN_LENGTH characters") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))

            CityField(
                repository = repository,
                selected = city,
                onSelected = { city = it },
                onTextChange = { cityText = it; showCityHint = false },
                label = "City (optional)",
                showPickHint = showCityHint,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "I want to:",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.fillMaxWidth()
            )
            Row(
                modifier = Modifier.fillMaxWidth().selectableGroup(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = selectedRole == "renter",
                        onClick = { selectedRole = "renter" }
                    )
                    Text("Rent")
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = selectedRole == "lender",
                        onClick = { selectedRole = "lender" }
                    )
                    Text("Lend")
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = selectedRole == "both",
                        onClick = { selectedRole = "both" }
                    )
                    Text("Both")
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Checkbox(
                    checked = adultConfirmed,
                    onCheckedChange = { adultConfirmed = it }
                )
                Text(
                    text = "I confirm I am 18 years of age or older",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Checkbox(
                    checked = termsAccepted,
                    onCheckedChange = { termsAccepted = it }
                )
                LegalLinksText(before = "I agree to the ", modifier = Modifier.weight(1f))
            }
            TextButton(
                onClick = { showPolicy = true },
                modifier = Modifier.align(Alignment.Start).padding(start = 36.dp)
            ) {
                Text("Read how Dzirent works")
            }
            if (showPolicy) {
                HowDzirentWorksDialog(onDismiss = { showPolicy = false })
            }
            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = {
                    if (displayName.isBlank() || email.isBlank() || password.isBlank()) {
                        errorMessage = "Please fill in all required fields."
                        return@Button
                    }
                    if (password.trim().length < PASSWORD_MIN_LENGTH) {
                        errorMessage = "Password must be at least $PASSWORD_MIN_LENGTH characters."
                        return@Button
                    }
                    if (city == null && cityText.isNotBlank()) {
                        showCityHint = true
                        errorMessage = "Pick your city from the list, or clear the City field."
                        return@Button
                    }
                    if (!adultConfirmed) {
                        errorMessage = "You must confirm you are 18+ to proceed."
                        return@Button
                    }
                    if (!termsAccepted) {
                        errorMessage = "Please agree to the Terms of Use and Privacy Policy."
                        return@Button
                    }
                    scope.launch {
                        isLoading = true
                        errorMessage = null
                        val trimmedEmail = email.trim()
                        try {
                            // Sign-up can't say why the database refused a name, so ask first.
                            repository.checkText(displayName.trim(), "profile")?.let { refusal ->
                                nameError = refusal
                                isLoading = false
                                return@launch
                            }
                            val profile = repository.signUp(
                                emailStr = trimmedEmail,
                                passwordStr = password.trim(),
                                displayName = displayName.trim(),
                                role = selectedRole,
                                adultConfirmed = true,
                                city = city
                            )
                            if (profile != null) {
                                // The ticked agreement, recorded now there is a session. If this fails,
                                // the terms step after sign-in asks again.
                                runCatching { repository.acceptLegal(device.push.platform) }
                            }
                            isLoading = false
                            if (profile != null) {
                                onSignUpSuccess(profile)
                            } else {
                                // No session until the email is confirmed: the terms step asks at first sign-in.
                                confirmationSentTo = trimmedEmail
                            }
                        } catch (e: Exception) {
                            isLoading = false
                            errorMessage = e.userMessage("Failed to sign up. Please try again.")
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text("Sign Up")
            }
            // E1: a first-time Google account finishes its profile (18+, name, area, terms) next.
            GoogleSignInButton(repository = repository, onError = { errorMessage = it })

            Spacer(modifier = Modifier.height(16.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(text = "Already have an account? ")
                TextButton(onClick = onNavigateToLogin) {
                    Text("Log In")
                }
            }
            TextButton(onClick = onNavigateToWelcome) {
                Text("Back to Welcome")
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

/**
 * "Check your email" after a password sign-up (Confirm email is on). The link opens the website's
 * callback ("You're confirmed"); then the person signs in here as usual. E1: "Send the link again",
 * once a minute, with the neutral answer.
 */
@Composable
fun EmailConfirmationView(
    repository: DzirentRepository,
    email: String,
    onGoToLogin: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val cooldown = remember { ResendCooldown() }
    var secondsLeft by remember { mutableStateOf(0) }
    var sending by remember { mutableStateOf(false) }
    var answer by remember { mutableStateOf<String?>(null) }
    var problem by remember { mutableStateOf<ShownError?>(null) }
    LaunchedEffect(secondsLeft) {
        if (secondsLeft > 0) {
            kotlinx.coroutines.delay(1_000)
            secondsLeft = cooldown.secondsLeft(nowMillis())
        }
    }
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.Mail,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(72.dp)
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "Check your email",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "We sent a confirmation link to $email. Open it, then come back and log in.",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            answer?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.announced())
                Spacer(modifier = Modifier.height(8.dp))
            }
            problem?.let {
                Text(it.text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.announced())
                Spacer(modifier = Modifier.height(8.dp))
            }
            OutlinedButton(
                onClick = {
                    scope.launch {
                        sending = true
                        problem = null
                        when (val result = repository.resendConfirmation(email)) {
                            is EmailRequest.Sent -> {
                                answer = NEUTRAL_RESEND
                                cooldown.sent(nowMillis())
                                secondsLeft = cooldown.secondsLeft(nowMillis())
                            }
                            is EmailRequest.Problem -> problem = result.error
                        }
                        sending = false
                    }
                },
                enabled = !sending && secondsLeft == 0,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text(
                    when {
                        sending -> "Sending..."
                        secondsLeft > 0 -> "Send the link again in $secondsLeft s"
                        else -> "Send the link again"
                    }
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onGoToLogin,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text("Go to Log In")
            }
        }
    }
}

/**
 * First-visit sheet shown on initial app opening.
 * Offers Sign In, Sign Up, and "Browse as guest".
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FirstVisitBottomSheet(
    onSignIn: () -> Unit,
    onSignUp: () -> Unit,
    onBrowseGuest: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onBrowseGuest,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(12.dp))
            Icon(
                imageVector = Icons.Default.Checkroom,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(56.dp)
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Welcome to Dzirent",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Peer-to-peer clothing rental. Browse outfits near you or sign in to rent and share.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(28.dp))

            Button(
                onClick = onSignUp,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text("Sign Up")
            }
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedButton(
                onClick = onSignIn,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text("Log In")
            }
            Spacer(modifier = Modifier.height(8.dp))

            TextButton(
                onClick = onBrowseGuest,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
            ) {
                Text("Browse as guest")
            }
        }
    }
}

/**
 * Dialog shown to guests when they tap on a gated action (save, message, studio, list, fit).
 */
@Composable
fun SignUpPromptDialog(
    action: GatedAction,
    onDismiss: () -> Unit,
    onSignIn: () -> Unit,
    onSignUp: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(text = action.title, fontWeight = FontWeight.Bold)
        },
        text = {
            Text(text = action.message, style = MaterialTheme.typography.bodyMedium)
        },
        confirmButton = {
            Button(onClick = onSignUp) {
                Text("Sign Up")
            }
        },
        dismissButton = {
            Row {
                TextButton(onClick = onSignIn) {
                    Text("Log In")
                }
                Spacer(modifier = Modifier.width(8.dp))
                TextButton(onClick = onDismiss) {
                    Text("Cancel")
                }
            }
        }
    )
}

