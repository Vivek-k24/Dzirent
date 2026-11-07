package com.dzirent.shared.platform

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * Apple's Declared Age Range for the P2C age gate (iOS 26.2 and later).
 *
 * The framework is Swift-only, so the Swift app (iosApp/AgeRange.swift) implements
 * [IosAgeRangeProvider] and registers it in [IosAgeRange] at launch. It asks only when Apple says
 * age assurance applies to this user (isEligibleForAgeFeatures), with an age gate of 18, and
 * replies with the range's bounds. Older iOS versions, users outside a covered region, a declined
 * or failed request, or no provider at all are "no applicable signal" ([AgeSignal.NONE]), and the
 * 18+ confirmation at sign-up stands. The app never asks for or keeps a birthdate.
 * The shared age gate (util/AgeGate.kt) records whatever this returns, on sign-in and once a day.
 */
class IosAgeSignals : AgeSignalsService {
    override val platform: String = PLATFORM

    override suspend fun check(): AgeSignal {
        val provider = IosAgeRange.provider ?: return AgeSignal.NONE
        return withTimeoutOrNull(TIMEOUT_MS) {
            suspendCancellableCoroutine { continuation ->
                provider.requestAgeRange(
                    AgeSignal.ADULT_AGE,
                    AgeRangeReply { signal -> if (continuation.isActive) continuation.resume(signal) },
                )
            }
        } ?: AgeSignal.NONE
    }

    private companion object {
        const val PLATFORM = "ios"

        // Longer than Android's 10 s: in a covered region Apple may show its own sharing sheet.
        const val TIMEOUT_MS = 60_000L
    }
}

/** Where the Swift app registers its Declared Age Range provider at launch. */
object IosAgeRange {
    var provider: IosAgeRangeProvider? = null
}

/** Implemented in Swift: asks Declared Age Range and answers [reply] exactly once. */
interface IosAgeRangeProvider {
    fun requestAgeRange(ageGate: Int, reply: AgeRangeReply)
}

/** The Swift provider's answer. A bound of -1 means that end of the range is open (Swift nil). */
class AgeRangeReply internal constructor(private val onSignal: (AgeSignal) -> Unit) {
    /** The user shared a range. */
    fun answer(lower: Int, upper: Int) {
        onSignal(AgeSignal.fromRange(lower.takeIf { it >= 0 }, upper.takeIf { it >= 0 }))
    }

    /** No applicable signal: not covered, declined, unavailable or failed. */
    fun noSignal() {
        onSignal(AgeSignal.NONE)
    }
}
