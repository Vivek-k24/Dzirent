package com.dzirent.app.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.dzirent.app.MainActivity
import com.dzirent.app.R
import com.dzirent.shared.platform.ChatPush
import com.dzirent.shared.platform.chatNotificationTag

/**
 * Chat notifications, built on the phone from send-push's data messages, in the "Messages"
 * channel. One notification per chat (its tag); tapping it opens that chat.
 */
object ChatNotifications {
    // Also the default channel in AndroidManifest.xml.
    private const val CHANNEL_ID = "messages"

    // The tag tells chats apart, so the id is the same for all of them.
    private const val NOTIFICATION_ID = 1
    private const val EXTRA_CONVERSATION_ID = "com.dzirent.app.extra.CONVERSATION_ID"

    // The accent maroon (theme AccentOnLight).
    private const val ACCENT = 0xFF8E1538.toInt()

    fun createChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "New messages, new chats and date changes"
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /** Notifications are allowed for Dzirent and its Messages channel. */
    fun canNotify(context: Context): Boolean {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return false
        val channel = manager.getNotificationChannel(CHANNEL_ID)
        return channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE
    }

    fun show(context: Context, data: Map<String, String>) {
        val push = ChatPush.from(data) ?: return
        if (!push.shouldShow(FirebasePush.signedInUser(context), FirebasePush.visibleChat)) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        createChannel(context)

        val open = Intent(context, MainActivity::class.java)
            .putExtra(EXTRA_CONVERSATION_ID, push.conversationId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val tap = PendingIntent.getActivity(
            context,
            push.tag.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ACCENT)
            .setContentTitle(push.title)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tap)
        // What a locked phone set to hide sensitive content shows: the title, never the text.
        val publicVersion = builder.build()
        push.body?.let { body ->
            builder.setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
        builder.setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setPublicVersion(publicVersion)
        try {
            NotificationManagerCompat.from(context).notify(push.tag, NOTIFICATION_ID, builder.build())
        } catch (_: SecurityException) {
            // Permission withdrawn a moment ago.
        }
    }

    fun cancel(context: Context, conversationId: String) {
        NotificationManagerCompat.from(context).cancel(chatNotificationTag(conversationId), NOTIFICATION_ID)
    }

    /** The chat a tapped notification opened the app for. Not when reopened from Recents. */
    fun chatToOpen(intent: Intent?): String? {
        if (intent == null || intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return null
        return intent.getStringExtra(EXTRA_CONVERSATION_ID)?.takeIf { it.isNotBlank() }
    }
}
