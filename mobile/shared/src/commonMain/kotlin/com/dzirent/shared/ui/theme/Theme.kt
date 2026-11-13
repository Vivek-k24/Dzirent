package com.dzirent.shared.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Design: black, white and greys, plus ONE accent.
/** The accent in light mode (placeholder, owner to confirm). */
private val AccentOnLight = Color(0xFF8E1538)

/**
 * The same hue, lighter, for dark mode: #8E1538 is only 2.1:1 on the dark background.
 * This is 6.2:1 on the background, 5.2:1 on the drawer and 4.6:1 on grey chips, so accent text
 * passes 4.5:1 everywhere (P4B nudged it from #E8638A, which was 4.497:1 on the chips).
 */
private val AccentOnDark = Color(0xFFEA658C)

private val Ink = Color(0xFF111111)

private val LocalDarkTheme = staticCompositionLocalOf { false }

/**
 * The one accent for the current theme. Used only for: the active tab underline, the
 * center Search button, notification dots, the selected category and the fit row.
 */
val DzirentAccent: Color
    @Composable @ReadOnlyComposable get() = if (LocalDarkTheme.current) AccentOnDark else AccentOnLight

/** The logo's maroon (design/logo-source.png). */
private val LogoMaroon = Color(0xFFA80038)

/**
 * The flower mark's colour: the logo maroon, or the lighter accent in dark mode, where the
 * maroon would be too dark to read on the near-black background.
 */
val DzirentLogoMark: Color
    @Composable @ReadOnlyComposable get() = if (LocalDarkTheme.current) AccentOnDark else LogoMaroon

/** The green tick and accept buttons on photo checks and suggestions (AA on both backgrounds). */
val DzirentPass: Color
    @Composable @ReadOnlyComposable get() = if (LocalDarkTheme.current) Color(0xFF6FCF7F) else Color(0xFF1E7B34)

/** Photo warnings that can be accepted with "Use anyway". */
val DzirentWarn: Color
    @Composable @ReadOnlyComposable get() = if (LocalDarkTheme.current) Color(0xFFF2B84B) else Color(0xFF8A5300)

/** Icons and text drawn on the accent: white on the dark red, near-black on the light pink. */
val OnDzirentAccent: Color
    @Composable @ReadOnlyComposable get() = if (LocalDarkTheme.current) Ink else Color.White

private val Grey50 = Color(0xFFFAFAFA)
private val Grey100 = Color(0xFFF2F2F2)
private val Grey200 = Color(0xFFE6E6E6)
private val Grey400 = Color(0xFFA3A3A3)
private val Grey600 = Color(0xFF5E5E5E)
private val Grey800 = Color(0xFF2A2A2A)
private val Grey850 = Color(0xFF202020)
private val Grey900 = Color(0xFF171717)
private val Night = Color(0xFF0E0E0E)

// Borders of text fields and outlined buttons, and outline-tinted icons, need 3:1 (WCAG 1.4.11).
// Grey400 was 2.5:1 on white and Grey600 3.0:1 on the dark background. Dividers keep
// outlineVariant: they are decorative.
/** 3.4:1 on white, 3.0:1 on Grey100. */
private val OutlineLight = Color(0xFF8C8C8C)
/** 3.6:1 on Night, 3.3:1 on Grey900, 3.0:1 on Grey850. */
private val OutlineDark = Color(0xFF6A6A6A)

// Every surface container is set too: Material's defaults are tinted purple.
private val LightColorScheme = lightColorScheme(
    primary = Ink,
    onPrimary = Color.White,
    primaryContainer = Grey100,
    onPrimaryContainer = Ink,
    inversePrimary = Color.White,
    secondary = Grey600,
    onSecondary = Color.White,
    secondaryContainer = Grey200,
    onSecondaryContainer = Ink,
    tertiary = Grey600,
    onTertiary = Color.White,
    tertiaryContainer = Grey200,
    onTertiaryContainer = Ink,
    background = Color.White,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    surfaceVariant = Grey100,
    onSurfaceVariant = Grey600,
    surfaceTint = Color.Transparent,
    outline = OutlineLight,
    outlineVariant = Grey200,
    surfaceBright = Color.White,
    surfaceDim = Grey200,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Grey50,
    surfaceContainer = Grey50,
    surfaceContainerHigh = Grey100,
    surfaceContainerHighest = Grey200
)

private val DarkColorScheme = darkColorScheme(
    primary = Color.White,
    onPrimary = Ink,
    primaryContainer = Grey800,
    onPrimaryContainer = Color.White,
    inversePrimary = Ink,
    secondary = Grey400,
    onSecondary = Ink,
    secondaryContainer = Grey800,
    onSecondaryContainer = Color.White,
    tertiary = Grey400,
    onTertiary = Ink,
    tertiaryContainer = Grey800,
    onTertiaryContainer = Color.White,
    background = Night,
    onBackground = Color.White,
    surface = Night,
    onSurface = Color.White,
    surfaceVariant = Grey800,
    onSurfaceVariant = Grey400,
    surfaceTint = Color.Transparent,
    outline = OutlineDark,
    outlineVariant = Grey800,
    surfaceBright = Grey800,
    surfaceDim = Night,
    surfaceContainerLowest = Night,
    surfaceContainerLow = Grey900,
    surfaceContainer = Grey900,
    surfaceContainerHigh = Grey850,
    surfaceContainerHighest = Grey800
)

@Composable
fun DzirentTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    // Android 15+ draws the app behind transparent system bars, so the icons must contrast
    // with the app background. Older versions keep the theme's dark bars and light icons.
    SystemBarIcons(darkTheme)

    CompositionLocalProvider(LocalDarkTheme provides darkTheme) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography(),
            content = content
        )
    }
}

/**
 * Android 15+ draws the app behind transparent system bars, so the icons must contrast with
 * the app background. Older versions keep the theme's dark bars and light icons.
 */
@Composable
expect fun SystemBarIcons(darkTheme: Boolean)
