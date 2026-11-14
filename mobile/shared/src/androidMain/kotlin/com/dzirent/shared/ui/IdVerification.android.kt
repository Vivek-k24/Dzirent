package com.dzirent.shared.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.didit.sdk.DiditSdk
import me.didit.sdk.DiditSdkState
import me.didit.sdk.VerificationResult

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/**
 * C6: Didit's native Android SDK (me.didit:didit-sdk, pinned in gradle/libs.versions.toml), started
 * with the session token from didit-start. DiditSdk.initialize runs at app start
 * (AndroidIdVerification.init, from DzirentApplication). startVerification sets the SDK's state to
 * Loading at once; when it becomes Ready the SDK's screens open over the app. The SDK's own result
 * (approved, pending, declined) isn't used: the server's status is the answer.
 */
@Composable
actual fun rememberIdVerificationLauncher(onOutcome: (IdVerificationOutcome) -> Unit): IdVerificationLauncher {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    val callback = rememberUpdatedState(onOutcome)
    val scope = rememberCoroutineScope()
    return remember(activity) {
        object : IdVerificationLauncher {
            override val available: Boolean = activity != null

            override fun start(sessionToken: String) {
                val host = activity ?: return callback.value(IdVerificationOutcome.Failed("DZ-E6014"))
                if (!DiditSdk.isInitialized()) DiditSdk.initialize(host.applicationContext)
                var reported = false
                var watcher: Job? = null
                fun report(outcome: IdVerificationOutcome) {
                    if (reported) return
                    reported = true
                    watcher?.cancel()
                    callback.value(outcome)
                }
                DiditSdk.startVerification(token = sessionToken) { result ->
                    report(
                        when (result) {
                            is VerificationResult.Completed -> IdVerificationOutcome.Finished
                            is VerificationResult.Cancelled -> IdVerificationOutcome.Canceled
                            is VerificationResult.Failed -> IdVerificationOutcome.Failed("DZ-E6014")
                            else -> IdVerificationOutcome.Failed("DZ-E6014")
                        }
                    )
                }
                var shown = false
                watcher = scope.launch {
                    DiditSdk.state.collect { state ->
                        when (state) {
                            is DiditSdkState.Ready -> if (!shown) {
                                shown = true
                                DiditSdk.launchVerificationUI(host)
                            }
                            is DiditSdkState.Error -> if (!shown) report(IdVerificationOutcome.Failed("DZ-E6014"))
                            else -> Unit
                        }
                    }
                }
            }
        }
    }
}
