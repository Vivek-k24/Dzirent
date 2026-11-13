package com.dzirent.shared.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.dzirent.shared.platform.KeyValueStore
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.platform.PushService
import com.dzirent.shared.repository.DzirentRepository

/**
 * Notifications are offered once on this phone, right after the first message sent (never at
 * first launch). Declining is final; Settings > Notifications can still turn them on.
 */
class NotificationPromptStore(private val prefs: KeyValueStore) {
    val asked: Boolean get() = prefs.getBoolean(PROMPT_KEY, false)

    fun markAsked() = prefs.putBoolean(PROMPT_KEY, true)

    /** The system question is asked once; after that, turning on opens the phone's settings. */
    var systemAsked: Boolean
        get() = prefs.getBoolean(SYSTEM_KEY, false)
        set(value) = prefs.putBoolean(SYSTEM_KEY, value)

    private companion object {
        const val PROMPT_KEY = "notification_prompt_shown"
        const val SYSTEM_KEY = "notification_permission_requested"
    }
}

/** The short explanation before the system asks. */
@Composable
fun NotificationPromptDialog(onTurnOn: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.Notifications, contentDescription = null) },
        title = { Text("Get notified when they reply", modifier = Modifier.asHeading()) },
        text = {
            Text(
                "Dzirent tells you about new messages and new dates in your chats. What they wrote " +
                    "stays off your lock screen unless you turn it on in Settings."
            )
        },
        confirmButton = { TextButton(onClick = onTurnOn) { Text("Turn on") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now") } }
    )
}

/**
 * Turns on notifications for Dzirent: the system question the first time (Android 13 and
 * newer), otherwise the phone's notification settings. [onResult] gets whether notifications
 * can show now; after the settings page, check again when the screen resumes.
 */
@Composable
fun rememberTurnOnNotifications(onResult: (Boolean) -> Unit): () -> Unit {
    val device = LocalDevice.current
    val store = remember { NotificationPromptStore(device.prefs) }
    val ask = rememberNotificationPermissionRequest(onResult)
    return {
        val push = device.push
        when {
            push.canNotify() -> onResult(true)
            push.canAskPermission && !store.systemAsked -> {
                store.systemAsked = true
                ask()
            }
            else -> push.openNotificationSettings()
        }
    }
}

/** Asks the system for permission to show notifications; [onResult] gets the answer. */
@Composable
expect fun rememberNotificationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit

/** This phone gets [userId]'s notifications. Runs on sign-in and each start; a failure waits for the next. */
suspend fun registerPush(repository: DzirentRepository, push: PushService, userId: String) {
    push.setSignedInUser(userId)
    val token = push.token() ?: return
    runCatching { repository.registerPushToken(token, push.platform) }
}

/** Before signing out (or after deleting the account): this phone stops getting the account's notifications. */
suspend fun stopPush(repository: DzirentRepository, push: PushService) {
    push.setSignedInUser(null)
    push.token()?.let { token -> runCatching { repository.unregisterPushToken(token) } }
    push.deleteToken()
}
