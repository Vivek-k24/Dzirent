package com.dzirent.shared.platform

/**
 * STUB (P2C): Apple's Declared Age Range isn't wired up yet. It behaves like "no applicable
 * signal", so the iPhone relies on the 18+ confirmation at sign-up and records "self_declared".
 *
 * Left for the Mac session (it needs Xcode, Swift and the entitlement):
 * - Add the Declared Age Range entitlement (com.apple.developer.declared-age-range) to the app.
 * - In Swift, ask the DeclaredAgeRange framework's AgeRangeService for the range with an age
 *   gate of 18, and hand its lower and upper bound to Kotlin. Check Apple's current names and the
 *   minimum iOS version first; these notes weren't verified on a Mac.
 * - Return AgeSignal.fromRange(lowerBound, upperBound) here; a declined or failed request is NONE.
 * - Never ask for or store a birthdate.
 * The shared age gate (util/AgeGate.kt) already records whatever this returns, on sign-in and
 * once a day, and shows the blocked screen for a minor.
 */
class IosAgeSignals : AgeSignalsService {
    override val platform: String = "ios"

    override suspend fun check(): AgeSignal = AgeSignal.NONE
}
