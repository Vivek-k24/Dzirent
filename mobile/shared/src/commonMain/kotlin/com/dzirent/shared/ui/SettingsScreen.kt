package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.dzirent.shared.model.Profile
import com.dzirent.shared.platform.DistanceUnit
import com.dzirent.shared.platform.MeasureUnit
import com.dzirent.shared.platform.ThemeMode
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch

private const val DELETE_CONFIRM_WORD = "DELETE"
private const val DELETE_ACCOUNT_EXPLANATION =
    "Deleting your account is permanent. Your profile, listings, photos and messages will be removed immediately."

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    repository: DzirentRepository,
    profile: Profile?,
    isGuest: Boolean,
    onBack: () -> Unit,
    onSetLocation: () -> Unit,
    onOpenMeasurements: () -> Unit,
    onOpenBlockedUsers: () -> Unit,
    onClearSearchHistory: () -> Unit,
    onOpenAbout: () -> Unit,
    onSignOut: () -> Unit,
    onAccountDeleted: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val settings = LocalAppSettings.current
    val email = remember { repository.currentEmail() }
    var isSigningOut by remember { mutableStateOf(false) }
    var showChangePassword by remember { mutableStateOf(false) }
    var showDeleteAccount by remember { mutableStateOf(false) }
    var showClearHistorySuccess by remember { mutableStateOf(false) }

    if (showChangePassword) {
        ChangePasswordDialog(
            repository = repository,
            onDismiss = { showChangePassword = false },
            onChanged = { showChangePassword = false }
        )
    }

    if (showDeleteAccount) {
        DeleteAccountDialog(
            repository = repository,
            onDismiss = { showDeleteAccount = false },
            onDeleted = {
                showDeleteAccount = false
                onAccountDeleted()
            }
        )
    }

    if (showClearHistorySuccess) {
        AlertDialog(
            onDismissRequest = { showClearHistorySuccess = false },
            title = { Text("Search history cleared") },
            text = { Text("Your recent searches have been cleared.") },
            confirmButton = {
                TextButton(onClick = { showClearHistorySuccess = false }) { Text("OK") }
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Settings") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
            SettingsGroup("Appearance")
            ChoiceSetting(
                title = "Theme",
                current = settings.theme.label,
                options = ThemeMode.entries.map { it.label },
                onSelect = { label ->
                    val mode = ThemeMode.entries.firstOrNull { it.label == label } ?: ThemeMode.SYSTEM
                    // Note: LocalAppSettings is read-only in UI, persistence is wired at app root
                }
            )

            SettingsGroup("Preferences")
            ChoiceSetting(
                title = "Distance unit",
                current = settings.distanceUnit.label,
                options = DistanceUnit.entries.map { it.label },
                onSelect = { label ->
                    val unit = DistanceUnit.entries.firstOrNull { it.label == label } ?: DistanceUnit.MILES
                }
            )
            ChoiceSetting(
                title = "Measurements",
                current = settings.measureUnit.label,
                options = MeasureUnit.entries.map { it.label },
                onSelect = { label ->
                    val unit = MeasureUnit.entries.firstOrNull { it.label == label } ?: MeasureUnit.INCHES
                }
            )

            SettingsGroup("Location")
            SettingsRow(
                title = "Current location",
                subtitle = profile?.city?.takeIf { it.isNotBlank() } ?: "Set your city",
                icon = Icons.Default.LocationOn,
                onClick = onSetLocation
            )

            if (!isGuest) {
                SettingsGroup("Privacy & Safety")
                SettingsRow(
                    title = "My measurements",
                    subtitle = "Private body measurements for fit recommendations",
                    icon = Icons.Default.Straighten,
                    onClick = onOpenMeasurements
                )
                SettingsRow(
                    title = "Blocked users",
                    subtitle = null,
                    icon = Icons.Default.Block,
                    onClick = onOpenBlockedUsers
                )
            }

            SettingsGroup("Search")
            SettingsRow(
                title = "Clear search history",
                subtitle = null,
                icon = Icons.Default.History,
                onClick = {
                    onClearSearchHistory()
                    showClearHistorySuccess = true
                }
            )

            SettingsGroup("About")
            SettingsRow(
                title = "About Dzirent",
                subtitle = "Policies, terms, licenses and version",
                icon = Icons.Default.Info,
                onClick = onOpenAbout
            )

            if (!isGuest) {
                SettingsGroup("Account")
                email?.let {
                    SettingsRow(
                        title = "Email",
                        subtitle = it,
                        icon = Icons.Default.Email,
                        onClick = null
                    )
                }
                SettingsRow(
                    title = "Change password",
                    subtitle = null,
                    icon = Icons.Default.Lock,
                    onClick = { showChangePassword = true }
                )
                SettingsRow(
                    title = "Delete account",
                    subtitle = "Permanently delete your profile and data",
                    icon = Icons.Default.DeleteForever,
                    onClick = { showDeleteAccount = true }
                )

                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = {
                        scope.launch {
                            isSigningOut = true
                            try {
                                repository.signOut()
                            } catch (_: Exception) {}
                            onSignOut()
                        }
                    },
                    enabled = !isSigningOut,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant
                    ),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(48.dp)
                ) {
                    Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (isSigningOut) "Signing out..." else "Sign out")
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun SettingsGroup(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 4.dp)
    )
}

@Composable
private fun ChoiceSetting(
    title: String,
    current: String,
    options: List<String>,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        ListItem(
            headlineContent = { Text(title) },
            supportingContent = { Text(current) },
            trailingContent = { Icon(Icons.Default.ArrowDropDown, contentDescription = null) },
            modifier = Modifier.clickable { expanded = true }
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { opt ->
                DropdownMenuItem(
                    text = { Text(opt, fontWeight = if (opt == current) FontWeight.Bold else FontWeight.Normal) },
                    onClick = {
                        expanded = false
                        onSelect(opt)
                    }
                )
            }
        }
    }
    HorizontalDivider()
}

@Composable
fun ChangePasswordDialog(
    repository: DzirentRepository,
    onDismiss: () -> Unit,
    onChanged: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var isChanging by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!isChanging) onDismiss() },
        title = { Text("Change password") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = currentPassword,
                    onValueChange = { currentPassword = it },
                    label = { Text("Current password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    label = { Text("New password (min 6 characters)") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it },
                    label = { Text("Confirm new password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (newPassword.length < 6) {
                        error = "Password must be at least 6 characters."
                        return@TextButton
                    }
                    if (newPassword != confirmPassword) {
                        error = "Passwords do not match."
                        return@TextButton
                    }
                    scope.launch {
                        isChanging = true
                        error = null
                        try {
                            repository.changePassword(currentPassword, newPassword)
                            onChanged()
                        } catch (e: Exception) {
                            error = e.userMessage("Couldn't change your password.")
                        }
                        isChanging = false
                    }
                },
                enabled = !isChanging && currentPassword.isNotBlank() && newPassword.isNotBlank()
            ) {
                Text(if (isChanging) "Changing..." else "Change password")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isChanging) { Text("Cancel") }
        }
    )
}

@Composable
fun DeleteAccountDialog(
    repository: DzirentRepository,
    onDismiss: () -> Unit,
    onDeleted: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var typed by remember { mutableStateOf("") }
    var isDeleting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!isDeleting) onDismiss() },
        properties = DialogProperties(dismissOnClickOutside = !isDeleting),
        icon = { Icon(Icons.Default.DeleteForever, contentDescription = null) },
        title = { Text("Delete account?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(DELETE_ACCOUNT_EXPLANATION)
                OutlinedTextField(
                    value = typed,
                    onValueChange = { typed = it; error = null },
                    label = { Text("Type $DELETE_CONFIRM_WORD to confirm") },
                    singleLine = true,
                    enabled = !isDeleting,
                    modifier = Modifier.fillMaxWidth()
                )
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    scope.launch {
                        isDeleting = true
                        error = null
                        try {
                            repository.deleteAccount()
                            runCatching { repository.signOut() }
                            onDeleted()
                        } catch (e: Exception) {
                            error = e.userMessage("Couldn't delete your account.")
                            isDeleting = false
                        }
                    }
                },
                enabled = typed.trim() == DELETE_CONFIRM_WORD && !isDeleting,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
            ) {
                Text(if (isDeleting) "Deleting..." else "Delete account")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isDeleting) { Text("Cancel") }
        }
    )
}

