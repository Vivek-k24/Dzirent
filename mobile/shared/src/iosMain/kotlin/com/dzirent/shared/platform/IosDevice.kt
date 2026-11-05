@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.dzirent.shared.platform

import com.dzirent.shared.data.IosPhotoAnalyzer
import com.dzirent.shared.util.SavedDraft
import com.dzirent.shared.util.SearchRelated
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.useContents
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import platform.CoreGraphics.CGRectMake
import platform.Foundation.NSApplicationSupportDirectory
import platform.Foundation.NSBundle
import platform.Foundation.NSCachesDirectory
import platform.Foundation.NSData
import platform.Foundation.NSFileManager
import platform.Foundation.NSSearchPathForDirectoriesInDomains
import platform.Foundation.NSString
import platform.Foundation.NSURL
import platform.Foundation.NSUTF8StringEncoding
import platform.Foundation.NSUUID
import platform.Foundation.NSUserDefaults
import platform.Foundation.NSUserDomainMask
import platform.Foundation.create
import platform.Foundation.dataWithContentsOfFile
import platform.Foundation.stringWithContentsOfFile
import platform.Foundation.writeToFile
import platform.UIKit.NSTextAlignmentCenter
import platform.UIKit.UIApplication
import platform.UIKit.UIColor
import platform.UIKit.UIFont
import platform.UIKit.UILabel
import platform.UIKit.UIView
import platform.darwin.dispatch_async
import platform.darwin.dispatch_get_main_queue

class IosDeviceServices : DeviceServices {
    override val prefs: KeyValueStore = UserDefaultsStore(NSUserDefaults.standardUserDefaults)
    override val photoAnalyzer: PhotoAnalyzer by lazy { IosPhotoAnalyzer() }
    override val imageCompressor: ImageCompressor = IosImageCompressor()
    override val locationService: LocationService by lazy { IosLocationService() }

    // The same file Android ships (androidMain/assets), bundled by the Xcode project.
    override val searchRelated: SearchRelated by lazy {
        val path = NSBundle.mainBundle.pathForResource("search_related", ofType = "json")
        val text = path?.let { readText(it) }
        text?.let { runCatching { SearchRelated.parse(it) }.getOrNull() } ?: SearchRelated(emptyMap(), emptyMap())
    }
    override val push: PushService = IosPushService()

    private val info = NSBundle.mainBundle.infoDictionary
    override val appVersion: String = info?.get("CFBundleShortVersionString") as? String ?: ""
    override val appBuild: Long = (info?.get("CFBundleVersion") as? String)?.toLongOrNull() ?: 0L

    override fun photoStore(userId: String): PhotoStore = IosPhotoStore(userId)
    override fun draftStore(userId: String, listingId: String?): DraftStore = IosDraftStore(userId, listingId)

    override suspend fun readPhoto(uri: String): ByteArray? = withContext(Dispatchers.Default) {
        val path = NSURL.URLWithString(uri)?.path ?: return@withContext null
        NSData.dataWithContentsOfFile(path)?.toByteArray()
    }

    override fun clearCameraCache() {
        val dir = cameraDir()
        val files = NSFileManager.defaultManager.contentsOfDirectoryAtPath(dir, error = null).orEmpty()
        files.forEach { NSFileManager.defaultManager.removeItemAtPath("$dir/$it", error = null) }
    }

    override fun toast(message: String) {
        dispatch_async(dispatch_get_main_queue()) { showToast(message) }
    }

    override fun openUrl(url: String) {
        val nsUrl = NSURL.URLWithString(url) ?: return
        UIApplication.sharedApplication.openURL(nsUrl, options = emptyMap<Any?, Any>(), completionHandler = null)
    }
}

private class UserDefaultsStore(private val defaults: NSUserDefaults) : KeyValueStore {
    override fun getBoolean(key: String, default: Boolean): Boolean =
        if (defaults.objectForKey(key) == null) default else defaults.boolForKey(key)

    override fun putBoolean(key: String, value: Boolean) = defaults.setBool(value, forKey = key)
    override fun getString(key: String): String? = defaults.stringForKey(key)
    override fun putString(key: String, value: String?) {
        if (value == null) defaults.removeObjectForKey(key) else defaults.setObject(value, forKey = key)
    }
}

private fun directory(kind: ULong, sub: String): String {
    val base = NSSearchPathForDirectoriesInDomains(kind, NSUserDomainMask, true).first() as String
    val path = "$base/$sub"
    NSFileManager.defaultManager.createDirectoryAtPath(path, withIntermediateDirectories = true, attributes = null, error = null)
    return path
}

/** Camera captures wait here until they're moved into a [IosPhotoStore]. */
internal fun cameraDir(): String = directory(NSCachesDirectory, "camera")

private fun fileUri(path: String): String = NSURL.fileURLWithPath(path).absoluteString ?: path

private fun readText(path: String): String? = NSString.stringWithContentsOfFile(path, encoding = NSUTF8StringEncoding, error = null)

@Suppress("CAST_NEVER_SUCCEEDS")
private fun writeText(path: String, text: String): Boolean =
    (text as NSString).writeToFile(path, atomically = true, encoding = NSUTF8StringEncoding, error = null)

/** Photo copies in Application Support/listing_photos/<user>, as on Android. */
class IosPhotoStore(userId: String) : PhotoStore {
    private val dir = directory(NSApplicationSupportDirectory, "listing_photos/${safe(userId)}")
    private val files = NSFileManager.defaultManager

    /** Saves picked or taken photo bytes as a new copy. Null if they're empty or can't be written. */
    suspend fun copyIn(bytes: ByteArray): String? = withContext(Dispatchers.Default) {
        if (bytes.isEmpty()) return@withContext null
        val path = "$dir/${NSUUID().UUIDString}.jpg"
        if (bytes.toNSData().writeToFile(path, atomically = true)) fileUri(path) else null
    }

    /** Moves a camera capture (in [cameraDir]) in. Null if it's empty. */
    suspend fun moveIn(capture: String): String? = withContext(Dispatchers.Default) {
        val size = (files.attributesOfItemAtPath(capture, error = null)?.get("NSFileSize") as? Number)?.toLong() ?: 0L
        if (size == 0L) {
            files.removeItemAtPath(capture, error = null)
            return@withContext null
        }
        val path = "$dir/${NSUUID().UUIDString}.jpg"
        if (files.moveItemAtPath(capture, toPath = path, error = null)) fileUri(path) else null
    }

    private fun names(): List<String> = files.contentsOfDirectoryAtPath(dir, error = null).orEmpty().map { it as String }

    override fun prune(keep: Set<String>) {
        names().forEach { if (fileUri("$dir/$it") !in keep) files.removeItemAtPath("$dir/$it", error = null) }
    }

    override fun delete(uris: Collection<String>) {
        names().forEach { if (fileUri("$dir/$it") in uris) files.removeItemAtPath("$dir/$it", error = null) }
    }

    override fun clear() {
        names().forEach { files.removeItemAtPath("$dir/$it", error = null) }
    }

    private companion object {
        fun safe(id: String) = id.filter { it.isLetterOrDigit() || it == '-' }.ifBlank { "anonymous" }
    }
}

/** Same as Android's draft file: one JSON file per user (and per listing being edited). */
private class IosDraftStore(userId: String, listingId: String?) : DraftStore {
    private val name = listOfNotNull(userId, listingId?.let { "edit_$it" }).joinToString("_") { id ->
        id.filter { it.isLetterOrDigit() || it == '-' || it == '_' }
    }
    private val path = "${directory(NSApplicationSupportDirectory, "drafts")}/$name.json"

    override suspend fun load(): SavedDraft? = withContext(Dispatchers.Default) {
        readText(path)?.let { SavedDraft.decode(it) }
    }

    override suspend fun save(draft: SavedDraft) {
        // Atomic write, so a crash mid-write never leaves half a draft.
        withContext(Dispatchers.Default) { runCatching { writeText(path, SavedDraft.encode(draft)) } }
    }

    override suspend fun clear() {
        withContext(Dispatchers.Default) { NSFileManager.defaultManager.removeItemAtPath(path, error = null) }
    }
}

/** A short message near the bottom of the screen, like an Android Toast. */
@OptIn(ExperimentalForeignApi::class)
private fun showToast(message: String) {
    @Suppress("DEPRECATION")
    val window = UIApplication.sharedApplication.keyWindow ?: return
    val (width, height) = window.bounds.useContents { size.width to size.height }
    val bottomInset = window.safeAreaInsets.useContents { bottom }
    val label = UILabel()
    label.text = message
    label.textColor = UIColor.whiteColor
    label.backgroundColor = UIColor.colorWithWhite(0.1, alpha = 0.9)
    label.font = UIFont.systemFontOfSize(15.0)
    label.textAlignment = NSTextAlignmentCenter
    label.numberOfLines = 0
    label.layer.cornerRadius = 18.0
    label.clipsToBounds = true
    val maxWidth = width - 64.0
    val fit = label.sizeThatFits(platform.CoreGraphics.CGSizeMake(maxWidth - 32.0, Double.MAX_VALUE))
    val (textWidth, textHeight) = fit.useContents { this.width to this.height }
    val boxWidth = minOf(maxWidth, textWidth + 32.0)
    val boxHeight = textHeight + 20.0
    label.setFrame(CGRectMake((width - boxWidth) / 2, height - bottomInset - 96.0 - boxHeight, boxWidth, boxHeight))
    label.alpha = 0.0
    window.addSubview(label)
    UIView.animateWithDuration(0.2, animations = { label.alpha = 1.0 })
    UIView.animateWithDuration(
        0.3, delay = 2.0, options = 0u,
        animations = { label.alpha = 0.0 },
        completion = { _ -> label.removeFromSuperview() }
    )
}
