package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.Profile
import com.dzirent.shared.model.UsCity
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.util.FinishProfile
import com.dzirent.shared.util.ShownError
import kotlinx.coroutines.launch

/**
 * E1: "Finish your profile", after a first Google sign-in (Google gives only a name and an email):
 * the 18+ tick (required), the name (prefilled from Google), the rough location (the same city
 * field as sign-up, optional) and the terms. The database checks it again (complete_profile) and
 * refuses listing, renting and messaging until it is done, whatever the app shows.
 */
@Composable
fun FinishProfileScreen(
    repository: DzirentRepository,
    onFinished: (Profile) -> Unit,
    onSignedOut: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    var name by remember { mutableStateOf(repository.googleName()) }
    var city by remember { mutableStateOf<UsCity?>(null) }
    var cityText by remember { mutableStateOf("") }
    var showCityHint by remember { mutableStateOf(false) }
    var adult by remember { mutableStateOf(false) }
    var terms by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<ShownError?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "Finish your profile",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.asHeading()
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "A few details before you list, rent or message on Dzirent.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(24.dp))
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.announced())
                Spacer(modifier = Modifier.height(12.dp))
            }
            OutlinedTextField(
                value = name,
                onValueChange = { name = it; problem = null },
                label = { Text("Display Name") },
                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                isError = problem?.field == "display_name",
                supportingText = {
                    Text(
                        problem?.takeIf { it.field == "display_name" }?.text ?: "Shown to people you rent with.",
                        modifier = if (problem?.field == "display_name") Modifier.announced() else Modifier
                    )
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            CityField(
                repository = repository,
                selected = city,
                onSelected = { city = it; problem = null },
                onTextChange = { cityText = it; showCityHint = false },
                label = "City (optional)",
                showPickHint = showCityHint,
                modifier = Modifier.fillMaxWidth()
            )
            problem?.takeIf { it.field == "city" }?.let {
                Text(it.text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.fillMaxWidth().announced())
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(checked = adult, onCheckedChange = { adult = it; problem = null })
                Text("I confirm I am 18 years of age or older", style = MaterialTheme.typography.bodySmall)
            }
            problem?.takeIf { it.field == "adult" }?.let {
                Text(it.text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.fillMaxWidth().announced())
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(checked = terms, onCheckedChange = { terms = it; problem = null })
                LegalLinksText(before = "I agree to the ", modifier = Modifier.weight(1f))
            }
            problem?.takeIf { it.field == "legal" }?.let {
                Text(it.text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.fillMaxWidth().announced())
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = {
                    FinishProfile.problem(name, adult, terms)?.let {
                        problem = it
                        return@Button
                    }
                    if (city == null && cityText.isNotBlank()) {
                        showCityHint = true
                        problem = com.dzirent.shared.util.ErrorCatalog.shown("DZ-E1082")
                        return@Button
                    }
                    scope.launch {
                        busy = true
                        error = null
                        try {
                            // The text filter may refuse the name (DZ-E1050, under the field).
                            val profile = repository.completeProfile(name, adult, city)
                            runCatching { repository.acceptLegal(device.push.platform) }
                            busy = false
                            if (profile != null) onFinished(profile) else error = "Profile not found. Please try again."
                        } catch (e: Exception) {
                            busy = false
                            val refused = e as? DzirentException
                            val field = refused?.field
                            if (refused != null && field != null) {
                                problem = ShownError(refused.code ?: "DZ-E9999", (refused.message ?: "").substringBeforeLast(" ("), field)
                            } else {
                                error = e.userMessage("Couldn't save your profile. Please try again.")
                            }
                        }
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text(if (busy) "Saving..." else "Save and continue")
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(
                onClick = {
                    scope.launch {
                        busy = true
                        runCatching { stopPush(repository, device.push) }
                        runCatching { repository.signOut() }
                        onSignedOut()
                    }
                },
                enabled = !busy,
                modifier = Modifier.heightIn(min = 48.dp)
            ) {
                Text("Sign out")
            }
        }
    }
}
