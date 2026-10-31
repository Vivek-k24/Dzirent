package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.ListingCard
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.delay

data class SuggestionGroup(
    val reason: String,
    val listings: List<ListingCard>
)

/**
 * Rule-based suggestions when a search or filter has no results.
 * Strictly rule-based, no AI or paid LLM calls.
 */
@Composable
fun rememberSuggestions(
    repository: DzirentRepository,
    query: String,
    category: String?,
    lat: Double?,
    lng: Double?,
    active: Boolean
): List<SuggestionGroup>? {
    var groups by remember { mutableStateOf<List<SuggestionGroup>?>(null) }

    LaunchedEffect(active, query, category, lat, lng) {
        if (!active) {
            groups = null
            return@LaunchedEffect
        }
        groups = null
        delay(250) // Small debounce

        val resultGroups = mutableListOf<SuggestionGroup>()
        try {
            // 1. If category was filtered, try broader search in all categories
            if (!category.isNullOrBlank()) {
                val broader = repository.browseListings(
                    query = query.ifBlank { null },
                    lat = lat,
                    lng = lng,
                    limit = 6
                )
                if (broader.isNotEmpty()) {
                    resultGroups.add(SuggestionGroup("Available in all categories", broader))
                }
            }

            // 2. If nothing yet or query was specific, fetch popular/nearest pieces
            if (resultGroups.isEmpty() || resultGroups.sumOf { it.listings.size } < 6) {
                val nearby = repository.browseListings(
                    lat = lat,
                    lng = lng,
                    radiusMiles = 50.0,
                    limit = 8
                )
                val existingIds = resultGroups.flatMap { it.listings.map { l -> l.id } }.toSet()
                val fresh = nearby.filterNot { it.id in existingIds }
                if (fresh.isNotEmpty()) {
                    resultGroups.add(SuggestionGroup("Popular pieces near you", fresh))
                }
            }
        } catch (_: Exception) {}

        groups = resultGroups
    }

    return if (active) groups else null
}

fun LazyGridScope.suggestionItems(
    groups: List<SuggestionGroup>?,
    query: String,
    onOpenListing: (String) -> Unit
) {
    item(key = "no-results-header", span = { GridItemSpan(maxLineSpan) }) {
        Column(modifier = Modifier.padding(vertical = 12.dp)) {
            Text(
                text = if (query.isBlank()) "0 matching products" else "0 matching products for \"${query.trim()}\"",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "Suggested for you",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }
    }

    when {
        groups == null -> {
            item(key = "suggestions-loading", span = { GridItemSpan(maxLineSpan) }) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp))
            }
        }
        groups.isEmpty() -> {
            item(key = "suggestions-empty", span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = "Nothing near you yet. Try widening your distance or clearing filters.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 16.dp)
                )
            }
        }
        else -> {
            groups.forEach { group ->
                item(key = "group-${group.reason}", span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        text = group.reason,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
                    )
                }
                items(group.listings, key = { "suggested-${it.id}" }) { listing ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenListing(listing.id) }
                    ) {
                        ListingPhoto(
                            url = listing.coverPhotoPath,
                            contentDescription = listing.title,
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(3f / 4f)
                                .clip(RoundedCornerShape(8.dp))
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = listing.title,
                            style = MaterialTheme.typography.titleSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = cardSubtitle(listing.price, listing.distance),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1
                        )
                    }
                }
            }
        }
    }
}

