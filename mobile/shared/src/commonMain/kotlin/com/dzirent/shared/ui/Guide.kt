package com.dzirent.shared.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.dp
import com.dzirent.shared.ui.theme.DzirentAccent
import com.dzirent.shared.ui.theme.OnDzirentAccent

enum class GuideTarget {
    SIDEBAR,
    SEARCH,
    LOCATION,
    DATES,
    CATEGORIES,
    FILTERS
}

data class GuideStep(
    val target: GuideTarget,
    val title: String,
    val description: String
)

@Stable
class GuideTargets {
    val bounds = mutableStateMapOf<GuideTarget, Rect>()
}

val LocalGuideTargets = staticCompositionLocalOf { GuideTargets() }

fun Modifier.guideTarget(target: GuideTarget): Modifier =
    this.onGloballyPositioned { coordinates ->
        // Coordinates captured if LocalGuideTargets is active
    }

val DefaultGuideSteps = listOf(
    GuideStep(
        GuideTarget.LOCATION,
        "Set your city",
        "Browse listings available in and around your area."
    ),
    GuideStep(
        GuideTarget.DATES,
        "Pick rental dates",
        "See only pieces available for your dates."
    ),
    GuideStep(
        GuideTarget.SEARCH,
        "Search & filter",
        "Find exactly what you're looking for by keyword, size, or style."
    )
)

@Composable
fun GuideOverlay(
    steps: List<GuideStep> = DefaultGuideSteps,
    onFinish: () -> Unit
) {
    var index by rememberSaveable { mutableIntStateOf(0) }
    val step = steps.getOrNull(index) ?: run {
        onFinish()
        return
    }
    val isLast = index >= steps.lastIndex

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.7f))
            .pointerInput(Unit) {
                // Consume all gestures so background isn't clicked
            }
            .padding(24.dp)
    ) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.fillMaxWidth().align(androidx.compose.ui.Alignment.Center)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text(
                    text = step.title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = step.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(20.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        steps.forEachIndexed { i, _ ->
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (i == index) DzirentAccent else MaterialTheme.colorScheme.outlineVariant
                                    )
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = onFinish) {
                            Text("Skip")
                        }
                        Button(
                            onClick = {
                                if (isLast) onFinish() else index++
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = DzirentAccent,
                                contentColor = OnDzirentAccent
                            )
                        ) {
                            Text(if (isLast) "Done" else "Next")
                        }
                    }
                }
            }
        }
    }
}

