package com.dzirent.shared.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState

/**
 * C5: the iPhone has no payment sheet yet. The Mac session adds the Stripe iOS SDK's PaymentSheet
 * (Swift, called from here). Until then Pay says to pay on dzirent.com (DZ-E4049).
 */
@Composable
actual fun rememberPaymentSheetLauncher(onOutcome: (PaymentSheetOutcome) -> Unit): PaymentSheetLauncher {
    val callback = rememberUpdatedState(onOutcome)
    return remember {
        object : PaymentSheetLauncher {
            override val available: Boolean = false

            override fun present(publishableKey: String, clientSecret: String) {
                callback.value(PaymentSheetOutcome.Failed("DZ-E4049"))
            }
        }
    }
}
