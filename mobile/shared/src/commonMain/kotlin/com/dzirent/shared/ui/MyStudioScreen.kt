package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.dzirent.shared.model.PayoutAccount
import com.dzirent.shared.model.Profile
import com.dzirent.shared.util.PayoutState
import com.dzirent.shared.util.payoutState
import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.util.HANDLE_MIN
import com.dzirent.shared.util.PICKUP_AREA_MAX
import com.dzirent.shared.util.STUDIO_BIO_MAX
import com.dzirent.shared.util.STUDIO_NAME_MAX
import com.dzirent.shared.util.STYLE_TAGS_MAX
import com.dzirent.shared.util.StyleTags
import com.dzirent.shared.util.cleanHandleInput
import com.dzirent.shared.util.isValidHandle
import com.dzirent.shared.util.suggestHandle
import kotlinx.coroutines.launch

/**
 * C5: My studio > Payouts. "Set up payouts" opens the payment processor's onboarding in the
 * browser; back in the app the status is asked again (stripe-account-status) and shows "Payouts
 * ready", "Finish setup" or "Not set up". Hidden while payments are off.
 */
@Composable
fun PayoutsSection(repository: DzirentRepository) {
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    var paymentsOn by remember { mutableStateOf(false) }
    var account by remember { mutableStateOf<PayoutAccount?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var openedSetup by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        paymentsOn = runCatching { repository.rentalSettings(refresh = true).paymentsEnabled }.getOrDefault(false)
        if (paymentsOn) account = runCatching { repository.myPayoutAccount() }.getOrNull()
        loaded = true
    }
    // Back from the processor's pages (the app resumes): ask for the account's state again.
    LifecycleResumeEffect(Unit) {
        if (openedSetup) {
            openedSetup = false
            scope.launch {
                busy = true
                try {
                    account = repository.refreshPayoutAccount() ?: account
                } catch (e: Exception) {
                    message = e.userMessage("Couldn't check your payouts. Please try again.")
                }
                busy = false
            }
        }
        onPauseOrDispose { }
    }
    if (!loaded || !paymentsOn) return

    val state = payoutState(account != null, account?.chargesEnabled == true, account?.payoutsEnabled == true)
    Spacer(modifier = Modifier.height(16.dp))
    Text("Payouts", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.asHeading())
    Text(state.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.announced())
    Text(
        text = when (state) {
            PayoutState.READY -> "Renters can pay you in Dzirent. Payments reach your bank through our payment processor."
            PayoutState.FINISH_SETUP -> "The payment processor needs a few more details before renters can pay you."
            PayoutState.NOT_SET_UP -> "Set up payouts before you accept a rental: the renter pays in Dzirent and the money reaches your bank. Your bank and tax details go to our payment processor, never to Dzirent."
        },
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(modifier = Modifier.height(8.dp))
    OutlinedButton(
        onClick = {
            scope.launch {
                busy = true
                message = null
                try {
                    val link = repository.payoutSetupLink()
                    openedSetup = true
                    uriHandler.openUri(link)
                } catch (e: Exception) {
                    message = e.userMessage("Couldn't open the payout set-up. Please try again.")
                }
                busy = false
            }
        },
        enabled = !busy
    ) { Text(if (busy) "Checking..." else state.button) }
    message?.let {
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.announced())
    }
}

/** Profile > My studio (lenders): what the studio page shows. Everything is optional. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MyStudioScreen(
    repository: DzirentRepository,
    profile: Profile,
    onBack: () -> Unit,
    onSaved: (Profile) -> Unit
) {
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf(profile.studioName.orEmpty()) }
    var handle by rememberSaveable {
        mutableStateOf(profile.studioHandle ?: suggestHandle(profile.studioName ?: profile.displayName))
    }
    var bio by rememberSaveable { mutableStateOf(profile.studioBio.orEmpty()) }
    var tags by rememberSaveable { mutableStateOf(profile.styleTags) }
    var pickup by rememberSaveable { mutableStateOf(profile.pickupArea.orEmpty()) }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // The text filter's refusal, by database column (studio_name, studio_handle, studio_bio, pickup_area).
    var fieldErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val handleError = handle.takeIf { it.isNotEmpty() && !isValidHandle(it) }?.let {
        "Use at least $HANDLE_MIN letters, numbers, dots or underscores."
    } ?: fieldErrors["studio_handle"]

    fun save() {
        if (handle.isNotEmpty() && !isValidHandle(handle)) return
        scope.launch {
            isSaving = true
            error = null
            fieldErrors = emptyMap()
            try {
                onSaved(repository.updateStudio(profile.id, name.trim(), handle, bio.trim(), tags, pickup.trim()))
            } catch (e: Exception) {
                val field = (e as? DzirentException)?.field
                if (field != null && e.message != null) {
                    fieldErrors = mapOf(field to e.message!!)
                } else {
                    error = e.userMessage("Couldn't save your studio. Please try again.")
                }
            }
            isSaving = false
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("My studio", modifier = Modifier.asHeading()) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 8.dp)
        ) {
            OutlinedTextField(
                value = name,
                onValueChange = { if (it.length <= STUDIO_NAME_MAX) { name = it; fieldErrors = fieldErrors - "studio_name" } },
                label = { Text("Studio name") },
                placeholder = { Text(profile.displayName) },
                isError = fieldErrors["studio_name"] != null,
                supportingText = fieldErrors["studio_name"]?.let { { Text(it, modifier = Modifier.announced()) } },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = handle,
                onValueChange = { handle = cleanHandleInput(it); fieldErrors = fieldErrors - "studio_handle" },
                label = { Text("Handle") },
                prefix = { Text("@") },
                supportingText = { Text(handleError ?: "Shown at the top of your studio page.", modifier = Modifier.announced()) },
                isError = handleError != null,
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(4.dp))
            OutlinedTextField(
                value = bio,
                onValueChange = { if (it.length <= STUDIO_BIO_MAX) { bio = it; fieldErrors = fieldErrors - "studio_bio" } },
                label = { Text("Bio") },
                isError = fieldErrors["studio_bio"] != null,
                supportingText = { Text(fieldErrors["studio_bio"] ?: "${bio.length}/$STUDIO_BIO_MAX") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(4.dp))
            OutlinedTextField(
                value = pickup,
                onValueChange = { if (it.length <= PICKUP_AREA_MAX) { pickup = it; fieldErrors = fieldErrors - "pickup_area" } },
                label = { Text("Pickup area") },
                placeholder = { Text("e.g. East Austin") },
                isError = fieldErrors["pickup_area"] != null,
                supportingText = { Text(fieldErrors["pickup_area"] ?: "A neighborhood, never your address.", modifier = Modifier.announced()) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(12.dp))
            Text("Style tags", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                text = "Pick up to $STYLE_TAGS_MAX.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StyleTags.ALL.forEach { tag ->
                    val selected = tag in tags
                    FilterChip(
                        selected = selected,
                        onClick = { tags = if (selected) tags - tag else tags + tag },
                        enabled = selected || tags.size < STYLE_TAGS_MAX,
                        label = { Text(tag) }
                    )
                }
            }

            // C5: payouts (only while payments are on).
            PayoutsSection(repository)

            error?.let {
                Spacer(modifier = Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.announced())
            }
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = { save() },
                enabled = !isSaving && handleError == null,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text(if (isSaving) "Saving..." else "Save")
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
