package com.dzirent.shared.ui

import com.dzirent.shared.platform.LocalDevice
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.dzirent.shared.platform.SettingsStorage
import com.dzirent.shared.model.NotificationSettings
import com.dzirent.shared.model.PASSWORD_MIN_LENGTH
import com.dzirent.shared.model.Profile
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.util.DISTANCE_STEPS
import com.dzirent.shared.util.DistanceUnit
import com.dzirent.shared.util.MeasureUnit
import com.dzirent.shared.util.RENTAL_LENGTH_OPTIONS
import com.dzirent.shared.util.ThemeMode
import kotlinx.coroutines.launch

/** The shortest password the server accepts; sign-up asks for the same. */
private const val PASSWORD_MIN = PASSWORD_MIN_LENGTH

/**
 * Sidebar > Settings, as a grouped list: Appearance, Preferences (saved on the device and
 * applied at once), Notifications (saved to the account), Location, Privacy & safety,
 * Account, Help & legal (website pages), About, then Sign out.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    repository: DzirentRepository,
    settingsStore: SettingsStorage?,
    /** Null for a guest: the account rows and Sign out are left out. */
    profile: Profile?,
    onBack: () -> Unit,
    onSetLocation: () -> Unit,
    onOpenBlockedUsers: () -> Unit,
    onClearSearchHistory: () -> Unit,
    onAppTour: () -> Unit,
    onOpenAbout: () -> Unit,
    onSignOut: () -> Unit,
    /** After the account is gone and the session is cleared. */
    onAccountDeleted: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    val settings = LocalAppSettings.current
    val email = remember { repository.currentEmail() }
    var isSigningOut by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showChangePassword by remember { mutableStateOf(false) }
    var showDeleteAccount by remember { mutableStateOf(false) }

    if (showChangePassword) {
        ChangePasswordDialog(
            repository = repository,
            onDismiss = { showChangePassword = false },
            onChanged = {
                showChangePassword = false
                device.toast("Password changed")
            }
        )
    }

    if (showDeleteAccount && profile != null) {
        DeleteAccountDialog(
            repository = repository,
            userId = profile.id,
            onDismiss = { showDeleteAccount = false },
            onDeleted = {
                showDeleteAccount = false
                device.toast("Your account was deleted")
                onAccountDeleted()
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Settings", modifier = Modifier.asHeading()) },
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
                options = ThemeMode.entries,
                selected = settings.theme,
                label = { it.label },
                onSelect = { scope.launch { settingsStore?.setTheme(it) } }
            )

            SettingsGroup("Preferences")
            ChoiceSetting(
                title = "Distance",
                options = DistanceUnit.entries,
                selected = settings.distanceUnit,
                label = { it.label },
                onSelect = { scope.launch { settingsStore?.setDistanceUnit(it) } }
            )
            ChoiceSetting(
                title = "Measurements",
                options = MeasureUnit.entries,
                selected = settings.measureUnit,
                label = { it.label },
                onSelect = { scope.launch { settingsStore?.setMeasureUnit(it) } }
            )
            ChoiceSetting(
                title = "Default rental length",
                subtitle = "Days, for the date chip on Home",
                options = RENTAL_LENGTH_OPTIONS,
                selected = settings.rentalDays,
                label = { it.toString() },
                onSelect = { scope.launch { settingsStore?.setRentalDays(it) } }
            )
            ChoiceSetting(
                title = "Default distance",
                options = DISTANCE_STEPS.toList(),
                selected = settings.defaultDistanceStep,
                label = { settings.distanceUnit.optionLabel(it) },
                onSelect = { scope.launch { settingsStore?.setDefaultDistanceStep(it) } }
            )

            if (profile != null) {
                SettingsGroup("Notifications")
                NotificationSettingsSection(repository)
            }

            SettingsGroup("Location")
            SettingsRow(
                title = "Update location",
                subtitle = if (profile?.hasLocation == true) {
                    "Near ${profile.city.ifBlank { "your area" }} (${settings.distanceUnit.locationPrecision})"
                } else {
                    "Not set yet"
                },
                icon = Icons.Default.LocationOn,
                onClick = onSetLocation
            )

            SettingsGroup("Privacy & safety")
            if (profile != null) SettingsRow("Blocked users", null, Icons.Default.Block, onClick = onOpenBlockedUsers)
            if (profile != null) MeasurementsConsentSetting(repository)
            if (profile != null) DataExportSetting(repository, profile.id)
            SettingsRow("Clear search history", null, Icons.Default.History, showChevron = false) {
                onClearSearchHistory()
                device.toast("Search history cleared")
            }

            if (profile != null) {
                SettingsGroup("Account")
                SettingsRow("Email", email ?: "Not available", Icons.Default.Email, onClick = null)
                SettingsRow("Change password", null, Icons.Default.Lock, onClick = { showChangePassword = true })
                SettingsRow("Delete account", null, Icons.Default.DeleteForever, onClick = { showDeleteAccount = true })
            }

            HelpAndLegalSection()

            SettingsGroup("About")
            SettingsRow("App tour", "A quick look at where things are", Icons.Default.Explore, onClick = onAppTour)
            SettingsRow("About Dzirent", "Policies, contact, version and licenses", Icons.Default.Info, onClick = onOpenAbout)

            Spacer(modifier = Modifier.height(32.dp))
            error?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp).announced()
                )
            }
            if (profile != null) OutlinedButton(
                onClick = {
                    scope.launch {
                        isSigningOut = true
                        error = null
                        try {
                            // Needs the session, so before signing out.
                            stopPush(repository, device.push)
                            repository.signOut()
                            onSignOut()
                        } catch (e: Exception) {
                            isSigningOut = false
                            error = e.userMessage("Couldn't sign out. Please try again.")
                        }
                    }
                },
                enabled = !isSigningOut,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .heightIn(min = 50.dp)
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Sign out")
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

/** A group heading in Settings and About. */
@Composable
fun SettingsGroup(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 4.dp).asHeading()
    )
}

/** A tappable row. [onClick] null makes it read-only (no chevron). */
@Composable
fun SettingsRow(
    title: String,
    subtitle: String?,
    icon: ImageVector,
    showChevron: Boolean = true,
    onClick: (() -> Unit)?
) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = subtitle?.let { { Text(it) } },
        leadingContent = { Icon(icon, contentDescription = null) },
        trailingContent = if (onClick != null && showChevron) {
            { Icon(Icons.Default.ChevronRight, contentDescription = null) }
        } else {
            null
        },
        modifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
    )
}

/** A setting picked from a few options with a segmented control; applies on tap. */
@Composable
private fun <T> ChoiceSetting(
    title: String,
    options: List<T>,
    selected: T,
    label: (T) -> String,
    onSelect: (T) -> Unit,
    subtitle: String? = null
) {
    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.bodyLarge)
        subtitle?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(modifier = Modifier.height(8.dp))
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            options.forEachIndexed { index, option ->
                SegmentedButton(
                    selected = option == selected,
                    onClick = { if (option != selected) onSelect(option) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size),
                    // No check mark: with four options it would crowd out the label.
                    icon = {}
                ) {
                    Text(label(option), maxLines = 1)
                }
            }
        }
    }
}

/**
 * Settings > Notifications, saved to the account. Messages covers new messages, new chats and
 * date changes. Message text stays out of notifications unless turned on. When the phone
 * blocks Dzirent's notifications, turning Messages on asks the phone (or opens its settings).
 */
@Composable
private fun NotificationSettingsSection(repository: DzirentRepository) {
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    var saved by remember { mutableStateOf<NotificationSettings?>(null) }
    var loadFailed by remember { mutableStateOf(false) }
    var phoneAllows by remember { mutableStateOf(device.push.canNotify()) }
    val turnOn = rememberTurnOnNotifications { phoneAllows = it }

    LaunchedEffect(Unit) {
        runCatching { repository.getNotificationSettings() }
            .onSuccess { saved = it }
            .onFailure { loadFailed = true }
    }
    // Back from the phone's settings: show what it allows now.
    LifecycleResumeEffect(Unit) {
        phoneAllows = device.push.canNotify()
        onPauseOrDispose { }
    }

    fun save(updated: NotificationSettings) {
        val before = saved ?: return
        saved = updated
        scope.launch {
            try {
                repository.saveNotificationSettings(updated)
            } catch (e: Exception) {
                saved = before
                device.toast(e.userMessage("Couldn't save your notification settings. Please try again."))
            }
        }
    }

    val current = saved
    SwitchSetting(
        title = "Messages",
        subtitle = when {
            current == null -> if (loadFailed) "Couldn't load. Open Settings again to retry." else "Loading..."
            current.messages && !phoneAllows -> "Off in your phone's settings. Tap to turn on."
            else -> "New messages, new chats and date changes"
        },
        checked = current?.messages == true && phoneAllows,
        enabled = current != null,
        onCheckedChange = { on ->
            if (current != null) {
                if (!on) {
                    save(current.copy(messages = false))
                } else {
                    if (!current.messages) save(current.copy(messages = true))
                    if (!phoneAllows) turnOn()
                }
            }
        }
    )
    SwitchSetting(
        title = "Show message text",
        subtitle = "Show what they wrote in notifications, also on the lock screen",
        checked = current?.showMessageText == true,
        enabled = current?.messages == true,
        onCheckedChange = { on -> current?.let { save(it.copy(showMessageText = on)) } }
    )
}

/** An on/off setting; tapping anywhere on the row switches it. */
@Composable
private fun SwitchSetting(
    title: String,
    subtitle: String?,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = subtitle?.let { { Text(it) } },
        trailingContent = { Switch(checked = checked, onCheckedChange = null, enabled = enabled) },
        modifier = Modifier.toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
    )
}

/** Current password plus a new one. Checking the current one proves it's the owner. */
@Composable
private fun ChangePasswordDialog(
    repository: DzirentRepository,
    onDismiss: () -> Unit,
    onChanged: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun save() {
        error = when {
            current.isBlank() -> "Enter your current password."
            new.trim().length < PASSWORD_MIN -> "Use at least $PASSWORD_MIN characters."
            new.trim() == current.trim() -> "Choose a password that's different from your current one."
            else -> null
        }
        if (error != null) return
        scope.launch {
            isSaving = true
            try {
                repository.changePassword(current.trim(), new.trim())
                onChanged()
            } catch (e: Exception) {
                error = e.userMessage("Couldn't change your password. Please try again.")
            }
            isSaving = false
        }
    }

    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        properties = DialogProperties(dismissOnClickOutside = !isSaving),
        title = { Text("Change password", modifier = Modifier.asHeading()) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PasswordField("Current password", current) { current = it; error = null }
                PasswordField("New password", new) { new = it; error = null }
                Text(
                    text = error ?: "At least $PASSWORD_MIN characters.",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.announced()
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { save() }, enabled = !isSaving) { Text(if (isSaving) "Saving..." else "Change") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) { Text("Cancel") }
        }
    )
}

/** What a deleted account takes with it, shown before the person confirms. */
private const val DELETE_ACCOUNT_EXPLANATION =
    "This permanently deletes your account and everything in it: your profile and studio, " +
        "your listings and their photos, your chats and messages (for both people), your saved " +
        "pieces and studios, your measurements and your rental history. It can't be undone. " +
        // Placeholder wording for lawyer review (docs/PRIVACY_POLICY_NOTES.md).
        "Accessory declarations you signed are kept as a record, without your account."

private const val DELETE_CONFIRM_WORD = "DELETE"

/**
 * Settings > Account > Delete account: explains what goes, blocks it during an active
 * rental, and asks for DELETE typed out before calling the delete-account function.
 */
@Composable
private fun DeleteAccountDialog(
    repository: DzirentRepository,
    userId: String,
    onDismiss: () -> Unit,
    onDeleted: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val device = LocalDevice.current
    var typed by remember { mutableStateOf("") }
    var isDeleting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // Null while checking. The function checks again; this only saves typing DELETE for nothing.
    var activeRental by remember { mutableStateOf<Boolean?>(null) }

    LaunchedEffect(userId) {
        activeRental = runCatching { repository.hasActiveRental(userId) }.getOrDefault(false)
    }

    fun delete() {
        scope.launch {
            isDeleting = true
            error = null
            try {
                repository.deleteAccount()
                // The account's tokens went with it; this phone also forgets its own.
                stopPush(repository, device.push)
                // The server session is gone with the user; this clears the one on the device.
                runCatching { repository.signOut() }
                onDeleted()
            } catch (e: Exception) {
                error = e.userMessage("Couldn't delete your account. Please try again.")
                isDeleting = false
            }
        }
    }

    AlertDialog(
        onDismissRequest = { if (!isDeleting) onDismiss() },
        properties = DialogProperties(dismissOnClickOutside = !isDeleting),
        icon = { Icon(Icons.Default.DeleteForever, contentDescription = null) },
        title = { Text("Delete account?", modifier = Modifier.asHeading()) },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState())
            ) {
                when (activeRental) {
                    null -> LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    true -> Text(
                        "You have an active rental. In its chat, mark it as returned (or that the deal " +
                            "didn't happen), then you can delete your account."
                    )
                    false -> {
                        Text(DELETE_ACCOUNT_EXPLANATION)
                        OutlinedTextField(
                            value = typed,
                            onValueChange = { typed = it; error = null },
                            label = { Text("Type $DELETE_CONFIRM_WORD to confirm") },
                            singleLine = true,
                            enabled = !isDeleting,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.announced()) }
            }
        },
        confirmButton = {
            if (activeRental == false) {
                TextButton(
                    onClick = { delete() },
                    enabled = typed.trim() == DELETE_CONFIRM_WORD && !isDeleting,
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) { Text(if (isDeleting) "Deleting..." else "Delete account") }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isDeleting) {
                Text(if (activeRental == true) "OK" else "Cancel")
            }
        }
    )
}

@Composable
private fun PasswordField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = Modifier.fillMaxWidth()
    )
}
