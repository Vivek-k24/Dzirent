package com.dzirent.shared.platform

import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.serialization.json.Json

/**
 * Small encrypted key-value storage for the sign-in session (P5A).
 * Android: AES-256-GCM with a key that never leaves the Android Keystore.
 * iPhone: the Keychain.
 */
interface SecureStore {
    fun read(key: String): String?
    fun write(key: String, value: String)
    fun delete(key: String)
}

/** This platform's secure storage, or null when it isn't available (unit tests). */
expect fun platformSecureStore(): SecureStore?

/**
 * Keeps the Supabase session in [store] instead of plain app storage. A session that an earlier
 * version saved in plain storage ([legacy]) is moved over once and deleted there, so nobody is
 * signed out by the update.
 */
class SecureSessionManager(
    private val store: SecureStore,
    private val legacy: SessionManager? = null
) : SessionManager {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    override suspend fun saveSession(session: UserSession) {
        store.write(KEY, json.encodeToString(UserSession.serializer(), session))
    }

    override suspend fun loadSession(): UserSession? {
        store.read(KEY)?.let { saved ->
            return runCatching { json.decodeFromString(UserSession.serializer(), saved) }
                .getOrElse { store.delete(KEY); null }
        }
        val old = legacy ?: return null
        val moved = runCatching { old.loadSession() }.getOrNull() ?: return null
        runCatching { saveSession(moved) }
        runCatching { old.deleteSession() }
        return moved
    }

    override suspend fun deleteSession() {
        store.delete(KEY)
        legacy?.let { runCatching { it.deleteSession() } }
    }

    private companion object {
        const val KEY = "supabase_session"
    }
}
