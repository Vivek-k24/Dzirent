package com.dzirent.shared

import com.dzirent.shared.util.AuthAnswer
import com.dzirent.shared.util.AuthCallback
import com.dzirent.shared.util.AuthDeepLink
import com.dzirent.shared.util.AuthEmails
import com.dzirent.shared.util.AuthLinks
import com.dzirent.shared.util.EmailRequest
import com.dzirent.shared.util.FinishProfile
import com.dzirent.shared.util.ResendCooldown
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** E1: Google's return link, "Forgot password?", "Send the link again" and "Finish your profile". */
class AuthFlowsTest {
    @Test
    fun googleReturnLinkIsRecognizedAndItsCodeRead() {
        assertEquals("dzirent://auth/callback", AuthLinks.CALLBACK)
        assertTrue(AuthDeepLink.isOurs("dzirent://auth/callback?code=4f7a9c2e-1b3d"))
        assertTrue(AuthDeepLink.isOurs("dzirent://auth/callback/"))
        assertFalse(AuthDeepLink.isOurs("https://dzirent.com/listing/abc"))
        assertFalse(AuthDeepLink.isOurs("dzirent://other/callback?code=x"))
        assertFalse(AuthDeepLink.isOurs("evil://auth/callback?code=4f7a9c2e"))
        assertFalse(AuthDeepLink.isOurs(null))
        assertEquals(AuthCallback.Code("4f7a9c2e-1b3d"), AuthDeepLink.parse("dzirent://auth/callback?code=4f7a9c2e-1b3d"))
        // Another link (a shared listing) isn't sign-in.
        assertEquals(AuthCallback.NotOurs, AuthDeepLink.parse("https://dzirent.com/studio/maya"))
    }

    @Test
    fun googleRefusalsAndBrokenLinksShowTheirCodes() {
        val cancelled = AuthDeepLink.parse("dzirent://auth/callback?error=access_denied&error_description=The+user+denied")
        assertIs<AuthCallback.Failed>(cancelled)
        assertEquals("DZ-E7022", cancelled.error.code)
        // Auth may put the error in the fragment.
        val failed = AuthDeepLink.parse("dzirent://auth/callback#error=server_error&error_description=Unable%20to%20exchange")
        assertIs<AuthCallback.Failed>(failed)
        assertEquals("DZ-E7020", failed.error.code)
        val noCode = AuthDeepLink.parse("dzirent://auth/callback")
        assertIs<AuthCallback.Failed>(noCode)
        assertEquals("DZ-E7020", noCode.error.code)
        assertIs<AuthCallback.Failed>(AuthDeepLink.parse("dzirent://auth/callback?code=has%20space"))
    }

    @Test
    fun emailLinksOpenTheWebsitesPages() {
        assertTrue(AuthLinks.resetPage.startsWith("https://"))
        assertTrue(AuthLinks.resetPage.endsWith("/auth/reset"))
        assertTrue(AuthLinks.confirmPage.endsWith("/auth/callback"))
    }

    @Test
    fun forgotPasswordIsNeutralWhateverTheAddress() {
        assertEquals("DZ-E1070", AuthEmails.emailProblem("")?.code)
        assertEquals("DZ-E1070", AuthEmails.emailProblem("jordan")?.code)
        assertNull(AuthEmails.emailProblem("jordan@example.com"))
        // Sent, unknown address (Auth answers the same), Auth's per-address limit, a failure while
        // sending: all the neutral answer.
        assertEquals(EmailRequest.Sent, AuthEmails.outcome(null))
        assertEquals(EmailRequest.Sent, AuthEmails.outcome(AuthAnswer("over_email_send_rate_limit", 429, "email rate limit exceeded")))
        assertEquals(EmailRequest.Sent, AuthEmails.outcome(AuthAnswer("unexpected_failure", 500, "Error sending recovery email")))
        // Not about the address: shown.
        val limited = AuthEmails.outcome(AuthAnswer("over_request_rate_limit", 429, "Request rate limit reached"))
        assertIs<EmailRequest.Problem>(limited)
        assertEquals("DZ-E1008", limited.error.code)
        val offline = AuthEmails.outcome(AuthAnswer(null, null, "Unable to resolve host \"x.supabase.co\""))
        assertIs<EmailRequest.Problem>(offline)
        assertEquals("DZ-E9002", offline.error.code)
        val invalid = AuthEmails.outcome(AuthAnswer("email_address_invalid", 400, "Email address is invalid"))
        assertIs<EmailRequest.Problem>(invalid)
        assertEquals("DZ-E1070", invalid.error.code)
    }

    @Test
    fun resendWaitsAMinute() {
        val cooldown = ResendCooldown()
        val t0 = 1_800_000_000_000L
        assertTrue(cooldown.canSend(t0))
        cooldown.sent(t0)
        assertEquals(60, cooldown.secondsLeft(t0))
        assertEquals(1, cooldown.secondsLeft(t0 + 59_500))
        assertFalse(cooldown.canSend(t0 + 59_999))
        assertTrue(cooldown.canSend(t0 + 60_000))
    }

    @Test
    fun finishProfileRules() {
        assertTrue(FinishProfile.needed(null))
        assertFalse(FinishProfile.needed("2026-11-20T10:00:00Z"))
        // A row without the field (a database before the E1 migration) never shows the step.
        assertFalse(FinishProfile.needed(com.dzirent.shared.model.Profile(id = "u1").profileCompletedAt))
        val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; coerceInputValues = true }
        assertTrue(FinishProfile.needed(json.decodeFromString<com.dzirent.shared.model.Profile>("""{"id":"u1","profile_completed_at":null}""").profileCompletedAt))
        assertFalse(FinishProfile.needed(json.decodeFromString<com.dzirent.shared.model.Profile>("""{"id":"u1"}""").profileCompletedAt))
        assertEquals("DZ-E1080", FinishProfile.problem(" ", adult = true, termsAccepted = true)?.code)
        assertEquals("DZ-E1080", FinishProfile.problem("x".repeat(81), adult = true, termsAccepted = true)?.code)
        assertEquals("DZ-E1079", FinishProfile.problem("Jordan", adult = false, termsAccepted = true)?.code)
        assertEquals("DZ-E1081", FinishProfile.problem("Jordan", adult = true, termsAccepted = false)?.code)
        assertNull(FinishProfile.problem("Jordan", adult = true, termsAccepted = true))
        assertEquals("Jordan Bell", FinishProfile.suggestedName("Jordan Bell", "J"))
        assertEquals("Jordan", FinishProfile.suggestedName(null, " Jordan "))
        assertEquals("", FinishProfile.suggestedName(null, null))
    }
}
