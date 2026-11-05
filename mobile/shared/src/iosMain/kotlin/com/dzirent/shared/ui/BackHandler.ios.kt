package com.dzirent.shared.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import kotlin.math.abs

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

/**
 * The back swipe, on the app's root: a drag that starts within 24 pt of the left edge and moves
 * right goes Back once it's far enough (or flicked). It looks at touches before the screens do
 * (the Initial pass) and takes the drag once it's clearly a rightward swipe, so a photo pager
 * under the finger doesn't move too. Taps and vertical drags are left alone, and nothing happens
 * where there's nothing to go back to. Dialogs are separate layers, so it never acts under one.
 */
internal fun Modifier.edgeSwipeBack(): Modifier = pointerInput(Unit) {
    val edge = 24.dp.toPx()
    val minDistance = 80.dp.toPx()
    val flickDistance = 24.dp.toPx()
    val flickSpeed = 500.dp.toPx()
    val slop = viewConfiguration.touchSlop
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        if (down.position.x > edge || !IosBackDispatcher.canGoBack) return@awaitEachGesture
        val velocity = VelocityTracker()
        velocity.addPosition(down.uptimeMillis, down.position)
        var moved = Offset.Zero
        var claimed = false
        while (true) {
            val event = awaitPointerEvent(PointerEventPass.Initial)
            val change = event.changes.firstOrNull { it.id == down.id } ?: break
            velocity.addPosition(change.uptimeMillis, change.position)
            if (!change.pressed) {
                if (claimed) {
                    change.consume()
                    val speed = velocity.calculateVelocity().x
                    if (moved.x > minDistance || (moved.x > flickDistance && speed > flickSpeed)) {
                        IosBackDispatcher.goBack()
                    }
                }
                break
            }
            moved += change.positionChange()
            if (!claimed) {
                // Mostly vertical: a scroll, not a swipe.
                if (abs(moved.y) > slop && abs(moved.y) >= moved.x) break
                if (moved.x > slop && moved.x > abs(moved.y)) claimed = true
            }
            if (claimed) change.consume()
        }
    }
}

/** The Scaffold already padded for the status and home-indicator areas; inner top bars skip them. */
actual fun Modifier.consumeScaffoldInsets(padding: PaddingValues): Modifier = consumeWindowInsets(padding)
