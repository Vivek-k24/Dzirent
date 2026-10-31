package com.dzirent.shared.platform

import kotlinx.coroutines.flow.Flow

class IosLocationService : LocationService {
    override fun hasPermission(): Boolean = TODO("iOS location not implemented yet")
    override suspend fun currentPlace(): ApproxPlace? = TODO("iOS location not implemented yet")
    override suspend fun cityFor(lat: Double, lng: Double): String? = TODO("iOS location not implemented yet")
}

class IosSettingsStorage : SettingsStorage {
    override val settings: Flow<AppSettings> get() = TODO("iOS settings not implemented yet")
    override suspend fun setTheme(mode: ThemeMode) = TODO("iOS settings not implemented yet")
    override suspend fun setDistanceUnit(unit: DistanceUnit) = TODO("iOS settings not implemented yet")
    override suspend fun setMeasureUnit(unit: MeasureUnit) = TODO("iOS settings not implemented yet")
    override suspend fun setRentalDays(days: Int) = TODO("iOS settings not implemented yet")
    override suspend fun setDefaultDistanceStep(step: Int) = TODO("iOS settings not implemented yet")
}

class IosPhotoPicker : PhotoPicker {
    override suspend fun pickPhotos(maxItems: Int): List<ByteArray> = TODO("iOS photo picker not implemented yet")
}

class IosCameraService : CameraService {
    override fun hasCameraPermission(): Boolean = TODO("iOS camera not implemented yet")
    override suspend fun capturePhoto(): ByteArray? = TODO("iOS camera not implemented yet")
}

class IosImageCompressor : ImageCompressor {
    override suspend fun compressImage(imageBytes: ByteArray, maxDimension: Int, quality: Int): ByteArray? =
        TODO("iOS image compression not implemented yet")
}

