package com.dzirent.shared

import com.dzirent.shared.platform.SecureSessionManager
import com.dzirent.shared.platform.SecureStore
import com.dzirent.shared.repository.storageRefusal
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** P5A: the session lives in secure storage, and one left in plain storage moves over once. */
class SecureSessionTest {
    private class FakeStore : SecureStore {
        val values = mutableMapOf<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String) { values[key] = value }
        override fun delete(key: String) { values.remove(key) }
    }

    private fun session(token: String) =
        UserSession(accessToken = token, refreshToken = "refresh-$token", expiresIn = 3600, tokenType = "bearer")

    @Test
    fun savesAndLoadsFromSecureStore() = runTest {
        val store = FakeStore()
        val manager = SecureSessionManager(store)
        manager.saveSession(session("a"))
        assertEquals("a", manager.loadSession()?.accessToken)
        manager.deleteSession()
        assertNull(manager.loadSession())
        assertTrue(store.values.isEmpty())
    }

    @Test
    fun movesPlainSessionOnceAndDeletesIt() = runTest {
        val store = FakeStore()
        val plain = MemorySessionManager().apply { saveSession(session("old")) }
        val manager = SecureSessionManager(store, legacy = plain)
        assertEquals("old", manager.loadSession()?.accessToken)
        assertNull(plain.loadSession())
        assertEquals(1, store.values.size)
        assertEquals("refresh-old", manager.loadSession()?.refreshToken)
    }

    @Test
    fun unreadableValueSignsOut() = runTest {
        val store = FakeStore().apply { values["supabase_session"] = "not json" }
        assertNull(SecureSessionManager(store).loadSession())
        assertTrue(store.values.isEmpty())
    }

    @Test
    fun storageRefusalsInPlainWords() {
        // C1: Storage's refusals map to catalog codes; the catalog has the plain words.
        assertEquals("DZ-E2065", storageRefusal(400, "413 The object exceeded the maximum allowed size"))
        assertEquals("This photo is too big. Choose one under 10 MB.", com.dzirent.shared.util.ErrorCatalog.message("DZ-E2065"))
        assertEquals("DZ-E2064", storageRefusal(400, "415 mime type image/gif is not supported"))
        assertEquals("Choose a JPEG, PNG or WebP photo.", com.dzirent.shared.util.ErrorCatalog.message("DZ-E2064"))
        assertNull(storageRefusal(400, "new row violates row-level security policy"))
    }
}
