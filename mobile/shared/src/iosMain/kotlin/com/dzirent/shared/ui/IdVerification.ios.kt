package com.dzirent.shared.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState

/**
 * C6: the iPhone has no native Didit flow yet. The Mac session adds Didit's iOS SDK (Swift, called
 * from here) started with the session token. Until then [available] is false and the shared screen
 * opens Didit's hosted page in the browser (didit-start's url) and waits for the server's status.
 */
@Composable
actual fun rememberIdVerificationLauncher(onOutcome: (IdVerificationOutcome) -> Unit): IdVerificationLauncher {
    val callback = rememberUpdatedState(onOutcome)
    return remember {
        object : IdVerificationLauncher {
            override val available: Boolean = false

            override fun start(sessionToken: String) {
                callback.value(IdVerificationOutcome.Failed("DZ-E6015"))
            }
        }
    }
}
