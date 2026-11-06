package com.dzirent.shared.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Android lists these with AboutLibraries (collected at build time there); iOS lists the main libraries. */
private val IOS_LIBRARIES = listOf(
    "Kotlin and kotlinx (coroutines, serialization, datetime)" to "Apache License 2.0",
    "Compose Multiplatform" to "Apache License 2.0",
    "AndroidX Navigation and Lifecycle (multiplatform)" to "Apache License 2.0",
    "supabase-kt" to "MIT License",
    "Ktor" to "Apache License 2.0",
    "Coil" to "Apache License 2.0"
)

@Composable
actual fun LicensesList(modifier: Modifier) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(IOS_LIBRARIES) { (name, license) ->
            Column {
                Text(name, style = MaterialTheme.typography.bodyLarge)
                Text(license, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
