package com.dzirent.shared.platform

import android.app.Application
import me.didit.sdk.DiditSdk

/**
 * C6: Didit's SDK is initialized when the app starts, as Didit documents, so its screens work again
 * if Android restarts the app while they are open. Initializing only keeps the app context and reads
 * the SDK's own cache: no network call and nothing about the person until they start a check.
 */
object AndroidIdVerification {
    fun init(app: Application) {
        if (!DiditSdk.isInitialized()) DiditSdk.initialize(app)
    }
}
