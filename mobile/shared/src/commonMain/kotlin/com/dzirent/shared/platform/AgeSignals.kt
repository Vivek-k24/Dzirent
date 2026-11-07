package com.dzirent.shared.platform

/**
 * What the phone's app store says about the user's age (Texas SB 2420, Utah's app store law).
 * Only adult, minor or no answer: the app never asks for a birthdate and never stores one.
 */
enum class AgeSignal {
    /** The store says 18 or older. */
    ADULT,

    /** The store says under 18. */
    MINOR,

    /**
     * No applicable signal: the user isn't in a state covered by an app store age law, the store
     * has no answer for this user, or the check couldn't run. The 18+ confirmation at sign-up stands.
     */
    NONE;

    companion object {
        const val ADULT_AGE = 18

        /**
         * The stores give age ranges (Google Play: 0-12, 13-15, 16-17, 18+). A range that ends
         * below 18 is a minor, one that starts at 18 or above is an adult, anything else is no answer.
         */
        fun fromRange(lower: Int?, upper: Int?): AgeSignal = when {
            upper != null && upper < ADULT_AGE -> MINOR
            lower != null && lower >= ADULT_AGE -> ADULT
            else -> NONE
        }
    }
}

/**
 * The app store's age signal: Google Play Age Signals on Android (androidApp), Apple's Declared
 * Age Range on iPhone (a stub until the Mac session, see IosAgeSignals).
 */
interface AgeSignalsService {
    /** "android" or "ios", recorded with the check. */
    val platform: String

    /** Asks the store. Never throws: anything that goes wrong is [AgeSignal.NONE]. */
    suspend fun check(): AgeSignal
}
