package com.dzirent.shared.util

import com.dzirent.shared.model.MyVerification

/**
 * C6: ID verification as the apps word it. The database decides everything (my_verification,
 * didit-start, the gate); these only turn its answers into labels, sentences and buttons. The
 * website has the same rules in apps/web/src/lib/verification.ts.
 */
object VerificationStatus {
    const val NOT_STARTED = "not_started"
    const val IN_PROGRESS = "in_progress"
    const val IN_REVIEW = "in_review"
    const val VERIFIED = "verified"
    const val DECLINED = "declined"
    const val EXPIRED = "expired"
}

/** The database's refusal while verification_required is on: "Verify your ID once to continue." */
const val VERIFY_GATE_CODE = "DZ-E6001"

/** The status as people read it; unknown ones read as not verified. */
fun verificationLabel(status: String?): String = when (status) {
    VerificationStatus.IN_PROGRESS -> "In progress"
    VerificationStatus.IN_REVIEW -> "In review"
    VerificationStatus.VERIFIED -> "Verified"
    VerificationStatus.EXPIRED -> "Expired"
    else -> "Not verified"
}

private fun tries(n: Int) = if (n == 1) "1 try left" else "$n tries left"

/** One sentence under the status. */
fun verificationDetail(status: String?, attemptsLeft: Int, available: Boolean = true): String = when (status) {
    VerificationStatus.VERIFIED ->
        "Your ID is verified. People see a Verified badge on your listings, your studio and your chats."
    VerificationStatus.IN_REVIEW -> "Someone at Dzirent is checking your ID. You'll see the result here."
    VerificationStatus.IN_PROGRESS ->
        if (attemptsLeft > 0) "Your check isn't finished yet. If you closed it, start again (${tries(attemptsLeft)})."
        else "Your check isn't finished yet. If it doesn't finish, contact support to verify."
    VerificationStatus.DECLINED ->
        if (attemptsLeft > 0) "Your ID couldn't be verified. You can try again (${tries(attemptsLeft)})."
        else "Your ID couldn't be verified. Contact support to verify."
    VerificationStatus.EXPIRED ->
        if (attemptsLeft > 0) "Your verification ended before it was finished or has expired. You can verify again (${tries(attemptsLeft)})."
        else "Your verification ended or expired. Contact support to verify."
    else ->
        if (available) "Verify your ID once and people see a Verified badge on your listings, your studio and your chats."
        else "ID verification isn't available yet."
}

/** The button's words, or null when there is no button (unavailable, verified, in review, no tries left). */
fun verificationAction(v: MyVerification, available: Boolean): String? = when {
    !available || !v.canStart -> null
    v.status == VerificationStatus.IN_PROGRESS -> "Start again"
    v.status == VerificationStatus.DECLINED || v.status == VerificationStatus.EXPIRED -> "Try again"
    else -> "Verify ID"
}

/** Out of tries: the screen points to support instead of a button. */
fun verificationNeedsSupport(v: MyVerification): Boolean =
    !v.canStart && v.status != VerificationStatus.VERIFIED && v.status != VerificationStatus.IN_REVIEW

/** True once the check has an outcome "Checking..." can show. */
fun verificationSettled(status: String?): Boolean =
    status != null && status != VerificationStatus.IN_PROGRESS && status != VerificationStatus.NOT_STARTED

/** True for the gate's refusal (DZ-E6001), so the screen can offer "Verify ID" and try again after. */
fun isVerificationGate(code: String?): Boolean = code == VERIFY_GATE_CODE

/** The "Verified" badge shows for a verified person only; it says nothing else about them. */
fun showsVerifiedBadge(isVerified: Boolean?): Boolean = isVerified == true

/** What a screen reader says for a card or header with the badge. */
fun withVerifiedLabel(text: String, isVerified: Boolean?): String =
    if (showsVerifiedBadge(isVerified)) "$text, Verified" else text
