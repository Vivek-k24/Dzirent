package com.dzirent.shared

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.interop.LocalUIViewController
import androidx.compose.ui.window.ComposeUIViewController
import com.dzirent.shared.platform.IosDeviceServices
import com.dzirent.shared.platform.IosSettingsStorage
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.ui.DzirentApp
import com.dzirent.shared.ui.installEdgeSwipeBack
import com.dzirent.shared.ui.theme.StatusBarFollowsTheme
import platform.UIKit.UIViewController

/** The whole iPhone UI: the shared app, with the iOS phone services (as MainActivity does on Android). */
fun MainViewController(): UIViewController {
    val settingsStorage = IosSettingsStorage()
    val device = IosDeviceServices()
    return ComposeUIViewController {
        // Settings are read from NSUserDefaults up front, so the first frame has the right theme.
        val settings by settingsStorage.settings.collectAsState()
        val viewController = LocalUIViewController.current
        // Swipe from the left edge = Back (PlatformBackHandler and the navigation stack).
        DisposableEffect(viewController) {
            val remove = installEdgeSwipeBack(viewController.view)
            onDispose { remove() }
        }
        StatusBarFollowsTheme(settings.theme, viewController)
        CompositionLocalProvider(LocalDevice provides device) {
            DzirentApp(appSettings = settings, settingsStorage = settingsStorage)
        }
    }
}
