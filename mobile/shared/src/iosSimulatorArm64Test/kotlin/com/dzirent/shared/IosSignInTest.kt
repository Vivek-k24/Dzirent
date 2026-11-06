package com.dzirent.shared

import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.repository.createDzirentSupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.toKString
import kotlinx.coroutines.runBlocking
import platform.posix.getenv
import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Signs test user 1 in through the shared repository on the iOS Simulator (Darwin networking),
 * the same path the iPhone app's sign-in screen uses. Skipped without the test-user variables
 * (passed to the Simulator as SIMCTL_CHILD_TEST_USER_1_EMAIL / _PASSWORD).
 */
class IosSignInTest {
    @OptIn(ExperimentalForeignApi::class)
    private fun env(key: String): String? = getenv(key)?.toKString()?.trim()?.takeIf { it.isNotEmpty() }

    @Test
    fun signsInWithTestUser1() = runBlocking {
        val email = env("TEST_USER_1_EMAIL")
        val password = env("TEST_USER_1_PASSWORD")
        if (email == null || password == null) {
            println("IosSignInTest skipped: TEST_USER_1 variables not set")
            return@runBlocking
        }
        val client = createDzirentSupabaseClient()
        val repository = DzirentRepository(client)
        // Straight to supabase-kt, so a failure shows the real error instead of the app's message.
        try {
            client.auth.signInWith(Email) {
                this.email = email
                this.password = password
            }
        } catch (e: Exception) {
            fail("sign-in failed: ${e::class.simpleName}: ${e.message?.lineSequence()?.firstOrNull()}")
        }
        val profile = repository.getCurrentProfile()
        assertNotNull(profile, "signed in but no profile")
        assertTrue(profile.id.isNotBlank())
        repository.signOut()
        println("IosSignInTest: signed in and out")
    }
}
