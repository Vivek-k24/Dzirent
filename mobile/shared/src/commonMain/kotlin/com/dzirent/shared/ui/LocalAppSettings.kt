package com.dzirent.shared.ui

import com.dzirent.shared.util.*
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * The device settings (units, defaults), provided once at the top so any screen that
 * shows a distance or a measurement can read them. They rarely change.
 */
val LocalAppSettings = staticCompositionLocalOf { AppSettings() }

