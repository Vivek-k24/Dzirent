package com.dzirent.shared.platform

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Gives the shared code the app's context for the secure session storage (P5A). The app calls
 * [init] in Application.onCreate, before anything makes the Supabase client.
 */
object AndroidSecureStorage {
    @Volatile
    internal var store: SecureStore? = null

    fun init(context: Context) {
        if (store == null) store = KeystoreSecureStore(context.applicationContext)
    }
}

actual fun platformSecureStore(): SecureStore? = AndroidSecureStorage.store

/**
 * Values are encrypted with AES-256-GCM under a key kept in the Android Keystore (it can't be
 * read out of the phone), and only the ciphertext is written to this app's private preferences.
 */
private class KeystoreSecureStore(context: Context) : SecureStore {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val lock = Any()

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    override fun read(key: String): String? = synchronized(lock) {
        val stored = prefs.getString(key, null) ?: return null
        try {
            val sealed = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES))
            String(cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES), Charsets.UTF_8)
        } catch (e: Exception) {
            // Can't be read (for example the key is gone after a reset): sign in again.
            prefs.edit().remove(key).commit()
            null
        }
    }

    override fun write(key: String, value: String) {
        synchronized(lock) {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val sealed = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
            prefs.edit().putString(key, Base64.encodeToString(sealed, Base64.NO_WRAP)).commit()
        }
    }

    override fun delete(key: String) {
        synchronized(lock) { prefs.edit().remove(key).commit() }
    }

    private companion object {
        const val PREFS = "dzirent_secure_session"
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "dzirent_session_key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
