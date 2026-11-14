package com.dzirent.shared.ui

import androidx.compose.runtime.Composable

/**
 * C6: Didit's own verification flow. The app passes only the session token from didit-start; the ID
 * photos and the selfie are taken in Didit's screens and never reach Dzirent. The result comes from
 * the server (Didit's webhook), so after the flow the app shows "Checking..." until the status
 * changes. Android uses Didit's native SDK (me.didit:didit-sdk); the iPhone SDK is for the Mac
 * session, so [IdVerificationLauncher.available] is false there and the app opens Didit's hosted
 * page in the browser instead.
 */
sealed interface IdVerificationOutcome {
    /** The flow ended (approved, pending or declined): the server's status is the answer. */
    data object Finished : IdVerificationOutcome
    /** The person closed the flow before the end. */
    data object Canceled : IdVerificationOutcome
    /** The flow couldn't run or broke off ([code] from the catalog, e.g. DZ-E6014). */
    data class Failed(val code: String) : IdVerificationOutcome
}

interface IdVerificationLauncher {
    /** False where the app has no native flow yet (iPhone until the Mac session). */
    val available: Boolean

    /** Opens Didit's flow for [sessionToken]; the outcome arrives through [rememberIdVerificationLauncher]'s callback. */
    fun start(sessionToken: String)
}

@Composable
expect fun rememberIdVerificationLauncher(onOutcome: (IdVerificationOutcome) -> Unit): IdVerificationLauncher
