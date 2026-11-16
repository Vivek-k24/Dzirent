package com.dzirent.shared.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import com.stripe.android.paymentsheet.rememberPaymentSheet

/**
 * C5: the Stripe Android SDK's PaymentSheet (com.stripe:paymentsheet, pinned in
 * gradle/libs.versions.toml). The publishable key comes from stripe-pay with the client secret,
 * so no build setting holds it. Wallet buttons stay off; cards (and Link) only.
 */
@Composable
actual fun rememberPaymentSheetLauncher(onOutcome: (PaymentSheetOutcome) -> Unit): PaymentSheetLauncher {
    val context = LocalContext.current.applicationContext
    val sheet = rememberPaymentSheet { result: PaymentSheetResult ->
        onOutcome(
            when (result) {
                is PaymentSheetResult.Completed -> PaymentSheetOutcome.Completed
                is PaymentSheetResult.Canceled -> PaymentSheetOutcome.Canceled
                is PaymentSheetResult.Failed -> PaymentSheetOutcome.Failed("DZ-E4050")
            }
        )
    }
    return remember(sheet) {
        object : PaymentSheetLauncher {
            override val available: Boolean = true

            override fun present(publishableKey: String, clientSecret: String) {
                PaymentConfiguration.init(context, publishableKey)
                sheet.presentWithPaymentIntent(
                    clientSecret,
                    PaymentSheet.Configuration(merchantDisplayName = "Dzirent", allowsDelayedPaymentMethods = false)
                )
            }
        }
    }
}
