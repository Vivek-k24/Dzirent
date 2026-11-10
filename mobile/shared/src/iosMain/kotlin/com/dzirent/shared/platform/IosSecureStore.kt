package com.dzirent.shared.platform

import com.russhwolf.settings.ExperimentalSettingsImplementation
import com.russhwolf.settings.KeychainSettings

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
}

private val keychainStore: SecureStore by lazy { KeychainSecureStore() }

actual fun platformSecureStore(): SecureStore? = keychainStore
