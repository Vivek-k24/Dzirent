package com.dzirent.shared.platform

import com.dzirent.shared.util.AppSettings
import com.dzirent.shared.util.DistanceUnit
import com.dzirent.shared.util.MeasureUnit
import com.dzirent.shared.util.ThemeMode
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

/** iOS push (APNs through Firebase) comes with the iOS app. */
class IosPushService : PushService {
    override val platform: String get() = "ios"
    override val canAskPermission: Boolean get() = TODO("iOS push not implemented yet")
    override suspend fun token(): String? = TODO("iOS push not implemented yet")
    override suspend fun deleteToken() = TODO("iOS push not implemented yet")
    override fun canNotify(): Boolean = TODO("iOS push not implemented yet")
    override fun openNotificationSettings() = TODO("iOS push not implemented yet")
    override fun setSignedInUser(userId: String?) = TODO("iOS push not implemented yet")
    override fun chatShown(conversationId: String) = TODO("iOS push not implemented yet")
    override fun chatHidden(conversationId: String) = TODO("iOS push not implemented yet")
}

