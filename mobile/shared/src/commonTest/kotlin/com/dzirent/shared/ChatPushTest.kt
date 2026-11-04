package com.dzirent.shared

import com.dzirent.shared.platform.ChatPush
import com.dzirent.shared.platform.chatNotificationTag
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChatPushTest {

    // What send-push sends when the recipient has "Show message text" off.
    private val data = mapOf(
        "kind" to "message",
        "conversation_id" to "c1",
        "recipient_id" to "u1",
        "title" to "New message from Maya",
        "tag" to "chat_c1"
    )

    @Test
    fun testParsesSendPushData() {
        val push = assertNotNull(ChatPush.from(data))
        assertEquals("c1", push.conversationId)
        assertEquals("New message from Maya", push.title)
        assertNull(push.body, "No text unless the recipient turned on Show message text")
        assertEquals(chatNotificationTag("c1"), push.tag)
        assertEquals(push.tag, assertNotNull(ChatPush.from(data - "tag")).tag)
        assertNull(ChatPush.from(data - "conversation_id"))
        assertNull(ChatPush.from(data - "title"))
    }

    @Test
    fun testShownOnlyToTheSignedInRecipientAndNotWhileTheChatIsOpen() {
        val push = assertNotNull(ChatPush.from(data))
        assertTrue(push.shouldShow(signedInUserId = "u1", visibleChatId = null))
        assertTrue(push.shouldShow(signedInUserId = "u1", visibleChatId = "c2"))
        assertFalse(push.shouldShow(signedInUserId = "u1", visibleChatId = "c1"), "That chat is on screen")
        assertFalse(push.shouldShow(signedInUserId = "u2", visibleChatId = null), "Another account is signed in")
        assertFalse(push.shouldShow(signedInUserId = null, visibleChatId = null), "Nobody is signed in")
    }
}
