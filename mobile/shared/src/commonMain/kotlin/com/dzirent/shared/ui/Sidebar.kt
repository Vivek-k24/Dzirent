package com.dzirent.shared.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.Categories
import com.dzirent.shared.model.Profile
import com.dzirent.shared.ui.theme.DzirentAccent

/**
 * The navigation drawer: profile / guest header, Settings, "All categories" with the Filter button
 * and the category list. Picking a category filters Home in one tap.
 */
@Composable
fun SidebarContent(
    profile: Profile?,
    isGuest: Boolean,
    selectedCategory: String?,
    onOpenProfile: () -> Unit,
    onOpenSettings: () -> Unit,
    onSelectCategory: (String?) -> Unit,
    onOpenFilter: () -> Unit,
    onSignIn: () -> Unit = {}
) {
    ModalDrawerSheet {
        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
            if (!isGuest && profile != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onOpenProfile)
                        .padding(horizontal = 24.dp, vertical = 20.dp)
                ) {
                    Avatar(name = profile.displayName, size = 48.dp)
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = profile.displayName.ifBlank { "Your profile" },
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = profile.city.ifBlank { "No city set" },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onSignIn)
                        .padding(horizontal = 24.dp, vertical = 20.dp)
                ) {
                    Avatar(name = "?", size = 48.dp)
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Browse as guest",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Sign in or register",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Login,
                        contentDescription = "Sign in",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }

            if (!isGuest && profile != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onOpenSettings)
                        .padding(horizontal = 24.dp, vertical = 14.dp)
                ) {
                    Icon(Icons.Default.Settings, contentDescription = null)
                    Spacer(modifier = Modifier.width(16.dp))
                    Text("Settings", style = MaterialTheme.typography.bodyLarge)
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), thickness = 0.5.dp)

            // Heading and the Filter button share a line.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(start = 24.dp, end = 12.dp)
            ) {
                CategoryText(
                    text = "All categories",
                    selected = selectedCategory == null,
                    heading = true,
                    onClick = { onSelectCategory(null) },
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onOpenFilter) {
                    Icon(Icons.Default.Tune, contentDescription = "Filter")
                }
            }
            Categories.ALL.forEach { category ->
                CategoryText(
                    text = category,
                    selected = selectedCategory == category,
                    heading = false,
                    onClick = { onSelectCategory(category) },
                    modifier = Modifier.padding(horizontal = 24.dp)
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun CategoryText(
    text: String,
    selected: Boolean,
    heading: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.fillMaxWidth()
    ) {
        Text(
            text = text,
            style = if (heading) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge,
            fontWeight = if (selected) FontWeight.Bold else if (heading) FontWeight.Medium else FontWeight.Normal,
            color = if (selected) DzirentAccent else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(vertical = 12.dp)
        )
    }
}

