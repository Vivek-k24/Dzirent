package com.dzirent.shared.util

import com.dzirent.shared.platform.AgeSignal
import com.dzirent.shared.platform.DeviceServices
import com.dzirent.shared.repository.DzirentRepository

/** The refusal the database gives a blocked account, and the blocked screen's title. */
const val AGE_GATE_MESSAGE = "Dzirent is only for people 18 and older."

/**
 * The age gate (P2C): on sign-in and once a day when the app opens, ask the app store's age
 * signal and record it with record_age_check. The server decides whether the account is blocked
 * (a store's "minor" blocks; only a store's "adult" lifts it) and refuses every write while it is.
 */
object AgeGate {
    /** What a signal is recorded as: (source, result). No signal falls back on the 18+ confirmation at sign-up. */
    fun recordFor(signal: AgeSignal): Pair<String, String> = when (signal) {
        AgeSignal.ADULT -> "store_signal" to "adult"
        AgeSignal.MINOR -> "store_signal" to "minor"
        AgeSignal.NONE -> "self_declared" to "adult"
    }

    /** True when today's check has already run for this account (the day as an epoch-day number). */
    fun checkedToday(lastCheckedDay: String?, today: Int): Boolean = lastCheckedDay == today.toString()

    /**
     * Runs the check and returns true when the account is blocked. [onSignIn] always asks the
     * store; an app start asks at most once a day and otherwise uses the last answer kept on the
     * phone. If the server can't be reached, the last answer stands (a store "minor" blocks
     * anyway) and the check runs again next time.
     */
    suspend fun check(repository: DzirentRepository, device: DeviceServices, userId: String, onSignIn: Boolean): Boolean {
        val prefs = device.prefs
        val dayKey = "age_check_day_$userId"
        val blockedKey = "age_blocked_$userId"
        val lastBlocked = prefs.getBoolean(blockedKey, false)
        val today = today().toEpochDays()
        if (!onSignIn && checkedToday(prefs.getString(dayKey), today)) return lastBlocked

        val signal = device.ageSignals.check()
        val (source, result) = recordFor(signal)
        val blocked = runCatching { repository.recordAgeCheck(source, result, device.ageSignals.platform) }.getOrNull()
            ?: return lastBlocked || signal == AgeSignal.MINOR
        prefs.putString(dayKey, today.toString())
        prefs.putBoolean(blockedKey, blocked)
        return blocked
    }
}
