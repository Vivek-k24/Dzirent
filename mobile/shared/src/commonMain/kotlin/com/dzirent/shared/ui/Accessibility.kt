package com.dzirent.shared.ui

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics

// P4B accessibility helpers, shared by Android (TalkBack) and iPhone (VoiceOver).

/** Screen titles, dialog titles and section headers: screen readers can jump between headings. */
fun Modifier.asHeading(): Modifier = semantics { heading() }

/**
 * Text the screen reader reads out when it appears or changes, without the user moving to it:
 * error messages and progress such as "Checking your photos...".
 */
fun Modifier.announced(): Modifier = semantics { liveRegion = LiveRegionMode.Polite }
