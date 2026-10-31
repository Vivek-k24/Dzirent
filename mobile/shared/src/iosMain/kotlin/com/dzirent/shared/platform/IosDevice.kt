package com.dzirent.shared.platform

/** iOS comes in Step 5; these compile so the shared screens build for iOS. */
class IosDeviceServices : DeviceServices {
    override val prefs: KeyValueStore get() = TODO("iOS preferences not implemented yet")
    override val photoAnalyzer: PhotoAnalyzer get() = TODO("iOS photo checks not implemented yet")
    override val imageCompressor: ImageCompressor get() = IosImageCompressor()
    override val locationService: LocationService get() = IosLocationService()
    override val appVersion: String get() = TODO("iOS version not implemented yet")
    override val appBuild: Long get() = TODO("iOS build number not implemented yet")
    override fun photoStore(userId: String): PhotoStore = TODO("iOS photo store not implemented yet")
    override fun draftStore(userId: String, listingId: String?): DraftStore = TODO("iOS drafts not implemented yet")
    override suspend fun readPhoto(uri: String): ByteArray? = TODO("iOS photo reading not implemented yet")
    override fun clearCameraCache() = TODO("iOS camera not implemented yet")
    override fun toast(message: String) = TODO("iOS toast not implemented yet")
    override fun openUrl(url: String) = TODO("iOS links not implemented yet")
}
