package com.dzirent.app.age

import android.content.Context
import com.dzirent.shared.platform.AgeSignal
import com.dzirent.shared.platform.AgeSignalsService
import com.google.android.gms.tasks.Task
import com.google.android.play.agesignals.AgeSignalsManagerFactory
import com.google.android.play.agesignals.AgeSignalsRequest
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Google Play Age Signals (com.google.android.play:age-signals 0.0.4) for the P2C age gate.
 *
 * Play returns an age range (ageLower / ageUpper) only for users in a state covered by an app
 * store age law who have one; everyone else gets no range, or an error such as APP_NOT_OWNED for
 * a build not installed from Play. All of those are "no applicable signal" ([AgeSignal.NONE]).
 * The app never asks for or keeps a birthdate, and never calls requestAgeSignalsAccess (Play's
 * own sharing prompt): it only reads what Play already shares.
 */
class PlayAgeSignals(context: Context) : AgeSignalsService {
    private val app = context.applicationContext

    override val platform: String = PLATFORM

    override suspend fun check(): AgeSignal {
        val result = withTimeoutOrNull(TIMEOUT_MS) {
            runCatching {
                AgeSignalsManagerFactory.create(app)
                    .checkAgeSignals(AgeSignalsRequest.builder().build())
                    .await()
            }.getOrNull()
        } ?: return AgeSignal.NONE
        return AgeSignal.fromRange(result.ageLower(), result.ageUpper())
    }

    private companion object {
        const val PLATFORM = "android"
        const val TIMEOUT_MS = 10_000L
    }
}

/** Waits for a Play services task. */
private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnCompleteListener { task ->
        val error = task.exception
        if (error == null && task.isSuccessful) {
            continuation.resume(task.result)
        } else {
            continuation.resumeWithException(error ?: IllegalStateException("Age Signals task was cancelled"))
        }
    }
}
