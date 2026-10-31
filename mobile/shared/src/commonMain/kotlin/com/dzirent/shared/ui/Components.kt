package com.dzirent.shared.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checkroom
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Spa
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.dzirent.shared.config.SupabaseBuildConfig
import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.ui.theme.DzirentAccent
import com.dzirent.shared.ui.theme.DzirentLogoMark

/**
 * User-safe error message display.
 */
fun Throwable.userMessage(fallback: String = "Something went wrong. Please try again."): String =
    if (this is DzirentException) message ?: fallback else fallback

/** Initials for avatar circle ("JD" for "John Doe", "J" for "John", "?" for blank). */
fun initialsOf(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(1).uppercase()
        else -> (parts.first().take(1) + parts.last().take(1)).uppercase()
    }
}

/** Round avatar with the person's initials. */
@Composable
fun Avatar(name: String, size: Dp, modifier: Modifier = Modifier) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Text(
            text = initialsOf(name),
            style = if (size >= 56.dp) MaterialTheme.typography.titleLarge else MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

/** Tab row whose active-tab underline is the accent color. */
@Composable
fun DzirentTabRow(selectedTabIndex: Int, tabs: @Composable () -> Unit) {
    TabRow(
        selectedTabIndex = selectedTabIndex,
        indicator = { positions ->
            if (selectedTabIndex < positions.size) {
                TabRowDefaults.SecondaryIndicator(
                    modifier = Modifier.tabIndicatorOffset(positions[selectedTabIndex]),
                    color = DzirentAccent
                )
            }
        },
        tabs = tabs
    )
}

/** Small accent dot for unread notifications / inbox activity. */
@Composable
fun AccentDot(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(DzirentAccent)
    )
}

/**
 * Builds public storage URL for a listing photo path.
 */
fun listingPhotoUrl(storagePath: String?): String? {
    if (storagePath.isNullOrBlank()) return null
    if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) return storagePath
    val cleanPath = storagePath.trimStart('/')
    val baseUrl = SupabaseBuildConfig.SUPABASE_URL.trimEnd('/')
    return "$baseUrl/storage/v1/object/public/listing-photos/$cleanPath"
}

/**
 * A listing photo that loads via Coil 3 from a public storage URL.
 * Shows plain gray while loading, on error, or if null.
 */
@Composable
fun ListingPhoto(url: String?, contentDescription: String?, modifier: Modifier = Modifier) {
    val gray = MaterialTheme.colorScheme.surfaceVariant
    val resolvedUrl = listingPhotoUrl(url)
    if (resolvedUrl.isNullOrBlank()) {
        Box(modifier = modifier.background(gray))
    } else {
        AsyncImage(
            model = resolvedUrl,
            contentDescription = contentDescription,
            contentScale = ContentScale.Crop,
            placeholder = ColorPainter(gray),
            error = ColorPainter(gray),
            modifier = modifier.background(gray)
        )
    }
}

/** Shown wherever a listing has no photos. */
@Composable
fun NoPhotoPlaceholder(
    modifier: Modifier = Modifier,
    compact: Boolean = false
) {
    Box(
        modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = Icons.Default.Checkroom,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(if (compact) 24.dp else 48.dp)
            )
            if (!compact) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "No photo",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
            }
        }
    }
}

@Composable
fun LoadingView(
    modifier: Modifier = Modifier,
    message: String = "Loading..."
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator()
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun ErrorView(
    modifier: Modifier = Modifier,
    message: String = "Something went wrong. Please try again.",
    onRetry: () -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(48.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Retry")
            }
        }
    }
}

@Composable
fun EmptyView(
    modifier: Modifier = Modifier,
    title: String = "No Data Available",
    description: String = "There is nothing to display here right now.",
    icon: ImageVector = Icons.Default.Inbox,
    onAction: (() -> Unit)? = null,
    actionLabel: String? = null
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outline,
                modifier = Modifier.size(64.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            if (onAction != null && actionLabel != null) {
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(onClick = onAction) {
                    Text(actionLabel)
                }
            }
        }
    }
}

/** Formats a price in USD: "$25" for whole dollars, "$25.50" otherwise. */
fun formatPrice(usd: Double): String {
    val roundedCents = (usd * 100.0 + 0.5).toLong()
    val dollars = roundedCents / 100
    val cents = roundedCents % 100
    return if (cents == 0L) {
        "$$dollars"
    } else {
        "$$dollars.${cents.toString().padStart(2, '0')}"
    }
}

/**
 * Formats a distance in whole miles:
 * Requirement 5: "Distance: show 'under 1 mi' when the distance is 0."
 */
fun formatDistance(miles: Int?): String? {
    if (miles == null) return null
    return when {
        miles <= 0 -> "under 1 mi"
        miles == 1 -> "1 mi"
        else -> "$miles mi"
    }
}

/**
 * Listing card subtitle: "$price · distance". Never "free".
 */
fun cardSubtitle(price: Double?, distance: Int?): String {
    val priceStr = price?.takeIf { it > 0 }?.let { formatPrice(it) }
    val distStr = distance?.let { formatDistance(it) }
    return when {
        priceStr != null && distStr != null -> "$priceStr · $distStr"
        priceStr != null -> priceStr
        distStr != null -> distStr
        else -> ""
    }
}

/**
 * Dzirent Flower Logo Mark.
 */
@Composable
fun LogoMark(
    modifier: Modifier = Modifier,
    tint: Color = DzirentLogoMark
) {
    Icon(
        imageVector = Icons.Default.Spa,
        contentDescription = null,
        tint = tint,
        modifier = modifier
    )
}

/**
 * Dzirent Wordmark.
 */
@Composable
fun LogoWordmark(
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.onBackground
) {
    Text(
        text = "DZIRENT",
        style = MaterialTheme.typography.titleMedium.copy(
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp,
            fontFamily = FontFamily.SansSerif
        ),
        color = color,
        modifier = modifier
    )
}

