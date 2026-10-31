package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.DateRange
import com.dzirent.shared.model.MEASUREMENT_LABEL_MAX
import com.dzirent.shared.model.MeasurementInput
import com.dzirent.shared.model.validateMeasurements
import kotlinx.datetime.LocalDate

data class MeasurementRow(
    val id: String,
    val label: String = "",
    val valueText: String = ""
) {
    fun toInput() = MeasurementInput(label, valueText)
}

enum class PhotoSlot(val key: String, val label: String, val required: Boolean) {
    FRONT("front", "Front", true),
    BACK("back", "Back", true),
    TAG("tag", "Tag / Brand", false),
    DETAIL("detail", "Detail", false),
    FLAW("flaw", "Flaw / Note", false);

    companion object {
        fun fromKey(key: String?): PhotoSlot = entries.firstOrNull { it.key == key } ?: FRONT
    }
}

data class EditorPhoto(
    val slot: PhotoSlot,
    val storagePath: String? = null,
    val localBytes: ByteArray? = null
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeasurementsSection(
    unit: String,
    onUnitChange: (String) -> Unit,
    rows: List<MeasurementRow>,
    onRowsChange: (List<MeasurementRow>) -> Unit,
    showAllErrors: Boolean
) {
    val errors = validateMeasurements(rows.map { it.toInput() })

    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = "Measurements", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                text = "Help renters find the right fit.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        val units = listOf("in", "cm")
        SingleChoiceSegmentedButtonRow {
            units.forEachIndexed { index, option ->
                SegmentedButton(
                    selected = unit == option,
                    onClick = { onUnitChange(option) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = units.size)
                ) { Text(option) }
            }
        }
    }
    Spacer(modifier = Modifier.height(12.dp))

    rows.forEachIndexed { index, row ->
        val error = errors.getOrNull(index)?.takeIf { showAllErrors || row.valueText.isNotBlank() }
        Row(
            verticalAlignment = Alignment.Top,
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
        ) {
            OutlinedTextField(
                value = row.label,
                onValueChange = { text ->
                    if (text.length <= MEASUREMENT_LABEL_MAX) {
                        onRowsChange(rows.map { if (it.id == row.id) it.copy(label = text) else it })
                    }
                },
                label = { Text("Label") },
                singleLine = true,
                isError = error != null,
                modifier = Modifier.weight(1.2f)
            )
            Spacer(modifier = Modifier.width(8.dp))
            OutlinedTextField(
                value = row.valueText,
                onValueChange = { text ->
                    onRowsChange(rows.map { if (it.id == row.id) it.copy(valueText = text) else it })
                },
                label = { Text("Value ($unit)") },
                singleLine = true,
                isError = error != null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(0.9f)
            )
            IconButton(
                onClick = { onRowsChange(rows.filterNot { it.id == row.id }) },
                modifier = Modifier.align(Alignment.CenterVertically)
            ) {
                Icon(Icons.Default.Close, contentDescription = "Remove")
            }
        }
        if (error != null) {
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(start = 8.dp, bottom = 4.dp)
            )
        }
    }

    TextButton(
        onClick = {
            onRowsChange(rows + MeasurementRow(id = "${rows.size}_${kotlin.random.Random.nextInt(10000)}"))
        }
    ) {
        Icon(Icons.Default.Add, contentDescription = null)
        Spacer(modifier = Modifier.width(4.dp))
        Text("Add measurement")
    }
}

@Composable
fun AvailabilitySection(
    ranges: List<DateRange>,
    onRangesChange: (List<DateRange>) -> Unit
) {
    Text(
        text = "Availability",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold
    )
    Text(
        text = "Dates this piece is available for rent.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(modifier = Modifier.height(8.dp))

    ranges.forEachIndexed { index, range ->
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
        ) {
            AssistChip(
                onClick = {},
                label = { Text("${range.start} – ${range.end}") },
                modifier = Modifier.weight(1f)
            )
            IconButton(onClick = { onRangesChange(ranges.filterIndexed { i, _ -> i != index }) }) {
                Icon(Icons.Default.Close, contentDescription = "Remove")
            }
        }
    }

    var startText by remember { mutableStateOf("") }
    var endText by remember { mutableStateOf("") }
    var addError by remember { mutableStateOf<String?>(null) }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
    ) {
        OutlinedTextField(
            value = startText,
            onValueChange = { startText = it; addError = null },
            label = { Text("Start (YYYY-MM-DD)") },
            singleLine = true,
            modifier = Modifier.weight(1f)
        )
        Spacer(modifier = Modifier.width(8.dp))
        OutlinedTextField(
            value = endText,
            onValueChange = { endText = it; addError = null },
            label = { Text("End (YYYY-MM-DD)") },
            singleLine = true,
            modifier = Modifier.weight(1f)
        )
        Spacer(modifier = Modifier.width(8.dp))
        IconButton(
            onClick = {
                try {
                    val s = LocalDate.parse(startText.trim())
                    val e = LocalDate.parse(endText.trim())
                    if (e >= s) {
                        onRangesChange(ranges + DateRange(s, e))
                        startText = ""
                        endText = ""
                        addError = null
                    } else {
                        addError = "End date must be after start date."
                    }
                } catch (_: Exception) {
                    addError = "Format: YYYY-MM-DD"
                }
            }
        ) {
            Icon(Icons.Default.Add, contentDescription = "Add date range")
        }
    }
    addError?.let {
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
}

