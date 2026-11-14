package com.dzirent.shared.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.dzirent.shared.model.AppLinks
import com.dzirent.shared.model.MyVerification
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.util.ErrorCatalog
import com.dzirent.shared.util.VerificationStatus
import com.dzirent.shared.util.isVerificationGate
import com.dzirent.shared.util.showsVerifiedBadge
import com.dzirent.shared.util.verificationAction
import com.dzirent.shared.util.verificationDetail
import com.dzirent.shared.util.verificationLabel
import com.dzirent.shared.util.verificationNeedsSupport
import kotlinx.coroutines.flow.lastOrNull
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** How long "Checking..." waits for the server's status before saying it's still on its way. */
private const val CHECK_WAIT_MS = 3 * 60 * 1000L

/**
 * C6: the one-time ID check, asked for only while verification_required is on. A refused action
 * (DZ-E6001) asks to verify over the screen it came from (so nothing typed there is lost) and runs
 * again once the ID is verified.
 */
@Stable
class VerificationGate {
    var asking by mutableStateOf(false)
        private set
    private var retry: (() -> Unit)? = null

    fun ask(retry: () -> Unit) {
        this.retry = retry
        asking = true
    }

    fun dismiss() {
        asking = false
        retry = null
    }

    /** Verified: close and run the refused action again. */
    fun verified() {
        val again = retry
        dismiss()
        again?.invoke()
    }
}

val LocalVerificationGate = staticCompositionLocalOf<VerificationGate?> { null }

/** If [error] is the gate's refusal, asks to verify and runs [retry] once verified; true when it did. */
fun VerificationGate?.handle(error: Throwable, retry: () -> Unit): Boolean {
    val code = (error as? DzirentException)?.code ?: (error.cause as? DzirentException)?.code
    if (this == null || !isVerificationGate(code)) return false
    ask(retry)
    return true
}

/** C6: the "Verified" badge. The person verified their ID once; it says nothing else about them. */
@Composable
fun VerifiedBadge(verified: Boolean?, modifier: Modifier = Modifier) {
    if (!showsVerifiedBadge(verified)) return
    val accent = MaterialTheme.colorScheme.primary
    Surface(
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.dp, accent),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.clearAndSetSemantics { contentDescription = "Verified" }
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(start = 4.dp, end = 7.dp, top = 1.dp, bottom = 1.dp)
        ) {
            Icon(Icons.Default.Check, contentDescription = null, tint = accent, modifier = Modifier.size(12.dp))
            Spacer(modifier = Modifier.width(2.dp))
            Text("Verified", style = MaterialTheme.typography.labelSmall, color = accent, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Settings > ID verification. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VerificationScreen(repository: DzirentRepository, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("ID verification", modifier = Modifier.asHeading()) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        VerificationContent(
            repository = repository,
            onVerified = {},
            modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)
        )
    }
}

/** The refused action's "Verify your ID once to continue.", over the screen it came from. */
@Composable
fun VerificationGateDialog(gate: VerificationGate, repository: DzirentRepository) {
    Dialog(onDismissRequest = { gate.dismiss() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        ErrorCatalog.shown("DZ-E6001").message,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f).asHeading()
                    )
                    TextButton(onClick = { gate.dismiss() }) { Text("Not now") }
                }
                VerificationContent(repository = repository, onVerified = { gate.verified() })
            }
        }
    }
}

/**
 * The status and, whenever checks are available, the button. First a short note of what Dzirent
 * keeps and never keeps; Didit then shows its own consent screen, so Dzirent asks for no second
 * consent. After the flow: "Checking..." until the server's status arrives (Realtime, polling as the
 * fallback), then [onVerified] when verified.
 */
@Composable
fun VerificationContent(repository: DzirentRepository, onVerified: () -> Unit, modifier: Modifier = Modifier) {
    var mine by remember { mutableStateOf<MyVerification?>(null) }
    var available by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var showExplainer by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var stillChecking by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    val device = LocalDevice.current
    val verifiedNow = rememberUpdatedState(onVerified)

    suspend fun load() {
        try {
            mine = repository.myVerification()
            available = repository.verificationAvailable()
            loadError = null
        } catch (e: Exception) {
            loadError = e.userMessage("Couldn't load your ID check. Please try again.")
        }
    }
    LaunchedEffect(Unit) { load() }

    // "Checking...": the server's status, live, until it has an outcome.
    LaunchedEffect(checking) {
        if (!checking) return@LaunchedEffect
        stillChecking = false
        val last = withTimeoutOrNull(CHECK_WAIT_MS) {
            repository.watchVerification().onEach { mine = it }.lastOrNull()
        }
        checking = false
        if (last == null) stillChecking = true
        if (last?.status == VerificationStatus.VERIFIED) verifiedNow.value()
    }

    val launcher = rememberIdVerificationLauncher { outcome ->
        busy = false
        when (outcome) {
            IdVerificationOutcome.Finished -> checking = true
            IdVerificationOutcome.Canceled -> scope.launch { load() }
            is IdVerificationOutcome.Failed -> {
                error = ErrorCatalog.shown(outcome.code).text
                scope.launch { load() }
            }
        }
    }

    fun start() {
        showExplainer = false
        busy = true
        error = null
        scope.launch {
            try {
                val session = repository.startVerification()
                if (launcher.available) {
                    launcher.start(session.sessionToken)
                } else {
                    // No native flow on this phone yet: Didit's hosted page in the browser.
                    uriHandler.openUri(session.url)
                    busy = false
                    checking = true
                }
            } catch (e: Exception) {
                busy = false
                error = e.userMessage("Couldn't start the ID check. Please try again.")
                load()
            }
        }
    }

    Column(modifier = modifier) {
        val v = mine
        if (v == null) {
            if (loadError != null) {
                Text(loadError.orEmpty(), color = MaterialTheme.colorScheme.error)
                TextButton(onClick = { scope.launch { load() } }) { Text("Try again") }
            } else {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            }
            return@Column
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(verificationLabel(v.status), style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.width(8.dp))
            VerifiedBadge(v.status == VerificationStatus.VERIFIED)
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            verificationDetail(v.status, v.attemptsLeft, available),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (v.required && v.status != VerificationStatus.VERIFIED) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Dzirent asks for a one-time ID check before you message someone or publish a listing.",
                style = MaterialTheme.typography.bodySmall
            )
        }
        if (checking) {
            Spacer(modifier = Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(modifier = Modifier.width(10.dp))
                Text("Checking…", style = MaterialTheme.typography.bodyLarge)
            }
        } else if (stillChecking) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                "The result hasn't arrived yet. You'll see it here as soon as it's in.",
                style = MaterialTheme.typography.bodyMedium
            )
        }
        val action = verificationAction(v, available)
        if (action != null && !checking) {
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = { showExplainer = true }, enabled = !busy) {
                Text(if (busy) "Opening…" else action)
            }
        }
        if (available && verificationNeedsSupport(v)) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(ErrorCatalog.shown("DZ-E6003").message, style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = {
                try {
                    uriHandler.openUri("mailto:${AppLinks.SUPPORT_EMAIL}?subject=ID%20verification")
                } catch (e: Exception) {
                    device.toast("No email app found. Write to ${AppLinks.SUPPORT_EMAIL}")
                }
            }) { Text("Email support") }
        }
        error?.let {
            Spacer(modifier = Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
    }

    if (showExplainer) {
        AlertDialog(
            onDismissRequest = { showExplainer = false },
            title = { Text("Before you verify", modifier = Modifier.asHeading()) },
            text = {
                Column {
                    Text("It takes a few minutes: a photo of your ID and a short selfie, in the verification provider's own screens.")
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Dzirent keeps", fontWeight = FontWeight.SemiBold)
                    Text("• The result, and a Verified badge others see\n• Your legal name from the ID, kept private\n• Whether you're 18 or older")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Dzirent never keeps", fontWeight = FontWeight.SemiBold)
                    Text("• Photos of your ID\n• Your selfie\n• Your birthdate\n• Your document details")
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        "Next, the verification provider shows its own consent screen: what it collects, why, and when it deletes it.",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            },
            confirmButton = { TextButton(onClick = { start() }) { Text("Continue") } },
            dismissButton = { TextButton(onClick = { showExplainer = false }) { Text("Cancel") } }
        )
    }
}
