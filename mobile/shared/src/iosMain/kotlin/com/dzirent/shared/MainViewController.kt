package com.dzirent.shared

import androidx.compose.ui.window.ComposeUIViewController
import com.dzirent.shared.ui.DzirentApp
import platform.UIKit.UIViewController

fun MainViewController(): UIViewController = ComposeUIViewController {
    DzirentApp()
}

