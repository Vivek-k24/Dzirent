package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.*
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.launch

/** Profile > My studio (lenders): what the studio page shows. Everything is optional. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MyStudioScreen(
    repository: DzirentRepository,
    profile: Profile?,
    onBack: () -> Unit,
    onSaved: (Profile) -> Unit
) {
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf(profile?.studioName.orEmpty()) }
    var handle by rememberSaveable {
        mutableStateOf(profile?.studioHandle ?: suggestHandle(profile?.studioName ?: profile?.displayName.orEmpty()))
    }
    var bio by rememberSaveable { mutableStateOf(profile?.studioBio.orEmpty()) }
    var tags by rememberSaveable { mutableStateOf(profile?.styleTags.orEmpty()) }
    var pickup by rememberSaveable { mutableStateOf(profile?.pickupArea.orEmpty()) }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val handleError = handle.takeIf { it.isNotEmpty() && !isValidHandle(it) }?.let {
        "Use 3 to 30 letters, numbers, dots or underscores."
    }

    fun save() {
        if (handleError != null) return
        scope.launch {
            isSaving = true
            error = null
            try {
                val updated = repository.updateStudio(
                    name = name.trim().ifBlank { null },
                    handle = handle.trim().ifBlank { null },
                    bio = bio.trim().ifBlank { null },
                    styleTags = tags,
                    pickupArea = pickup.trim().ifBlank { null }
                )
                onSaved(updated)
            } catch (e: Exception) {
                error = e.userMessage("Couldn't save your studio. Please try again.")
            }
            isSaving = false
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("My studio") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 8.dp)
        ) {
            OutlinedTextField(
                value = name,
                onValueChange = { if (it.length <= STUDIO_NAME_MAX) name = it },
                label = { Text("Studio name") },
                placeholder = { Text(profile?.displayName.orEmpty().ifBlank { "My Studio" }) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = handle,
                onValueChange = { handle = cleanHandleInput(it) },
                label = { Text("Handle") },
                prefix = { Text("@") },
                supportingText = { Text(handleError ?: "Shown at the top of your studio page.") },
                isError = handleError != null,
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(4.dp))
            OutlinedTextField(
                value = bio,
                onValueChange = { if (it.length <= STUDIO_BIO_MAX) bio = it },
                label = { Text("Bio") },
                supportingText = { Text("${bio.length}/$STUDIO_BIO_MAX") },
                minLines = 2,
                maxLines = 4,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text("Style tags (up to $STYLE_TAGS_MAX)", style = MaterialTheme.typography.titleSmall)
            Spacer(modifier = Modifier.height(8.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StyleTags.ALL.forEach { tag ->
                    val selected = tag in tags
                    FilterChip(
                        selected = selected,
                        onClick = {
                            tags = if (selected) tags - tag
                            else if (tags.size < STYLE_TAGS_MAX) tags + tag
                            else tags
                        },
                        label = { Text(tag) }
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedTextField(
                value = pickup,
                onValueChange = { if (it.length <= PICKUP_AREA_MAX) pickup = it },
                label = { Text("Pickup area") },
                placeholder = { Text("e.g. South Congress, Austin") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            error?.let {
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = { save() },
                enabled = !isSaving && handleError == null,
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                Text(if (isSaving) "Saving..." else "Save studio")
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

