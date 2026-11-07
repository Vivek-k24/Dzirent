package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.AppLinks
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.util.AGE_GATE_MESSAGE
import kotlinx.coroutines.launch

/**
 * Full-screen step for an account the age gate blocked (the app store says the user is under
 * 18). The server refuses everything except reading and deleting, so the only ways on are
 * deleting the account or signing out (guests can still browse).
 */
@Composable
fun AgeBlockedScreen(
    repository: DzirentRepository,
    onSignedOut: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    val open = rememberOpenLink()
    var isBusy by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun signOut() {
        scope.launch {
            isBusy = true
            // Needs the session, so before signing out.
            runCatching { stopPush(repository, device.push) }
            runCatching { repository.signOut() }
            onSignedOut()
        }
    }

    fun delete() {
        scope.launch {
            isBusy = true
            error = null
            try {
                repository.deleteAccount()
                runCatching { stopPush(repository, device.push) }
                runCatching { repository.signOut() }
                confirmDelete = false
                device.toast("Your account was deleted.")
                onSignedOut()
            } catch (e: Exception) {
                error = e.userMessage("Couldn't delete your account. Please try again.")
                isBusy = false
                confirmDelete = false
            }
        }
    }

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
                imageVector = Icons.Default.Block,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(72.dp)
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = AGE_GATE_MESSAGE,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Your app store says you're under 18, so this account can't list, rent, " +
                    "save or message. You can delete the account, or sign out.",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(32.dp))
            error?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.announced()
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            Button(
                onClick = { confirmDelete = true },
                enabled = !isBusy,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)
            ) {
                Text(if (isBusy) "Just a moment..." else "Delete my account")
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(onClick = { signOut() }, enabled = !isBusy) {
                Text("Sign out")
            }
            TextButton(onClick = { open(AppLinks.SUPPORT_URL) }, enabled = !isBusy) {
                Text("Think this is a mistake? Contact support")
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { if (!isBusy) confirmDelete = false },
            title = { Text("Delete your account?", modifier = Modifier.asHeading()) },
            text = { Text("Your profile, listings, photos and chats are deleted for good. This can't be undone.") },
            confirmButton = {
                TextButton(
                    onClick = { delete() },
                    enabled = !isBusy,
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) { Text(if (isBusy) "Deleting..." else "Delete") }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }, enabled = !isBusy) { Text("Cancel") }
            }
        )
    }
}
