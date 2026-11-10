package com.dzirent.shared

import com.dzirent.shared.util.LinkTarget
import com.dzirent.shared.util.ShareLinks
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** P5C: share text, and which opened links the app takes over. */
class ShareLinksTest {
    private val id = "4b47fb88-39b6-40d6-8679-99b44bb91efd"

    @Test
    fun shareTextUsesCleanLinks() {
        assertEquals("Silk saree on Dzirent: https://dzirent.com/listing/$id", ShareLinks.listingText("Silk saree", id))
        assertEquals("Mira's closet on Dzirent: https://dzirent.com/studio/mira_closet", ShareLinks.studioText("Mira's closet", "mira_closet"))
    }

    @Test
    fun opensListingAndStudioLinks() {
        assertEquals(LinkTarget.Listing(id), ShareLinks.parse("https://dzirent.com/listing/$id"))
        assertEquals(LinkTarget.Listing(id), ShareLinks.parse("https://www.dzirent.com/listing/${id.uppercase()}/?utm_source=x#top"))
        assertEquals(LinkTarget.Studio("mira_closet"), ShareLinks.parse("https://dzirent.com/studio/mira_closet"))
    }

    @Test
    fun ignoresEverythingElse() {
        assertNull(ShareLinks.parse(null))
        assertNull(ShareLinks.parse("http://dzirent.com/listing/$id"))
        assertNull(ShareLinks.parse("https://evil.example/listing/$id"))
        assertNull(ShareLinks.parse("https://dzirent.com/listing/not-an-id"))
        assertNull(ShareLinks.parse("https://dzirent.com/listing/$id/extra"))
        assertNull(ShareLinks.parse("https://dzirent.com/studio/bad%20handle"))
        assertNull(ShareLinks.parse("https://dzirent.com/privacy"))
    }
}
