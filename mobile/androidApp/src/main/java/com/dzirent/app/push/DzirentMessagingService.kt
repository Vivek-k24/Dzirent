package com.dzirent.app.push

import com.dzirent.shared.repository.DzirentRepository
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

/** Firebase delivers here: chat notifications, and new push tokens for this phone. */
class DzirentMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        ChatNotifications.show(applicationContext, message.data)
    }

    /**
     * Firebase made a new token for this phone: it now gets the signed-in account's
     * notifications. Deprecated in firebase-messaging 25.1 (see [FirebasePush]).
     */
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) {
        val userId = FirebasePush.signedInUser(applicationContext) ?: return
        // Firebase calls this on its own worker thread and waits for it to return.
        runBlocking {
            withTimeoutOrNull(REGISTER_TIMEOUT_MS) {
                val repository = DzirentRepository.shared
                repository.awaitAuth()
                if (repository.currentUserId == userId) {
                    runCatching { repository.registerPushToken(token, FirebasePush.PLATFORM) }
                }
            }
        }
    }

    private companion object {
        const val REGISTER_TIMEOUT_MS = 10_000L
    }
}
