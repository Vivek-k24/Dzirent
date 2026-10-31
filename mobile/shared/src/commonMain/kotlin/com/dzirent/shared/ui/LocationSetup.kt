package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.dzirent.shared.model.Profile
import com.dzirent.shared.model.UsCity
import com.dzirent.shared.platform.ApproxPlace
import com.dzirent.shared.platform.LocationService
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch

private enum class LocationStep { Reason, Working, PickCity, Confirm }

/**
 * Sets the user's approximate location. Shows the reason first, with an option to use
 * device location (if available) or pick a city from the US cities database.
 */
@Composable
fun LocationSetupDialog(
    repository: DzirentRepository,
    profile: Profile?,
    onDismiss: () -> Unit,
    onSaved: (Profile) -> Unit,
    onGuestLocationSet: ((city: String, lat: Double, lng: Double) -> Unit)? = null,
    locationService: LocationService? = null
) {
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(LocationStep.Reason) }
    var workingText by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var found by remember { mutableStateOf<ApproxPlace?>(null) }
    var pickedCity by remember { mutableStateOf<UsCity?>(null) }
    var isSaving by remember { mutableStateOf(false) }

    fun locate() {
        if (locationService == null) {
            step = LocationStep.PickCity
            return
        }
        scope.launch {
            message = null
            workingText = "Finding your approximate location..."
            step = LocationStep.Working
            val place = runCatching { locationService.currentPlace() }.getOrNull()
            when {
                place == null -> {
                    message = "Couldn't get your location. Choose your city instead."
                    step = LocationStep.PickCity
                }
                place.city == null -> {
                    message = "Couldn't tell which city you're in. Choose your city instead."
                    step = LocationStep.PickCity
                }
                else -> {
                    found = place
                    step = LocationStep.Confirm
                }
            }
        }
    }

    fun save(lat: Double, lng: Double, city: String) {
        scope.launch {
            isSaving = true
            message = null
            if (profile != null) {
                try {
                    val updated = repository.updateLocation(lat, lng, city)
                    onSaved(updated)
                } catch (e: Exception) {
                    message = e.userMessage("Couldn't save your location. Please try again.")
                }
            } else {
                onGuestLocationSet?.invoke(city, lat, lng)
                onDismiss()
            }
            isSaving = false
        }
    }

    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        properties = DialogProperties(dismissOnClickOutside = !isSaving),
        icon = { Icon(Icons.Default.LocationOn, contentDescription = null) },
        title = {
            Text(
                when (step) {
                    LocationStep.Reason -> "See what's near you"
                    LocationStep.Working -> "Location"
                    LocationStep.PickCity -> "Choose your city"
                    LocationStep.Confirm -> "Confirm location"
                }
            )
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                message?.let {
                    Text(
                        text = it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }
                when (step) {
                    LocationStep.Reason -> {
                        Text(
                            text = "Dzirent connects people to rent clothing locally. We use your approximate location to show you outfits within driving or pickup distance.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    LocationStep.Working -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(vertical = 16.dp)
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp))
                            Spacer(modifier = Modifier.width(16.dp))
                            Text(workingText, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    LocationStep.PickCity -> {
                        Text(
                            text = "Search for your city to browse closets nearby:",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        CityField(
                            repository = repository,
                            selected = pickedCity,
                            onSelected = { city ->
                                pickedCity = city
                                if (city != null) {
                                    save(city.lat, city.lng, city.label)
                                }
                            },
                            enabled = !isSaving
                        )
                    }
                    LocationStep.Confirm -> {
                        val place = found
                        if (place != null) {
                            Text(
                                text = "Is this your approximate area?",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = place.city ?: "Nearby",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            when (step) {
                LocationStep.Reason -> {
                    Column(horizontalAlignment = Alignment.End) {
                        Button(onClick = { locate() }) {
                            Text("Use my approximate location")
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(onClick = { step = LocationStep.PickCity }) {
                            Text("Choose city manually")
                        }
                    }
                }
                LocationStep.Working -> Unit
                LocationStep.PickCity -> {
                    TextButton(onClick = onDismiss, enabled = !isSaving) {
                        Text("Cancel")
                    }
                }
                LocationStep.Confirm -> {
                    val place = found
                    if (place != null) {
                        Button(
                            onClick = { save(place.lat, place.lng, place.city.orEmpty()) },
                            enabled = !isSaving
                        ) {
                            Text("Yes, use this")
                        }
                    }
                }
            }
        },
        dismissButton = {
            if (step == LocationStep.Reason) {
                TextButton(onClick = onDismiss) {
                    Text("Not now")
                }
            } else if (step == LocationStep.Confirm) {
                TextButton(onClick = { step = LocationStep.PickCity }, enabled = !isSaving) {
                    Text("Choose another city")
                }
            }
        }
    )
}

