package com.dzirent.shared.util

import com.dzirent.shared.config.SupabaseBuildConfig

/**
 * E1: where the app's sign-in emails and Google sign-in come back to, and the rules behind
 * "Forgot password?", "Send the link again", Google's return and "Finish your profile". Pure code,
 * so the unit tests run it; the screens and the repository call Supabase.
 */
object AuthLinks {
    /** The app's return address from Google (Custom Tabs): in the manifest and Supabase's redirect list. */
    const val SCHEME = "dzirent"
    const val HOST = "auth"
    const val CALLBACK = "dzirent://auth/callback"

    /** The website the emails' links open (the reset page, "You're confirmed"). */
    val website: String get() = SupabaseBuildConfig.WEBSITE_URL.trimEnd('/')
    /** A reset email opens the website's reset page in the browser; the app has no reset page. */
    val resetPage: String get() = "$website/auth/reset"
    /** A confirmation email opens the website's callback, which says "You're confirmed". */
    val confirmPage: String get() = "$website/auth/callback"
}

/** What a link that opened the app means for sign-in. */
sealed class AuthCallback {
    /** Google came back with a code: exchange it (PKCE) for a session. */
    data class Code(val code: String) : AuthCallback()
    /** Google or Supabase said no (cancelled, refused): show [error]. */
    data class Failed(val error: ShownError) : AuthCallback()
    /** Not a sign-in link (a shared listing, for example). */
    data object NotOurs : AuthCallback()
}

object AuthDeepLink {
    /** True for dzirent://auth/callback (with or without a query or fragment). */
    fun isOurs(uri: String?): Boolean {
        val u = uri?.trim() ?: return false
        val rest = u.removePrefix("${AuthLinks.SCHEME}://").takeIf { it != u } ?: return false
        val hostAndPath = rest.substringBefore('?').substringBefore('#')
        return hostAndPath == "${AuthLinks.HOST}/callback" || hostAndPath == "${AuthLinks.HOST}/callback/"
    }

    /** The parameters of the query and the fragment (Auth may put an error in either). */
    private fun params(uri: String): Map<String, String> {
        val parts = listOf(uri.substringAfter('?', "").substringBefore('#'), uri.substringAfter('#', ""))
        return parts.flatMap { it.split('&') }
            .mapNotNull { pair ->
                val key = pair.substringBefore('=', "")
                if (key.isEmpty()) null else key to decode(pair.substringAfter('=', ""))
            }
            .toMap()
    }

    private fun isHex(c: Char) = c.isDigit() || c.lowercaseChar() in 'a'..'f'

    /** %XX and + decoded (UTF-8). */
    private fun decode(s: String): String {
        val bytes = mutableListOf<Byte>()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '%' && i + 2 < s.length && isHex(s[i + 1]) && isHex(s[i + 2])) {
                bytes.add(s.substring(i + 1, i + 3).toInt(16).toByte())
                i += 3
            } else {
                bytes.addAll((if (c == '+') " " else c.toString()).encodeToByteArray().toList())
                i++
            }
        }
        return bytes.toByteArray().decodeToString()
    }

    fun parse(uri: String?): AuthCallback {
        if (!isOurs(uri)) return AuthCallback.NotOurs
        val p = params(uri!!.trim())
        val error = p["error"] ?: p["error_code"]
        if (error != null) {
            return AuthCallback.Failed(ErrorCatalog.shown(if (error == "access_denied") "DZ-E7022" else "DZ-E7020"))
        }
        val code = p["code"]?.takeIf { Regex("^[\\w-]{6,512}$").matches(it) }
            ?: return AuthCallback.Failed(ErrorCatalog.shown("DZ-E7020"))
        return AuthCallback.Code(code)
    }
}

/** What Supabase Auth said about a failed request: its error code, the HTTP status, its words. */
data class AuthAnswer(val code: String?, val status: Int?, val message: String?)

/** The neutral words "Forgot password?" always shows (whether or not the address has an account). */
const val NEUTRAL_RESET = "If that address has an account, we've sent a link to reset its password. Open it on this phone or a computer; it works for one hour."
const val NEUTRAL_RESEND = "If that address is waiting to be confirmed, we've sent the link again."

/** The outcome of "Forgot password?" or "Send the link again": sent (neutral), or an error that can't depend on the address. */
sealed class EmailRequest {
    data object Sent : EmailRequest()
    data class Problem(val error: ShownError) : EmailRequest()
}

object AuthEmails {
    private val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

    /** A missing or malformed address. */
    fun emailProblem(email: String): ShownError? {
        val e = email.trim()
        return if (e.isEmpty() || e.length > 320 || !EMAIL.matches(e)) ErrorCatalog.shown("DZ-E1070") else null
    }

    /**
     * Never tells whether an account exists: Auth's per-address limit and a failure while sending
     * happen only for real accounts, so they get the same neutral answer. Shown: a malformed
     * address, this phone's request limit, no connection.
     */
    fun outcome(failure: AuthAnswer?): EmailRequest {
        if (failure == null) return EmailRequest.Sent
        val code = failure.code.orEmpty()
        val said = failure.message.orEmpty().lowercase()
        return when {
            code == "email_address_invalid" || code == "validation_failed" -> EmailRequest.Problem(ErrorCatalog.shown("DZ-E1070"))
            code == "over_email_send_rate_limit" || "email rate limit" in said -> EmailRequest.Sent
            code == "over_request_rate_limit" || failure.status == 429 -> EmailRequest.Problem(ErrorCatalog.shown("DZ-E1008"))
            clientErrorCodeOf(said) == "DZ-E9002" -> EmailRequest.Problem(ErrorCatalog.shown("DZ-E9002"))
            else -> EmailRequest.Sent
        }
    }

    private fun clientErrorCodeOf(said: String): String? = when {
        "unable to resolve host" in said || "failed to connect" in said || "timeout" in said || "timed out" in said ||
            "connection reset" in said || "connection refused" in said || "network is unreachable" in said ||
            "no address associated" in said -> "DZ-E9002"
        else -> null
    }
}

/** "Send the link again": once a minute (Auth allows one confirmation email per minute per address). */
class ResendCooldown(private val seconds: Int = 60) {
    private var lastSentAtMs: Long? = null

    fun secondsLeft(nowMs: Long): Int {
        val last = lastSentAtMs ?: return 0
        val left = ((last + seconds * 1000L - nowMs) + 999) / 1000
        return left.coerceIn(0, seconds.toLong()).toInt()
    }

    fun canSend(nowMs: Long): Boolean = secondsLeft(nowMs) == 0

    fun sent(nowMs: Long) {
        lastSentAtMs = nowMs
    }
}

/** "Finish your profile" (a first Google sign-in): the same checks the database makes again. */
object FinishProfile {
    fun problem(name: String, adult: Boolean, termsAccepted: Boolean): ShownError? {
        val n = name.trim()
        return when {
            n.isEmpty() || n.length > 80 -> ErrorCatalog.shown("DZ-E1080")
            !adult -> ErrorCatalog.shown("DZ-E1079")
            !termsAccepted -> ErrorCatalog.shown("DZ-E1081")
            else -> null
        }
    }

    /** Google's name (full_name, else name), to prefill the field; at most 80 characters. */
    fun suggestedName(fullName: String?, name: String?): String =
        listOf(fullName, name).firstOrNull { !it.isNullOrBlank() }?.trim()?.take(80).orEmpty()

    /** True while the profile isn't finished (profile_completed_at is empty). */
    fun needed(profileCompletedAt: String?): Boolean = profileCompletedAt.isNullOrBlank()
}
