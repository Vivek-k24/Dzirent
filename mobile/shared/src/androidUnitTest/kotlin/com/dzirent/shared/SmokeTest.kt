package com.dzirent.shared

import com.dzirent.shared.config.SupabaseBuildConfig
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.repository.createDzirentSupabaseClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assume
import org.junit.Before
import org.junit.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class SmokeTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun getEnvOrNull(key: String): String? =
        System.getenv(key)?.takeIf { it.isNotBlank() }

    @Test
    fun testSmokeRepositoryOperations() = runBlocking {
        val url = getEnvOrNull("SUPABASE_URL") ?: SupabaseBuildConfig.SUPABASE_URL.takeIf { it.isNotBlank() }
        val key = getEnvOrNull("SUPABASE_PUBLISHABLE_KEY")
            ?: getEnvOrNull("SUPABASE_ANON_KEY")
            ?: SupabaseBuildConfig.SUPABASE_PUBLISHABLE_KEY.takeIf { it.isNotBlank() }
        val user1Email = getEnvOrNull("TEST_USER_1_EMAIL")
        val user1Password = getEnvOrNull("TEST_USER_1_PASSWORD")
        val user3Email = getEnvOrNull("TEST_USER_3_EMAIL")
        val user3Password = getEnvOrNull("TEST_USER_3_PASSWORD")

        Assume.assumeTrue(
            "Missing environment variables for smoke test; skipping.",
            url != null && key != null && user1Email != null && user1Password != null && user3Email != null && user3Password != null
        )

        // 1. Guest: browse_listings returns cards
        val guestClient = createDzirentSupabaseClient(url = url!!, key = key!!)
        val guestRepo = DzirentRepository(guestClient)
        val cards = guestRepo.browseListings(limit = 10)
        assertNotNull(cards)
        assertTrue(cards.isNotEmpty(), "browse_listings should return cards for guest")

        // 2. Test user 1: load own listings through repository
        val user1Client = createDzirentSupabaseClient(url = url, key = key)
        val user1Repo = DzirentRepository(user1Client)
        user1Repo.signIn(user1Email!!, user1Password!!)
        val profile1 = user1Repo.getCurrentProfile()
        assertNotNull(profile1)
        val user1Handle = profile1.studioHandle
        assertTrue(!user1Handle.isNullOrBlank(), "Test user 1 should have a studio handle")

        val ownListings = user1Repo.getMyListings()
        assertNotNull(ownListings)
        assertTrue(ownListings.isNotEmpty(), "Test user 1 should have own listings")
        user1Repo.signOut()

        // 3. Test user 3: block_user then unblock_user on test user 1's handle
        val user3Client = createDzirentSupabaseClient(url = url, key = key)
        val user3Repo = DzirentRepository(user3Client)
        user3Repo.signIn(user3Email!!, user3Password!!)

        // block_user
        user3Repo.blockUser(user1Handle)
        // unblock_user
        user3Repo.unblockUser(user1Handle)

        user3Repo.signOut()
    }
}

