package com.dzirent.shared.platform

import com.russhwolf.settings.ExperimentalSettingsImplementation
import com.russhwolf.settings.KeychainSettings
import platform.Foundation.NSUserDefaults

/**
 * The sign-in session in the iPhone Keychain (P5A), through multiplatform-settings'
 * KeychainSettings (the library supabase-kt already uses). Items are generic passwords under
 * this service name, readable only by this app.
 */
@OptIn(ExperimentalSettingsImplementation::class)
private class KeychainSecureStore : SecureStore {
    private val keychain = KeychainSettings(service = "com.dzirent.app.session")

    override fun read(key: String): String? = keychain.getStringOrNull(key)
    override fun write(key: String, value: String) = keychain.putString(key, value)
    override fun delete(key: String) = keychain.remove(key)

    /** Removes everything this app keeps in the Keychain. */
    fun clearAll() = keychain.clear()
}

/**
 * Keychain items survive deleting the app; NSUserDefaults don't. So on the first launch after an
 * install (no marker in NSUserDefaults), any session an earlier install left in the Keychain is
 * cleared before anything reads it, and the person starts signed out (P5C).
 */
private const val KEYCHAIN_READY = "dzirent_keychain_ready"

private val keychainStore: SecureStore by lazy {
    val store = KeychainSecureStore()
    val defaults = NSUserDefaults.standardUserDefaults
    if (!defaults.boolForKey(KEYCHAIN_READY)) {
        runCatching { store.clearAll() }
        defaults.setBool(true, forKey = KEYCHAIN_READY)
    }
    store
}

actual fun platformSecureStore(): SecureStore? = keychainStore
