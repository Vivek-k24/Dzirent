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
import com.dzirent.shared.model.RentalView
import com.dzirent.shared.util.DateRange
import com.dzirent.shared.util.ErrorCatalog
import com.dzirent.shared.util.MIN_CONDITION_PHOTOS
import com.dzirent.shared.util.RentalAction
import com.dzirent.shared.util.conditionPhotoStage
import com.dzirent.shared.util.daysAndTotal
import com.dzirent.shared.util.formatDateRange
import com.dzirent.shared.util.formatMessageTime
import com.dzirent.shared.util.isRentableDay
import com.dzirent.shared.util.rentalActions
import com.dzirent.shared.util.rentalDatesProblem
import com.dzirent.shared.util.rentalEventLabel
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

/**
 * The rental card in a chat (C3): state, dates and total, the actions for this person, the
 * condition photos and a short timeline. [photoLinks] maps storage paths to signed links.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RentalCard(
    rental: RentalView,
    photoLinks: Map<String, String>,
    busy: Boolean,
    onAction: (RentalAction) -> Unit,
    modifier: Modifier = Modifier
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
                    text = rentalStatusLabel(rental.status, rental.iAmLender),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.asHeading()
                )
            }
            Text(rentalSummaryLine(rental), style = MaterialTheme.typography.bodyMedium)

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

            val actions = rentalActions(rental.status, rental.iAmLender)
            if (actions.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    actions.forEach { action ->
                        val primary = action in setOf(RentalAction.ACCEPT, RentalAction.MARK_PICKED_UP, RentalAction.MARK_RETURNED, RentalAction.COMPLETE)
                        if (primary) {
                            Button(onClick = { onAction(action) }, enabled = !busy) { Text(action.label) }
                        } else {
                            OutlinedButton(onClick = { onAction(action) }, enabled = !busy) { Text(action.label) }
                        }
                    }
                }
            }
        }
    }
}

/**
 * "Request to rent": a date range limited to the listing's open days (inside its availability,
 * not booked, today or later), with the total ("5 days · $75") before sending.
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
                            windows.isEmpty() -> "This piece has no open dates yet."
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

private fun Long.toUtcDate(): LocalDate = Instant.fromEpochMilliseconds(this).toLocalDateTime(TimeZone.UTC).date

private fun LocalDate.utcMillis(): Long = atStartOfDayIn(TimeZone.UTC).toEpochMilliseconds()
