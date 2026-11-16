package com.dzirent.shared.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.RentalSettings
import com.dzirent.shared.model.RentalView
import com.dzirent.shared.util.DateRange
import com.dzirent.shared.util.DepositStatus
import com.dzirent.shared.util.ErrorCatalog
import com.dzirent.shared.util.MIN_CONDITION_PHOTOS
import com.dzirent.shared.util.PaymentFacts
import com.dzirent.shared.util.PaymentStatus
import com.dzirent.shared.util.RentalAction
import com.dzirent.shared.util.RentalStatus
import com.dzirent.shared.util.claimAmountProblem
import com.dzirent.shared.util.claimLine
import com.dzirent.shared.util.claimPhotosProblem
import com.dzirent.shared.util.claimReasonProblem
import com.dzirent.shared.util.conditionPhotoStage
import com.dzirent.shared.util.daysAndTotal
import com.dzirent.shared.util.depositLine
import com.dzirent.shared.util.formatDateRange
import com.dzirent.shared.util.formatMessageTime
import com.dzirent.shared.util.formatMoney
import com.dzirent.shared.util.isRentableDay
import com.dzirent.shared.util.nowInstant
import com.dzirent.shared.util.parseTimestamp
import com.dzirent.shared.util.payLabel
import com.dzirent.shared.util.rentalActions
import com.dzirent.shared.util.rentalDatesProblem
import com.dzirent.shared.util.rentalEventLabel
import com.dzirent.shared.util.rentalReceipt
import com.dzirent.shared.util.rentalStatusLabel
import com.dzirent.shared.util.today
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime

/** "Nov 5 - Nov 8 · 4 days · $220" for a rental with its price snapshot. */
fun rentalSummaryLine(rental: RentalView): String = listOfNotNull(
    formatDateRange(rental.startDate, rental.endDate),
    rental.pricePerDay?.let { price -> rental.dates?.let { daysAndTotal(price, it) } }
).joinToString(" · ")

/** C5: the payment side of [this] as the actions need it. */
fun RentalView.paymentFacts(now: Instant = nowInstant()): PaymentFacts = PaymentFacts(
    paymentsOn = paymentsEnabled,
    paymentStatus = paymentStatus,
    depositAmount = depositAmount,
    depositStatus = depositStatus,
    claimWindowOpen = status == RentalStatus.RETURNED && (parseTimestamp(claimWindowEndsAt)?.let { it > now } ?: false),
    claimStatus = claim?.status
)

/** C5: the actions for this person, payments included. */
fun RentalView.actions(now: Instant = nowInstant()): List<RentalAction> = rentalActions(status, iAmLender, paymentFacts(now))

/**
 * C5: the payment lines under the summary: the payment deadline, the lender's set-up notice
 * (DZ-W4001), the deposit (amount and "held, not charged"), the claim window's end, the claim and
 * any refund. Empty while the rental has nothing to do with payments.
 */
fun rentalPaymentLines(rental: RentalView, now: Instant = nowInstant()): List<String> = buildList {
    val lender = rental.iAmLender
    if (rental.status == RentalStatus.REQUESTED && rental.paymentsEnabled && lender && !rental.lenderCanTakePayment) {
        add(ErrorCatalog.shown("DZ-W4001").text)
    }
    if (rental.status == RentalStatus.AWAITING_PAYMENT && rental.paymentsEnabled) {
        val due = rental.paymentDueAt?.let { formatMessageTime(it, now) }?.ifBlank { null }
        add(
            if (lender) "The renter has ${due?.let { "until $it" } ?: "a limited time"} to pay. Unpaid, it's cancelled automatically."
            else "${payLabel(rental.total)}${due?.let { " by $it" } ?: ""} to keep these dates. Unpaid, it's cancelled automatically."
        )
        if (!lender && !rental.lenderCanTakePayment) add("The lender is still setting up payouts. You can pay once they're ready.")
    }
    if (rental.paymentStatus != PaymentStatus.NONE || rental.depositStatus != DepositStatus.NONE || rental.paymentsEnabled) {
        depositLine(rental.depositAmount, rental.depositStatus, rental.depositCapturedAmount)?.let { add(it) }
    }
    if (rental.status == RentalStatus.RETURNED) {
        parseTimestamp(rental.claimWindowEndsAt)?.takeIf { it > now }?.let {
            val until = formatMessageTime(rental.claimWindowEndsAt, now)
            add(
                if (lender) "You can file a claim against the deposit until $until. Without one the hold is released."
                else "The lender can file a claim against the deposit until $until. Without one the hold is released."
            )
        }
    }
    claimLine(rental.claim?.status, rental.claim?.amount, rental.claim?.decisionAmount, lender)?.let { add(it) }
    rental.refundAmount?.takeIf { it > 0.0 }?.let { add("Refunded ${formatMoney(it)}") }
}

/**
 * The rental card in a chat (C3): state, dates and total, the actions for this person, the
 * condition photos and a short timeline. [photoLinks] maps storage paths to signed links.
 * C5: the payment lines and actions, and the server's request answer time ([settings]).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RentalCard(
    rental: RentalView,
    photoLinks: Map<String, String>,
    busy: Boolean,
    onAction: (RentalAction) -> Unit,
    modifier: Modifier = Modifier,
    settings: RentalSettings? = null
) {
    val otherName = rental.otherName?.ifBlank { null } ?: "the other person"
    var showAllSteps by remember(rental.id) { mutableStateOf(false) }
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.EventAvailable, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = rentalStatusLabel(rental.status, rental.iAmLender, settings?.rentalRequestHours),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.asHeading()
                )
            }
            Text(rentalSummaryLine(rental), style = MaterialTheme.typography.bodyMedium)
            rentalPaymentLines(rental).forEach { line ->
                Text(line, style = MaterialTheme.typography.bodyMedium)
            }

            // Condition photos, pickup then return.
            for (stage in listOf("pickup", "return")) {
                val photos = rental.photos.filter { it.stage == stage }
                if (photos.isEmpty()) continue
                Text(
                    text = if (stage == "pickup") "At pickup (${photos.size})" else "At return (${photos.size})",
                    style = MaterialTheme.typography.labelLarge
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.horizontalScroll(rememberScrollState())
                ) {
                    photos.forEach { photo ->
                        ListingPhoto(
                            url = photoLinks[photo.storagePath],
                            contentDescription = "${if (stage == "pickup") "Pickup" else "Return"} photo by ${if (photo.by == "you") "you" else otherName}",
                            modifier = Modifier.size(64.dp).clip(RoundedCornerShape(8.dp))
                        )
                    }
                }
            }
            conditionPhotoStage(rental.status)?.let { stage ->
                if (rental.iAmLender) {
                    val mine = rental.photos.count { it.stage == stage && it.by == "you" }
                    if (mine < MIN_CONDITION_PHOTOS) {
                        Text(
                            text = "Add at least $MIN_CONDITION_PHOTOS photos of the piece before marking it ${if (stage == "pickup") "picked up" else "returned"} ($mine so far).",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }

            // The timeline: the latest three steps, or all of them.
            val steps = if (showAllSteps) rental.events else rental.events.takeLast(3)
            steps.forEach { event ->
                Text(
                    text = rentalEventLabel(event.to, event.by, otherName) + " · " + formatMessageTime(event.at) +
                        (event.note?.let { " · “$it”" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
            if (rental.events.size > 3) {
                TextButton(onClick = { showAllSteps = !showAllSteps }, contentPadding = PaddingValues(0.dp)) {
                    Text(if (showAllSteps) "Show fewer steps" else "Show all ${rental.events.size} steps")
                }
            }

            val actions = rental.actions()
            if (actions.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    actions.forEach { action ->
                        val primary = action in setOf(
                            RentalAction.ACCEPT, RentalAction.MARK_PICKED_UP, RentalAction.MARK_RETURNED, RentalAction.COMPLETE,
                            RentalAction.PAY, RentalAction.PLACE_HOLD, RentalAction.ACCEPT_CLAIM
                        )
                        val label = if (action == RentalAction.PAY) payLabel(rental.total) else action.label
                        if (primary) {
                            Button(onClick = { onAction(action) }, enabled = !busy) { Text(label) }
                        } else {
                            OutlinedButton(onClick = { onAction(action) }, enabled = !busy) { Text(label) }
                        }
                    }
                }
            }
        }
    }
}

/**
 * "Request to rent": a date range limited to the listing's open days (inside its availability,
 * or any day when it has none; not booked; today or later), with the total ("5 days · $75")
 * before sending.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RentalRequestDialog(
    pricePerDay: Double?,
    windows: List<DateRange>,
    booked: List<DateRange>,
    initial: DateRange?,
    onDismiss: () -> Unit,
    onConfirm: (DateRange) -> Unit
) {
    val todayDate = remember { today() }
    val start = initial?.takeIf { rentalDatesProblem(it, windows, booked, todayDate) == null }
    val state = rememberDateRangePickerState(
        initialSelectedStartDateMillis = start?.start?.utcMillis(),
        initialSelectedEndDateMillis = start?.end?.utcMillis(),
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long) =
                isRentableDay(utcTimeMillis.toUtcDate(), windows, booked, todayDate)
            override fun isSelectableYear(year: Int) = year >= todayDate.year
        }
    )
    val picked = state.selectedStartDateMillis?.let { s ->
        val first = s.toUtcDate()
        DateRange(first, state.selectedEndDateMillis?.toUtcDate() ?: first)
    }
    val problem = picked?.let { rentalDatesProblem(it, windows, booked, todayDate) }

    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = { picked?.let(onConfirm) }, enabled = picked != null && problem == null) { Text("Send request") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    ) {
        Column(modifier = Modifier.weight(1f)) {
            DateRangePicker(
                state = state,
                title = { Text("Request to rent", modifier = Modifier.padding(start = 24.dp, end = 12.dp, top = 16.dp).asHeading()) },
                headline = {
                    Text(
                        text = when {
                            picked == null -> "Pick the first and last day"
                            problem != null -> ErrorCatalog.shown(problem).text
                            pricePerDay != null -> daysAndTotal(pricePerDay, picked)
                            else -> picked.format()
                        },
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(start = 24.dp, end = 12.dp, bottom = 8.dp).announced()
                    )
                },
                showModeToggle = false,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

/** Cancelling asks for an optional reason; the other person sees it in the timeline. */
@Composable
fun CancelRentalDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var reason by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cancel this rental?", modifier = Modifier.asHeading()) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("The other person sees that it was cancelled, and your reason if you give one.")
                OutlinedTextField(
                    value = reason,
                    onValueChange = { if (it.length <= 300) reason = it },
                    label = { Text("Reason (optional)") },
                    maxLines = 3
                )
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(reason.trim()) }) { Text("Cancel rental") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Keep it") } }
    )
}

/**
 * C5: before Stripe's sheet opens, what paying means: the amount, that the card is kept by the
 * payment processor for the deposit hold and a decided claim, and that Dzirent never sees it.
 */
@Composable
fun PayDialog(rental: RentalView, onDismiss: () -> Unit, onContinue: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(payLabel(rental.total), modifier = Modifier.asHeading()) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(rentalSummaryLine(rental))
                Text("You pay in our payment processor's own form. Dzirent never sees your card number.")
                if ((rental.depositAmount ?: 0.0) > 0.0) {
                    Text(
                        "Your card is kept with the processor so the ${formatMoney(rental.depositAmount!!)} deposit can be held " +
                            "(not charged) at pickup, and so a claim Dzirent decides can be charged to it, never more than the deposit."
                    )
                } else {
                    Text("Your card is kept with the processor for this rental, for example if a refund is due.")
                }
            }
        },
        confirmButton = { TextButton(onClick = onContinue) { Text("Continue to payment") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now") } }
    )
}

/**
 * C5: the lender's claim against the deposit: an amount up to the deposit, a reason, and the
 * return photos chosen as evidence. The checks are the database's (file_claim).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ClaimDialog(
    rental: RentalView,
    photoLinks: Map<String, String>,
    onDismiss: () -> Unit,
    onConfirm: (amount: Double, reason: String, photos: List<String>) -> Unit
) {
    var amount by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    val returnPhotos = rental.photos.filter { it.stage == "return" }
    var chosen by remember { mutableStateOf(returnPhotos.map { it.storagePath }.toSet()) }
    val deposit = rental.depositAmount
    val amountProblem = amount.takeIf { it.isNotBlank() }?.let { claimAmountProblem(it, deposit) }
    val problem = claimAmountProblem(amount, deposit) ?: claimReasonProblem(reason) ?: claimPhotosProblem(chosen.size)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("File a claim", modifier = Modifier.asHeading()) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Claim up to the deposit (${deposit?.let { formatMoney(it) } ?: "none"}). The renter can accept or dispute it; Dzirent decides a dispute.")
                OutlinedTextField(
                    value = amount,
                    onValueChange = { if (it.length <= 10) amount = it },
                    label = { Text("Amount ($)") },
                    singleLine = true,
                    isError = amountProblem != null,
                    supportingText = amountProblem?.let { { Text(ErrorCatalog.shown(it).text, modifier = Modifier.announced()) } }
                )
                OutlinedTextField(
                    value = reason,
                    onValueChange = { if (it.length <= 500) reason = it },
                    label = { Text("What's damaged or missing") },
                    supportingText = { Text("${reason.trim().length}/500") },
                    minLines = 2,
                    maxLines = 4
                )
                Text("Return photos as evidence (${chosen.size} chosen)", style = MaterialTheme.typography.labelLarge)
                if (returnPhotos.isEmpty()) {
                    Text(ErrorCatalog.shown("DZ-E4043").text, style = MaterialTheme.typography.bodySmall)
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    returnPhotos.forEachIndexed { i, photo ->
                        val on = photo.storagePath in chosen
                        FilterChip(
                            selected = on,
                            onClick = { chosen = if (on) chosen - photo.storagePath else chosen + photo.storagePath },
                            label = { Text("Photo ${i + 1}") },
                            leadingIcon = {
                                ListPhotoThumb(photoLinks[photo.storagePath], "Return photo ${i + 1}")
                            }
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val value = amount.trim().removePrefix("$").replace(",", "").toDoubleOrNull()
                    if (problem == null && value != null) onConfirm(value, reason.trim(), chosen.toList())
                },
                enabled = problem == null
            ) { Text("File claim") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun ListPhotoThumb(url: String?, description: String) {
    ListingPhoto(url = url, contentDescription = description, modifier = Modifier.size(28.dp).clip(RoundedCornerShape(4.dp)))
}

/** C5: the renter accepts (the amount is charged from the deposit) or disputes a claim, with an optional note. */
@Composable
fun ClaimAnswerDialog(accept: Boolean, amount: Double, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (accept) "Accept the claim?" else "Dispute the claim?", modifier = Modifier.asHeading()) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (accept) "${formatMoney(amount)} is charged from your deposit and the rest of the hold is released."
                    else "Dzirent looks at both sides, the photos and the timeline, and decides. You both see the outcome."
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { if (it.length <= 300) note = it },
                    label = { Text("Note (optional)") },
                    maxLines = 3
                )
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(note.trim()) }) { Text(if (accept) "Accept" else "Dispute") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now") } }
    )
}

/** C5: a simple receipt for a paid rental that ended: price, days, fee, refund, deposit, dates. */
@Composable
fun ReceiptDialog(rental: RentalView, onDismiss: () -> Unit) {
    val lines = rentalReceipt(
        iAmLender = rental.iAmLender,
        pricePerDay = rental.pricePerDay,
        days = rental.days,
        total = rental.total,
        tax = rental.taxAmount,
        fee = rental.feeAmount,
        refund = rental.refundAmount,
        depositAmount = rental.depositAmount,
        depositStatus = rental.depositStatus,
        depositCaptured = rental.depositCapturedAmount
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Receipt", modifier = Modifier.asHeading()) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(rental.listingTitle ?: "Rental", fontWeight = FontWeight.Bold)
                formatDateRange(rental.startDate, rental.endDate)?.let { Text(it) }
                lines.forEach { line ->
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text(line.label, modifier = Modifier.weight(1f))
                        Text(line.amount, fontWeight = if (line == lines.last()) FontWeight.Bold else FontWeight.Normal)
                    }
                }
                (rental.completedAt ?: rental.cancelledAt)?.let {
                    Text(
                        "${if (rental.completedAt != null) "Completed" else "Cancelled"} ${formatMessageTime(it)}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                Text(
                    "With ${rental.otherName ?: "the other person"}. Card details stay with the payment processor.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

private fun Long.toUtcDate(): LocalDate = Instant.fromEpochMilliseconds(this).toLocalDateTime(TimeZone.UTC).date

private fun LocalDate.utcMillis(): Long = atStartOfDayIn(TimeZone.UTC).toEpochMilliseconds()
