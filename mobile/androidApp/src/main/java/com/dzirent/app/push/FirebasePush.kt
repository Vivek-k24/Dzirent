package com.dzirent.app.push

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.dzirent.shared.platform.PushService
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Firebase Cloud Messaging for the shared app. A build without google-services.json (see
 * androidApp/build.gradle.kts) has no Firebase app, and push is simply unavailable.
 *
 * firebase-messaging 25.1 deprecated the token calls in favour of registering with the
 * Firebase installation ID, but Firebase documents sending (HTTP v1) only to tokens, which
 * is what send-push does. Move both sides once the installation ID route is documented.
 */
@Suppress("DEPRECATION")
class FirebasePush(context: Context) : PushService {
    private val app = context.applicationContext

    override val platform: String = PLATFORM

    override val canAskPermission: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

    override suspend fun token(): String? {
        if (!firebaseReady(app)) return null
        return withTimeoutOrNull(TOKEN_TIMEOUT_MS) {
            runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()
        }
    }

    override suspend fun deleteToken() {
        if (!firebaseReady(app)) return
        withTimeoutOrNull(TOKEN_TIMEOUT_MS) {
            runCatching { FirebaseMessaging.getInstance().deleteToken().await() }
        }
    }

    override fun canNotify(): Boolean = ChatNotifications.canNotify(app)

    override fun openNotificationSettings() {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, app.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { app.startActivity(intent) }
    }

    override fun setSignedInUser(userId: String?) {
        prefs(app).edit().putString(KEY_SIGNED_IN_USER, userId).apply()
        // Signed out: nothing from that account stays on screen.
        if (userId == null) NotificationManagerCompat.from(app).cancelAll()
    }

    override fun chatShown(conversationId: String) {
        visibleChat = conversationId
        ChatNotifications.cancel(app, conversationId)
    }

    override fun chatHidden(conversationId: String) {
        if (visibleChat == conversationId) visibleChat = null
    }

    companion object {
        const val PLATFORM = "android"
        private const val TOKEN_TIMEOUT_MS = 15_000L
        private const val KEY_SIGNED_IN_USER = "signed_in_user"

        /** The chat on screen. The messaging service reads it on Firebase's own thread. */
        @Volatile
        var visibleChat: String? = null
            private set

        /** Whose notifications this phone shows (null when signed out). */
        fun signedInUser(context: Context): String? = prefs(context).getString(KEY_SIGNED_IN_USER, null)

        private fun prefs(context: Context) =
            context.applicationContext.getSharedPreferences("dzirent_push", Context.MODE_PRIVATE)

        private fun firebaseReady(context: Context) = FirebaseApp.getApps(context).isNotEmpty()
    }
}

/** Waits for a Play services task. */
private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnCompleteListener { task ->
        val error = task.exception
        if (error == null && task.isSuccessful) {
            continuation.resume(task.result)
        } else {
            continuation.resumeWithException(error ?: IllegalStateException("Firebase task was cancelled"))
        }
    }
}
