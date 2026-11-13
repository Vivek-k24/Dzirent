package com.dzirent.shared.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.dzirent.shared.data.PhotoItem
import com.dzirent.shared.platform.PhotoStore
import com.dzirent.shared.model.AccessoryTypes
import com.dzirent.shared.model.Categories
import com.dzirent.shared.ui.theme.DzirentPass
import com.dzirent.shared.ui.theme.DzirentWarn
import com.dzirent.shared.util.CHECKING_PHOTOS
import com.dzirent.shared.util.CHECK_FAILED_LINE
import com.dzirent.shared.util.CHOOSE_CATEGORY
import com.dzirent.shared.util.CheckBanner
import com.dzirent.shared.util.DESCRIPTION_TIP
import com.dzirent.shared.util.FashionStyles
import com.dzirent.shared.util.FieldOrigin
import com.dzirent.shared.util.MAX_PHOTOS
import com.dzirent.shared.util.PHOTOS_LOOK_GOOD
import com.dzirent.shared.util.PHOTO_TIP
import com.dzirent.shared.util.PhotoReview
import com.dzirent.shared.util.PhotoSlot
import com.dzirent.shared.util.PhotoVerdict
import com.dzirent.shared.util.REPLACE_PHOTOS
import com.dzirent.shared.util.REVIEW_LINE
import com.dzirent.shared.util.ReviewState
import com.dzirent.shared.util.SuggestField
import com.dzirent.shared.util.UPLOADING_PHOTOS
import com.dzirent.shared.util.assignSlots
import com.dzirent.shared.util.extraWarnings
import com.dzirent.shared.util.ErrorCatalog
import com.dzirent.shared.util.readyLine

/**
 * Step 1: the photo slots, with the phone's instant checks on each photo and, once the server
 * has checked them, its warnings too ([serverWarnings], by slot).
 *
 * The first time each source is used, a short explanation asks for consent (remembered in
 * [PhotoConsentStore]). The camera then needs the CAMERA runtime permission, since the app
 * declares it. The Photo Picker needs no storage permission, so the explanation is the only
 * consent step for the gallery (READ_MEDIA_IMAGES is deliberately not requested). Either way
 * the photo is copied into the app ([PhotoStore]) before anything reads it.
 */
@Composable
fun PhotosStep(
    state: ListingEditorState,
    photoStore: PhotoStore,
    serverWarnings: (PhotoSlot) -> List<String>,
    onMessage: (String) -> Unit
) {
    var targetKey by rememberSaveable { mutableStateOf<String?>(null) }
    var choosingSourceFor by remember { mutableStateOf<PhotoSlot?>(null) }
    val remaining = MAX_PHOTOS - state.slots.size

    fun add(uris: List<String>) {
        if (uris.isEmpty()) return
        val (slots, left) = assignSlots(state.slots.toMap(), uris.map { PhotoItem.New(it) }, PhotoSlot.fromKey(targetKey))
        targetKey = null
        state.slots.clear()
        state.slots.putAll(slots)
        state.photosChanged = true
        if (left > 0) onMessage("You can add up to $MAX_PHOTOS photos. Added the first ${uris.size - left}.")
    }

    // The consent questions, the camera permission and the system pickers are platform code.
    val start = rememberPhotoSources(photoStore = photoStore, maxPhotos = MAX_PHOTOS, onPhotos = { add(it) }, onMessage = onMessage)

    choosingSourceFor?.let { slot ->
        AlertDialog(
            onDismissRequest = { choosingSourceFor = null },
            title = { Text("Add the ${slot.label.lowercase()} photo", modifier = Modifier.asHeading()) },
            confirmButton = {
                TextButton(onClick = { choosingSourceFor = null; targetKey = slot.key; start(PhotoSource.Camera) }) { Text("Camera") }
            },
            dismissButton = {
                TextButton(onClick = { choosingSourceFor = null; targetKey = slot.key; start(PhotoSource.Gallery) }) { Text("Gallery") }
            }
        )
    }

    // ---- Photos ----
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text = "Photos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        Text(text = readyLine(state.verdicts), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
    }
    Text(text = PHOTO_TIP, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(modifier = Modifier.height(8.dp))

    PhotoSlot.entries.chunked(3).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            row.forEach { slot ->
                SlotTile(
                    slot = slot,
                    item = state.slots[slot],
                    review = state.reviewOf(slot),
                    serverWarnings = serverWarnings(slot),
                    onAdd = { choosingSourceFor = slot },
                    onRemove = { state.removePhoto(slot) },
                    onUseAnyway = {
                        state.slots[slot]?.let { item ->
                            state.reviews[item.key] = (state.reviews[item.key] ?: PhotoReview.Checking).copy(usedAnyway = true)
                        }
                    },
                    modifier = Modifier.weight(1f)
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
    }

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { targetKey = null; start(PhotoSource.Gallery) }, enabled = remaining > 0) {
            Icon(Icons.Default.PhotoLibrary, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Gallery")
        }
        OutlinedButton(onClick = { targetKey = null; start(PhotoSource.Camera) }, enabled = remaining > 0) {
            Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Camera")
        }
    }

}

/**
 * Step 2: title, category, description and style. Once the server has checked the photos, an
 * allowed piece fills the empty fields (each with ✕ to clear); typing is never blocked while
 * the check runs.
 */
@Composable
fun DetailsStep(state: ListingEditorState, onOpenDeclaration: () -> Unit) {
    val anySuggested = SuggestField.entries.any { state.field(it).origin == FieldOrigin.SUGGESTED }
    Text("Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    if (anySuggested) {
        Text(
            text = "Filled from your photos. Tap ✕ if anything's off.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
    Spacer(modifier = Modifier.height(8.dp))

    OutlinedTextField(
        value = state.title,
        onValueChange = { state.editTitle(it) },
        label = { Text("Title") },
        placeholder = { Text("e.g. Maroon lehenga") },
        isError = state.textErrors["title"] != null,
        supportingText = state.textErrors["title"]?.let { { Text(it, modifier = Modifier.announced()) } },
        singleLine = true,
        trailingIcon = clearIcon("title", state.title.text.isNotEmpty()) { state.clear(SuggestField.TITLE) },
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(modifier = Modifier.height(12.dp))

    CategoryPicker(
        selected = state.category,
        onSelected = { state.pickCategory(it) },
        onClear = { state.clear(SuggestField.CATEGORY) }
    )
    Spacer(modifier = Modifier.height(12.dp))
    if (state.isAccessory) {
        ItemTypePicker(selected = state.itemType, onSelected = { state.itemType = it })
        Spacer(modifier = Modifier.height(12.dp))
    }
    if (state.isAccessory || state.jewelrySuggested) {
        DeclarationStatusNote(onOpenDeclaration)
    }

    OutlinedTextField(
        value = state.description,
        onValueChange = { state.editDescription(it) },
        label = { Text("Description") },
        // The tip is a hint only; it's never part of the description.
        isError = state.textErrors["description"] != null,
        supportingText = {
            val refusal = state.textErrors["description"]
            if (refusal != null) Text(refusal)
            else Text(DESCRIPTION_TIP, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f))
        },
        minLines = 4,
        trailingIcon = clearIcon("description", state.description.text.isNotEmpty()) { state.clear(SuggestField.DESCRIPTION) },
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(modifier = Modifier.height(12.dp))

    StylePicker(
        selected = state.styles,
        onChange = { state.editStyles(it) },
        onClear = { state.clear(SuggestField.STYLE) }
    )
}

/** The ✕ that clears a filled field. */
private fun clearIcon(what: String, visible: Boolean, onClear: () -> Unit): (@Composable () -> Unit)? =
    if (!visible) null else {
        { IconButton(onClick = onClear) { Icon(Icons.Default.Close, contentDescription = "Clear $what") } }
    }

/**
 * One photo slot: "+ Front" when empty, the photo with ✕ and its check result when filled, then
 * any warning the server's check adds.
 */
@Composable
private fun SlotTile(
    slot: PhotoSlot,
    item: PhotoItem?,
    review: PhotoReview?,
    serverWarnings: List<String>,
    onAdd: () -> Unit,
    onRemove: () -> Unit,
    onUseAnyway: () -> Unit,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(8.dp)
    val name = slot.label + if (slot.required) "" else " (optional)"
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier) {
        if (item == null) {
            Surface(
                shape = shape,
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(shape)
                    .clickable(role = Role.Button, onClickLabel = "Add the ${slot.label.lowercase()} photo", onClick = onAdd)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(Icons.Default.AddAPhoto, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(slot.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (slot.required) {
                        Text("Required", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
            if (!slot.required) Text("Optional", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(shape)
                .then(if (review?.verdict == PhotoVerdict.BLOCKED) Modifier.border(2.dp, MaterialTheme.colorScheme.error, shape) else Modifier)
        ) {
            AsyncImage(
                model = when (item) {
                    is PhotoItem.Existing -> listingPhotoUrl(item.photo.storagePath)
                    is PhotoItem.New -> item.uri
                },
                contentDescription = "$name photo",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            Surface(
                color = MaterialTheme.colorScheme.primary,
                shape = RoundedCornerShape(bottomEnd = 8.dp),
                modifier = Modifier.align(Alignment.TopStart)
            ) {
                Text(
                    text = slot.label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
            // The same 32 dp circle in the corner as before, inside a 48 dp touch target that
            // reaches into the photo.
            Box(
                contentAlignment = Alignment.TopEnd,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(48.dp)
                    .clickable(role = Role.Button, onClick = onRemove)
                    .semantics { contentDescription = "Remove the ${slot.label.lowercase()} photo" }
            ) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.55f),
                    modifier = Modifier.padding(2.dp).size(32.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Close, contentDescription = null, tint = Color.White)
                    }
                }
            }
            if (review?.verdict == PhotoVerdict.CHECKING) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.matchParentSize().background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.35f))
                ) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        color = Color.White,
                        modifier = Modifier.size(24.dp).semantics { contentDescription = "Checking photo" }
                    )
                }
            }
        }
        review?.let { PhotoCheckResult(it, onUseAnyway) }
        extraWarnings(review?.messages.orEmpty(), serverWarnings).forEach { warning ->
            Text(text = ErrorCatalog.warningText(warning), style = MaterialTheme.typography.labelSmall, color = DzirentWarn, textAlign = TextAlign.Center)
        }
    }
}

/**
 * The server's photo check above the details: uploading, checking (typing goes on), looks good,
 * can't be listed (with the reason and a way to replace the photos), or someone will check.
 */
@Composable
fun PhotoCheckBanner(banner: CheckBanner?, onRetry: () -> Unit, onReplacePhotos: () -> Unit) {
    banner ?: return
    val error = banner is CheckBanner.Rejected || banner is CheckBanner.UploadFailed || banner is CheckBanner.Failed
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceVariant
        ),
        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
    ) {
        val text = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurfaceVariant
        Column(modifier = Modifier.padding(16.dp).announced()) {
            when (banner) {
                CheckBanner.Uploading, CheckBanner.Checking -> {
                    Text(if (banner == CheckBanner.Uploading) UPLOADING_PHOTOS else CHECKING_PHOTOS, color = text)
                    Spacer(modifier = Modifier.height(8.dp))
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
                CheckBanner.Allowed -> Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = DzirentPass, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(PHOTOS_LOOK_GOOD, color = text)
                }
                is CheckBanner.Review -> {
                    // The check's own reason (a hood, photo safety, a copied photo) when it gives one.
                    Text(banner.reason ?: REVIEW_LINE, color = text, fontWeight = FontWeight.Medium)
                }
                is CheckBanner.Rejected -> {
                    Text(banner.reason, color = text, fontWeight = FontWeight.Medium)
                    TextButton(onClick = onReplacePhotos, contentPadding = PaddingValues(horizontal = 0.dp)) { Text(REPLACE_PHOTOS) }
                }
                is CheckBanner.UploadFailed -> {
                    Text(banner.message, color = text)
                    TextButton(onClick = onRetry, contentPadding = PaddingValues(horizontal = 0.dp)) { Text("Try again") }
                }
                CheckBanner.Failed -> {
                    Text(CHECK_FAILED_LINE, color = text)
                    TextButton(onClick = onRetry, contentPadding = PaddingValues(horizontal = 0.dp)) { Text("Check again") }
                }
            }
        }
    }
}

/** Under a thumbnail: a green tick, or why the photo can't be used or needs "Use anyway". */
@Composable
private fun PhotoCheckResult(review: PhotoReview, onUseAnyway: () -> Unit) {
    // Saved photos were published before the checks; nothing to show for them.
    if (review.state == ReviewState.SAVED) return
    val color = when (review.verdict) {
        PhotoVerdict.BLOCKED -> MaterialTheme.colorScheme.error
        PhotoVerdict.WARNING -> DzirentWarn
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    when (review.verdict) {
        PhotoVerdict.CHECKING -> Unit
        PhotoVerdict.PASSED -> Icon(
            Icons.Default.CheckCircle,
            contentDescription = "Photo passed the checks",
            tint = DzirentPass,
            modifier = Modifier.size(20.dp)
        )
        else -> {
            review.messages.forEach { message ->
                Text(text = ErrorCatalog.warningText(message), style = MaterialTheme.typography.labelSmall, color = color, textAlign = TextAlign.Center)
            }
            when (review.verdict) {
                PhotoVerdict.WARNING -> TextButton(
                    onClick = onUseAnyway,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) { Text("Use anyway", style = MaterialTheme.typography.labelMedium) }
                PhotoVerdict.USED_ANYWAY -> Text(
                    text = "Used anyway",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = color
                )
                else -> Unit
            }
        }
    }
}

/** For accessories and jewelry: a reminder that the declaration is part of listing them. */
@Composable
private fun DeclarationStatusNote(onOpenDeclaration: () -> Unit) {
    TextButton(onClick = onOpenDeclaration, contentPadding = PaddingValues(horizontal = 4.dp)) {
        Icon(Icons.Default.Gavel, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text("Accessory declaration")
    }
    Spacer(modifier = Modifier.height(4.dp))
}

/** "Style": up to [FashionStyles.LISTING_MAX], only used to suggest the piece; ✕ clears it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StylePicker(selected: List<String>, onChange: (List<String>) -> Unit, onClear: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Style (optional)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                text = "Up to ${FashionStyles.LISTING_MAX}. Helps show your piece to people who like this style.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (selected.isNotEmpty()) {
            IconButton(onClick = onClear) { Icon(Icons.Default.Close, contentDescription = "Clear style") }
        }
    }
    Spacer(modifier = Modifier.height(8.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FashionStyles.ALL.forEach { style ->
            val isSelected = style in selected
            FilterChip(
                selected = isSelected,
                onClick = { onChange(if (isSelected) selected - style else selected + style) },
                enabled = isSelected || selected.size < FashionStyles.LISTING_MAX,
                label = { Text(style) }
            )
        }
    }
}

/** Category: blank until chosen ("Choose a category"), required; ✕ clears it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CategoryPicker(selected: String?, onSelected: (String) -> Unit, onClear: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = Modifier.weight(1f)) {
            OutlinedTextField(
                value = selected.orEmpty(),
                onValueChange = {},
                readOnly = true,
                label = { Text("Category") },
                placeholder = { Text(CHOOSE_CATEGORY) },
                supportingText = if (selected == null) {
                    { Text("Required") }
                } else null,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier
                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    .fillMaxWidth()
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                Categories.ALL.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option) },
                        onClick = {
                            onSelected(option)
                            expanded = false
                        }
                    )
                }
            }
        }
        if (selected != null) {
            IconButton(onClick = onClear) { Icon(Icons.Default.Close, contentDescription = "Clear category") }
        }
    }
}

/** Required "Item type" dropdown for Accessories (exactly [AccessoryTypes.ALL]). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ItemTypePicker(selected: String?, onSelected: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selected.orEmpty(),
            onValueChange = {},
            readOnly = true,
            label = { Text("Item type") },
            placeholder = { Text("Choose one") },
            supportingText = if (selected == null) {
                { Text("Required for Accessories.") }
            } else null,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            AccessoryTypes.ALL.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option) },
                    onClick = {
                        onSelected(option)
                        expanded = false
                    }
                )
            }
        }
    }
}
