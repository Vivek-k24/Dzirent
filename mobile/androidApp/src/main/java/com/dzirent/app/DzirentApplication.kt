package com.dzirent.app

import android.app.Application
import com.dzirent.shared.platform.AndroidSecureStorage

/**
 * Runs before any activity or service (including the push service), so the sign-in session is
 * always read from and saved to the Keystore-encrypted storage (P5A).
 */
class DzirentApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AndroidSecureStorage.init(this)
    }
}
