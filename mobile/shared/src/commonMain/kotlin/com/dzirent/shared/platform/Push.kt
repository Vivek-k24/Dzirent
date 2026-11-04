package com.dzirent.shared.platform

/**
 * Push notifications on this phone: Firebase on Android, a stub on iOS for now. The server
 * decides what to send (send-push); the phone registers its token and shows what arrives.
 */
interface PushService {
    /** Stored with the token: "android" or "ios". */
    val platform: String

    /** True where the system asks the person before notifications show (Android 13 and newer). */
    val canAskPermission: Boolean

    /** This phone's push token, or null when push isn't available here. Never throws. */
    suspend fun token(): String?

    /** Forgets this phone's token after sign-out, so the next account gets a new one. Never throws. */
    suspend fun deleteToken()

    /** Whether the phone lets Dzirent show chat notifications right now. */
    fun canNotify(): Boolean

    /** Opens the phone's notification settings for Dzirent. */
    fun openNotificationSettings()

    /** Who is signed in on this phone (null after sign-out); notifications for anyone else are dropped. */
    fun setSignedInUser(userId: String?)

    /** This chat is on screen: its notifications aren't shown, and the one already showing goes away. */
    fun chatShown(conversationId: String)

    /** This chat left the screen (or the app went to the background). */
    fun chatHidden(conversationId: String)
}

/** One notification per chat: a new one replaces the last instead of stacking. send-push sends the same tag. */
fun chatNotificationTag(conversationId: String): String = "chat_$conversationId"

/** A chat notification, from the data message send-push sends. */
data class ChatPush(
    /** "message", "new_chat" or "dates". */
    val kind: String,
    val conversationId: String,
    val recipientId: String?,
    val title: String,
    /** Message text (only if the person turned on "Show message text"), the listing or the dates. */
    val body: String?,
    val tag: String
) {
    /** Only for the account signed in on this phone, and never while its chat is on screen. */
    fun shouldShow(signedInUserId: String?, visibleChatId: String?): Boolean =
        signedInUserId != null &&
            (recipientId == null || recipientId == signedInUserId) &&
            conversationId != visibleChatId

    companion object {
        /** Null if [data] isn't a chat notification. */
        fun from(data: Map<String, String>): ChatPush? {
            val conversationId = data["conversation_id"]?.takeIf { it.isNotBlank() } ?: return null
            val title = data["title"]?.takeIf { it.isNotBlank() } ?: return null
            return ChatPush(
                kind = data["kind"].orEmpty(),
                conversationId = conversationId,
                recipientId = data["recipient_id"]?.takeIf { it.isNotBlank() },
                title = title,
                body = data["body"]?.takeIf { it.isNotBlank() },
                tag = data["tag"]?.takeIf { it.isNotBlank() } ?: chatNotificationTag(conversationId)
            )
        }
    }
}
