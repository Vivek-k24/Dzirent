package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.*
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch

private const val MEASUREMENTS_PRIVACY_NOTE =
    "We only use your measurements to make your search easier and show pieces likely to fit " +
        "you. They're private, so no one else can see them. If you're a lender, your listings " +
        "only show the garment's measurements, never your body measurements."

private const val STYLES_PRIVACY_NOTE =
    "Private. Only used to suggest pieces you might like; we never hide anything based on it."

private const val HOW_TO_MEASURE =
    "Use a soft tape measure over light clothing. Stand straight, breathe normally, and keep " +
        "the tape level and snug but not tight. Ask a friend for shoulder and inseam."

/** Profile > My measurements: optional body measurements, visible only to me. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BodyMeasurementsScreen(
    repository: DzirentRepository,
    onBack: () -> Unit
) {
    var loadState by remember { mutableStateOf<UiState<PrivateProfile>>(UiState.Loading) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            loadState = UiState.Loading
            loadState = try {
                UiState.Success(repository.getPrivateProfile())
            } catch (e: Exception) {
                UiState.Error(e.userMessage("Couldn't load your measurements. Please try again."))
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("My measurements") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        when (val state = loadState) {
            is UiState.Loading -> LoadingView(message = "Loading your measurements...")
            is UiState.Error -> ErrorView(message = state.message, onRetry = { load() })
            is UiState.Success -> MeasurementsForm(
                repository = repository,
                saved = state.data,
                onSaved = onBack
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun MeasurementsForm(
    repository: DzirentRepository,
    saved: PrivateProfile,
    onSaved: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val settings = LocalAppSettings.current
    var unit by rememberSaveable { mutableStateOf(settings.measureUnit.key) }
    var fit by rememberSaveable { mutableStateOf(saved.fit) }
    var styles by rememberSaveable { mutableStateOf(saved.styleInterests.filter { it in FashionStyles.ALL }) }
    val texts = remember {
        mutableStateMapOf<BodyMeasurement, String>().apply {
            BodyMeasurement.entries.forEach { m ->
                put(m, cmToBodyInput(saved.bodyCm(m), unit))
            }
        }
    }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun setUnit(newUnit: String) {
        if (newUnit == unit) return
        BodyMeasurement.entries.forEach { m ->
            val cm = bodyInputToCm(texts[m].orEmpty(), unit)
            texts[m] = cmToBodyInput(cm, newUnit)
        }
        unit = newUnit
    }

    fun save() {
        scope.launch {
            isSaving = true
            error = null
            try {
                val parsed = BodyMeasurement.entries.associateWith { m ->
                    val text = texts[m].orEmpty()
                    if (text.isBlank()) null else bodyInputToCm(text, unit)
                }
                val bad = parsed.filterValues { it != null && !isValidBodyCm(it) }
                if (bad.isNotEmpty()) {
                    error = "Measurements must be between 1 and 299 cm (up to 118 in)."
                    isSaving = false
                    return@launch
                }
                repository.saveBodyMeasurements(parsed, fit, styles)
                onSaved()
            } catch (e: Exception) {
                error = e.userMessage("Couldn't save your measurements. Please try again.")
            }
            isSaving = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "Units",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            val units = listOf("in", "cm")
            SingleChoiceSegmentedButtonRow {
                units.forEachIndexed { index, option ->
                    SegmentedButton(
                        selected = unit == option,
                        onClick = { setUnit(option) },
                        shape = SegmentedButtonDefaults.itemShape(index = index, count = units.size)
                    ) { Text(if (option == "in") "Inches" else "Centimeters") }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "I'm a",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(null, FitProfile.WOMAN, FitProfile.MAN).forEach { option ->
                FilterChip(
                    selected = fit == option,
                    onClick = { fit = option },
                    label = { Text(option?.label ?: "Not specified") }
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Body measurements",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = HOW_TO_MEASURE,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(12.dp))

        BodyMeasurement.entries.forEach { m ->
            OutlinedTextField(
                value = texts[m].orEmpty(),
                onValueChange = { texts[m] = it },
                label = { Text(m.labelFor(fit)) },
                supportingText = { Text(m.howTo) },
                suffix = { Text(unit) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Styles you're interested in",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = STYLES_PRIVACY_NOTE,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FashionStyles.ALL.forEach { style ->
                FilterChip(
                    selected = style in styles,
                    onClick = {
                        styles = if (style in styles) styles - style else styles + style
                    },
                    label = { Text(style) }
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = MEASUREMENTS_PRIVACY_NOTE,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        error?.let {
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = { save() },
            enabled = !isSaving,
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) {
            Text(if (isSaving) "Saving..." else "Save measurements")
        }
        Spacer(modifier = Modifier.height(16.dp))
    }
}

