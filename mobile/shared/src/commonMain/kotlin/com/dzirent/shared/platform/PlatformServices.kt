package com.dzirent.shared.platform

import kotlinx.coroutines.flow.Flow

/** Approximate place with rounded coordinates and city label. */
data class ApproxPlace(
    val lat: Double,
    val lng: Double,
    val city: String?
)

/** Device location service. */
interface LocationService {
    fun hasPermission(): Boolean
    suspend fun currentPlace(): ApproxPlace?
    suspend fun cityFor(lat: Double, lng: Double): String?
}

/** Theme mode option. */
enum class ThemeMode(val key: String, val label: String) {
    SYSTEM("system", "System"),
    LIGHT("light", "Light"),
    DARK("dark", "Dark");

    fun isDark(systemDark: Boolean): Boolean = when (this) {
        SYSTEM -> systemDark
        LIGHT -> false
        DARK -> true
    }

    companion object {
        fun fromKey(key: String?): ThemeMode = entries.firstOrNull { it.key == key } ?: SYSTEM
    }
}

/** Distance unit preference. */
enum class DistanceUnit(val key: String, val label: String, val stepOptions: List<Int>) {
    MILES("miles", "Miles", listOf(5, 10, 25, 50)),
    KILOMETERS("km", "Kilometers", listOf(5, 10, 25, 50, 100));

    companion object {
        fun fromKey(key: String?): DistanceUnit = entries.firstOrNull { it.key == key } ?: MILES
    }
}

/** Measurement unit preference. */
enum class MeasureUnit(val key: String, val label: String) {
    INCHES("in", "Inches"),
    CENTIMETERS("cm", "Centimeters");

    companion object {
        fun fromKey(key: String?): MeasureUnit = entries.firstOrNull { it.key == key } ?: INCHES
    }
}

/** Settings saved on the device. */
data class AppSettings(
    val theme: ThemeMode = ThemeMode.SYSTEM,
    val distanceUnit: DistanceUnit = DistanceUnit.MILES,
    val measureUnit: MeasureUnit = MeasureUnit.INCHES,
    val rentalDays: Int = 5,
    val defaultDistanceStep: Int = 25
)

/** Local device settings storage. */
interface SettingsStorage {
    val settings: Flow<AppSettings>
    suspend fun setTheme(mode: ThemeMode)
    suspend fun setDistanceUnit(unit: DistanceUnit)
    suspend fun setMeasureUnit(unit: MeasureUnit)
    suspend fun setRentalDays(days: Int)
    suspend fun setDefaultDistanceStep(step: Int)
}

/** System photo picker. */
interface PhotoPicker {
    suspend fun pickPhotos(maxItems: Int): List<ByteArray>
}

/** System camera service. */
interface CameraService {
    fun hasCameraPermission(): Boolean
    suspend fun capturePhoto(): ByteArray?
}

/** On-device image compression and EXIF rotation. */
interface ImageCompressor {
    suspend fun compressImage(imageBytes: ByteArray, maxDimension: Int = 1600, quality: Int = 80): ByteArray?
}

