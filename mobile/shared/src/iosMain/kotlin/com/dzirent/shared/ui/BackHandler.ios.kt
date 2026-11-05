package com.dzirent.shared.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.ObjCAction
import kotlinx.cinterop.useContents
import platform.Foundation.NSSelectorFromString
import platform.UIKit.UIGestureRecognizer
import platform.UIKit.UIGestureRecognizerDelegateProtocol
import platform.UIKit.UIGestureRecognizerStateEnded
import platform.UIKit.UIRectEdgeLeft
import platform.UIKit.UIScreenEdgePanGestureRecognizer
import platform.UIKit.UIView
import platform.darwin.NSObject

/**
 * iOS has no Back button, so a swipe from the left screen edge stands in for Android's Back.
 * Like Android's OnBackPressedDispatcher, the most recently added enabled handler gets it.
 */
internal object IosBackDispatcher {
    class Callback {
        var enabled = false
        var onBack: () -> Unit = {}
    }

    private val callbacks = mutableListOf<Callback>()

    fun add(callback: Callback) {
        callbacks += callback
    }

    fun remove(callback: Callback) {
        callbacks -= callback
    }

    /** False on a root screen: the swipe then does nothing at all. */
    val canGoBack: Boolean get() = callbacks.any { it.enabled }

    fun goBack() {
        callbacks.lastOrNull { it.enabled }?.onBack?.invoke()
    }
}

@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {
    val currentOnBack by rememberUpdatedState(onBack)
    val callback = remember { IosBackDispatcher.Callback() }
    SideEffect {
        callback.enabled = enabled
        callback.onBack = { currentOnBack() }
    }
    DisposableEffect(callback) {
        IosBackDispatcher.add(callback)
        onDispose { IosBackDispatcher.remove(callback) }
    }
}

/** Back pops the navigation stack while there's an earlier screen, as Android's NavHost does. */
@Composable
actual fun PlatformNavigationBackHandler(navController: NavHostController) {
    val entry by navController.currentBackStackEntryAsState()
    val canPop = entry != null && navController.previousBackStackEntry != null
    PlatformBackHandler(enabled = canPop) { navController.popBackStack() }
}

/** Adds the left-edge swipe to [view]; call the returned function to remove it. */
@OptIn(ExperimentalForeignApi::class)
internal fun installEdgeSwipeBack(view: UIView): () -> Unit {
    val target = EdgeSwipeTarget()
    val recognizer = UIScreenEdgePanGestureRecognizer(target = target, action = NSSelectorFromString("handleSwipe:"))
    recognizer.edges = UIRectEdgeLeft
    recognizer.delegate = target
    view.addGestureRecognizer(recognizer)
    return {
        view.removeGestureRecognizer(recognizer)
        // Keeps the target (the recognizer holds it weakly) alive until removal.
        target.hashCode()
    }
}

private class EdgeSwipeTarget : NSObject(), UIGestureRecognizerDelegateProtocol {
    @OptIn(BetaInteropApi::class, ExperimentalForeignApi::class)
    @ObjCAction
    fun handleSwipe(recognizer: UIScreenEdgePanGestureRecognizer) {
        if (recognizer.state != UIGestureRecognizerStateEnded) return
        val view = recognizer.view ?: return
        val distance = recognizer.translationInView(view).useContents { x }
        val speed = recognizer.velocityInView(view).useContents { x }
        // A deliberate swipe: far enough, or a quick flick to the right.
        if (distance > MIN_DISTANCE || (distance > MIN_FLICK_DISTANCE && speed > MIN_FLICK_SPEED)) {
            IosBackDispatcher.goBack()
        }
    }

    override fun gestureRecognizerShouldBegin(gestureRecognizer: UIGestureRecognizer): Boolean =
        IosBackDispatcher.canGoBack
}

// Points and points per second (an Objective-C subclass can't have a companion with fields).
private const val MIN_DISTANCE = 80.0
private const val MIN_FLICK_DISTANCE = 24.0
private const val MIN_FLICK_SPEED = 500.0
