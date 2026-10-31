package com.dzirent.shared.ui

import androidx.compose.runtime.staticCompositionLocalOf
import com.dzirent.shared.platform.AppSettings

/**
 * The device settings (units, defaults), provided once at the top so any screen that
 * shows a distance or a measurement can read them. They rarely change.
 */
val LocalAppSettings = staticCompositionLocalOf { AppSettings() }

