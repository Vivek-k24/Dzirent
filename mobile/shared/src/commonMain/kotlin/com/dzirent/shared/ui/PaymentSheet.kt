package com.dzirent.shared.ui

import androidx.compose.runtime.Composable

/**
 * C5: Stripe's own payment sheet. The card is typed into Stripe's form, never into Dzirent: the
 * app passes only the client secret (from stripe-pay) and the publishable key it came with.
 * Android uses the Stripe Android SDK's PaymentSheet; the iPhone sheet (Stripe iOS SDK) is for
 * the Mac session, so [PaymentSheetLauncher.available] is false there and Pay explains it.
 */
sealed interface PaymentSheetOutcome {
    /** Stripe accepted the payment; the webhook marks the rental paid a moment later. */
    data object Completed : PaymentSheetOutcome
    /** The person closed the sheet. */
    data object Canceled : PaymentSheetOutcome
    /** The payment didn't go through ([code] from the catalog, e.g. DZ-E4050 or DZ-E4049). */
    data class Failed(val code: String) : PaymentSheetOutcome
}

interface PaymentSheetLauncher {
    /** False where the app has no payment sheet yet (iPhone until the Mac session). */
    val available: Boolean

    /** Shows Stripe's sheet for [clientSecret]; the outcome arrives through the callback given to [rememberPaymentSheetLauncher]. */
    fun present(publishableKey: String, clientSecret: String)
}

@Composable
expect fun rememberPaymentSheetLauncher(onOutcome: (PaymentSheetOutcome) -> Unit): PaymentSheetLauncher
