package com.dzirent.shared.platform

import com.dzirent.shared.util.AppSettings
import com.dzirent.shared.util.DistanceUnit
import com.dzirent.shared.util.MeasureUnit
import com.dzirent.shared.util.ThemeMode
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

