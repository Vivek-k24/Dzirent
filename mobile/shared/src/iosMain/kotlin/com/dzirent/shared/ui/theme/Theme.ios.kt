package com.dzirent.shared.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import com.dzirent.shared.util.ThemeMode
import kotlinx.coroutines.delay
import platform.UIKit.UIUserInterfaceStyle
import platform.UIKit.UIViewController

/** On iOS the status bar follows the window's appearance instead: see [StatusBarFollowsTheme]. */
@Composable
actual fun SystemBarIcons(darkTheme: Boolean) = Unit

/**
 * Status bar icons follow the in-app theme: dark icons in Light, light icons in Dark. The app sits
 * inside SwiftUI's hosting controller, which ignores a child's status bar style, so this sets the
 * window's appearance; the status bar (and system sheets such as the photo picker) follow it.
 * System leaves the window unspecified, so it keeps following the phone's own setting.
 */
@Composable
fun StatusBarFollowsTheme(theme: ThemeMode, viewController: UIViewController) {
    LaunchedEffect(theme, viewController) {
        val style = when (theme) {
            ThemeMode.LIGHT -> UIUserInterfaceStyle.UIUserInterfaceStyleLight
            ThemeMode.DARK -> UIUserInterfaceStyle.UIUserInterfaceStyleDark
            ThemeMode.SYSTEM -> UIUserInterfaceStyle.UIUserInterfaceStyleUnspecified
        }
        // The view joins its window just after the first frame.
        var window = viewController.view.window
        while (window == null) {
            delay(16)
            window = viewController.view.window
        }
        window.overrideUserInterfaceStyle = style
        window.rootViewController?.setNeedsStatusBarAppearanceUpdate()
    }
}
