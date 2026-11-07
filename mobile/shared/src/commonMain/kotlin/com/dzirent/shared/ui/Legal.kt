package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.AppLinks
import com.dzirent.shared.model.PrivateProfile
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch

/** Shown before the first body measurement is saved (give_measurements_consent). */
const val MEASUREMENTS_CONSENT_TEXT =
    "Your measurements are private. We use them only to suggest pieces likely to fit you. " +
        "They are never shown to anyone."

/** Opens a web page in the browser; says where to go if nothing on the phone can open it. */
@Composable
fun rememberOpenLink(): (String) -> Unit {
    val uriHandler = LocalUriHandler.current
    val device = LocalDevice.current
    return remember(uriHandler, device) {
        { url ->
            try {
                uriHandler.openUri(url)
            } catch (_: Exception) {
                device.toast("Couldn't open the link. Visit $url")
            }
        }
    }
}

/** [before] "Terms of Use" and "Privacy Policy" [after], the two names opening the pages in the browser. */
@Composable
fun LegalLinksText(
    before: String,
    after: String = "",
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodySmall,
    textAlign: TextAlign? = null
) {
    val open = rememberOpenLink()
    val linkStyles = TextLinkStyles(
        SpanStyle(color = MaterialTheme.colorScheme.primary, textDecoration = TextDecoration.Underline)
    )
    val text = buildAnnotatedString {
        append(before)
        withLink(LinkAnnotation.Clickable("terms", linkStyles) { open(AppLinks.TERMS_URL) }) { append("Terms of Use") }
        append(" and ")
        withLink(LinkAnnotation.Clickable("privacy", linkStyles) { open(AppLinks.PRIVACY_URL) }) { append("Privacy Policy") }
        append(after)
    }
    Text(text = text, style = style, textAlign = textAlign, modifier = modifier)
}

/**
 * Full-screen step after sign-in while the current Terms of Use or Privacy Policy isn't accepted
 * (needs_legal_acceptance). Agree records it (accept_legal); Sign out is the only other way on.
 */
@Composable
fun TermsUpdateScreen(
    repository: DzirentRepository,
    onAgreed: () -> Unit,
    onSignedOut: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    var isBusy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.Description,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(72.dp)
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "We've updated our terms",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(12.dp))
            LegalLinksText(
                before = "To keep using Dzirent, please read and agree to our ",
                after = ".",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(32.dp))
            error?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            Button(
                onClick = {
                    scope.launch {
                        isBusy = true
                        error = null
                        try {
                            // "android" or "ios", the same names as the push token's platform.
                            repository.acceptLegal(device.push.platform)
                            onAgreed()
                        } catch (e: Exception) {
                            error = e.userMessage("Couldn't save your agreement. Please try again.")
                            isBusy = false
                        }
                    }
                },
                enabled = !isBusy,
                modifier = Modifier.fillMaxWidth().height(50.dp)
            ) {
                Text(if (isBusy) "Saving..." else "Agree")
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(
                onClick = {
                    scope.launch {
                        isBusy = true
                        // Needs the session, so before signing out.
                        runCatching { stopPush(repository, device.push) }
                        runCatching { repository.signOut() }
                        onSignedOut()
                    }
                },
                enabled = !isBusy
            ) {
                Text("Sign out")
            }
        }
    }
}

/** Asked before the first body measurement is saved. */
@Composable
fun MeasurementsConsentDialog(onAgree: () -> Unit, onNotNow: () -> Unit) {
    AlertDialog(
        onDismissRequest = onNotNow,
        icon = { Icon(Icons.Default.Lock, contentDescription = null) },
        title = { Text("Your measurements") },
        text = { Text(MEASUREMENTS_CONSENT_TEXT) },
        confirmButton = { TextButton(onClick = onAgree) { Text("Agree") } },
        dismissButton = { TextButton(onClick = onNotNow) { Text("Not now") } }
    )
}

/**
 * Settings > Privacy & safety > Measurements consent. When given, tapping withdraws it after a
 * confirmation; the server deletes the saved measurements with it.
 */
@Composable
fun MeasurementsConsentSetting(repository: DzirentRepository) {
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    var saved by remember { mutableStateOf<PrivateProfile?>(null) }
    var loadFailed by remember { mutableStateOf(false) }
    var confirmWithdraw by remember { mutableStateOf(false) }
    var isWithdrawing by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        runCatching { repository.getPrivateProfile() }
            .onSuccess { saved = it }
            .onFailure { loadFailed = true }
    }

    val current = saved
    SettingsRow(
        title = "Measurements consent",
        subtitle = when {
            current == null -> if (loadFailed) "Couldn't load. Open Settings again to retry." else "Loading..."
            current.hasMeasurementsConsent -> "Given. Tap to withdraw it and delete your saved measurements."
            else -> "Not given. You'll be asked when you save measurements."
        },
        icon = Icons.Default.Straighten,
        showChevron = false,
        onClick = if (current?.hasMeasurementsConsent == true) ({ confirmWithdraw = true }) else null
    )

    if (confirmWithdraw) {
        AlertDialog(
            onDismissRequest = { if (!isWithdrawing) confirmWithdraw = false },
            title = { Text("Withdraw consent?") },
            text = {
                Text(
                    "Your saved body measurements will be deleted, and \"Likely to fit you\" stops " +
                        "until you add them again."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            isWithdrawing = true
                            try {
                                repository.withdrawMeasurementsConsent()
                                saved = current?.copy(
                                    chestCm = null, waistCm = null, hipsCm = null,
                                    shoulderCm = null, heightCm = null, inseamCm = null,
                                    measurementsConsentAt = null
                                )
                                device.toast("Consent withdrawn. Your measurements were deleted.")
                            } catch (e: Exception) {
                                device.toast(e.userMessage("Couldn't withdraw your consent. Please try again."))
                            }
                            isWithdrawing = false
                            confirmWithdraw = false
                        }
                    },
                    enabled = !isWithdrawing,
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) { Text(if (isWithdrawing) "Deleting..." else "Withdraw and delete") }
            },
            dismissButton = {
                TextButton(onClick = { confirmWithdraw = false }, enabled = !isWithdrawing) { Text("Cancel") }
            }
        )
    }
}

/** Settings > Help & legal: the website's help, policy and support pages, opened in the browser. */
@Composable
fun HelpAndLegalSection() {
    val open = rememberOpenLink()
    SettingsGroup("Help & legal")
    LinkRow("Help", Icons.Default.QuestionAnswer) { open(AppLinks.HELP_URL) }
    LinkRow("Safety tips", Icons.Default.Shield) { open(AppLinks.SAFETY_URL) }
    LinkRow("Community guidelines", Icons.Default.Groups) { open(AppLinks.COMMUNITY_GUIDELINES_URL) }
    LinkRow("Terms of Use", Icons.Default.Description) { open(AppLinks.TERMS_URL) }
    LinkRow("Privacy Policy", Icons.Default.PrivacyTip) { open(AppLinks.PRIVACY_URL) }
    LinkRow("Copyright", Icons.Default.Copyright) { open(AppLinks.COPYRIGHT_URL) }
    LinkRow("Delete account", Icons.Default.DeleteForever) { open(AppLinks.DELETE_ACCOUNT_URL) }
    LinkRow("Contact support", Icons.Default.SupportAgent) { open(AppLinks.SUPPORT_URL) }
}
