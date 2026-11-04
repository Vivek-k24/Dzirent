@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.dzirent.shared.platform

import com.dzirent.shared.util.AppSettings
import com.dzirent.shared.util.DEFAULT_DISTANCE_STEP
import com.dzirent.shared.util.DEFAULT_RENTAL_DAYS
import com.dzirent.shared.util.DISTANCE_STEPS
import com.dzirent.shared.util.DistanceUnit
import com.dzirent.shared.util.MeasureUnit
import com.dzirent.shared.util.RENTAL_LENGTH_OPTIONS
import com.dzirent.shared.util.ThemeMode
import com.dzirent.shared.util.cityLabel
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.useContents
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import platform.AVFoundation.AVAuthorizationStatusAuthorized
import platform.AVFoundation.AVAuthorizationStatusNotDetermined
import platform.AVFoundation.AVCaptureDevice
import platform.AVFoundation.AVMediaTypeVideo
import platform.AVFoundation.authorizationStatusForMediaType
import platform.AVFoundation.requestAccessForMediaType
import platform.CoreLocation.CLGeocoder
import platform.CoreLocation.CLLocation
import platform.CoreLocation.CLLocationManager
import platform.CoreLocation.CLLocationManagerDelegateProtocol
import platform.CoreLocation.CLPlacemark
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedAlways
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedWhenInUse
import platform.CoreLocation.kCLAuthorizationStatusNotDetermined
import platform.CoreLocation.kCLLocationAccuracyKilometer
import platform.Foundation.NSData
import platform.Foundation.NSError
import platform.Foundation.NSLog
import platform.Foundation.NSURL
import platform.Foundation.NSUserDefaults
import platform.PhotosUI.PHPickerConfiguration
import platform.PhotosUI.PHPickerFilter
import platform.PhotosUI.PHPickerResult
import platform.PhotosUI.PHPickerViewController
import platform.PhotosUI.PHPickerViewControllerDelegateProtocol
import platform.UIKit.UIApplication
import platform.UIKit.UIApplicationOpenSettingsURLString
import platform.UIKit.UIImage
import platform.UIKit.UIImageJPEGRepresentation
import platform.UIKit.UIImagePickerController
import platform.UIKit.UIImagePickerControllerDelegateProtocol
import platform.UIKit.UIImagePickerControllerOriginalImage
import platform.UIKit.UIImagePickerControllerSourceType
import platform.UIKit.UINavigationControllerDelegateProtocol
import platform.UIKit.UIViewController
import platform.darwin.NSObject
import kotlin.coroutines.resume
import kotlin.math.round

private fun roundCoord(coord: Double): Double = round(coord * 100.0) / 100.0

private fun isAuthorized(status: Int): Boolean =
    status == kCLAuthorizationStatusAuthorizedWhenInUse || status == kCLAuthorizationStatusAuthorizedAlways

/** Approximate location (when in use) and "City, ST" from the reverse geocoder, as on Android. */
class IosLocationService : LocationService {
    override fun hasPermission(): Boolean = isAuthorized(CLLocationManager().authorizationStatus)

    @OptIn(ExperimentalForeignApi::class)
    override suspend fun currentPlace(): ApproxPlace? {
        if (!hasPermission()) return null
        val location = withTimeoutOrNull(LOCATION_TIMEOUT_MS) {
            withContext(Dispatchers.Main) {
                // CLLocationManager needs a thread with a run loop: the main thread.
                val request = OneLocationRequest()
                try {
                    suspendCancellableCoroutine<CLLocation?> { cont -> request.start { cont.resume(it) } }
                } finally {
                    request.stop()
                }
            }
        } ?: return null
        val (latitude, longitude) = location.coordinate.useContents { latitude to longitude }
        val lat = roundCoord(latitude)
        val lng = roundCoord(longitude)
        return ApproxPlace(lat, lng, cityFor(lat, lng))
    }

    override suspend fun cityFor(lat: Double, lng: Double): String? {
        val placemark = withTimeoutOrNull(GEOCODE_TIMEOUT_MS) {
            withContext(Dispatchers.Main) {
                val geocoder = CLGeocoder()
                try {
                    suspendCancellableCoroutine<CLPlacemark?> { cont ->
                        geocoder.reverseGeocodeLocation(CLLocation(latitude = lat, longitude = lng)) { placemarks, error ->
                            if (error != null) NSLog("Dzirent: geocode failed: %@", error.localizedDescription)
                            if (cont.isActive) cont.resume(placemarks?.firstOrNull() as? CLPlacemark)
                        }
                    }
                } finally {
                    geocoder.cancelGeocode()
                }
            }
        }
        return placemark?.cityName()
    }

    private fun CLPlacemark.cityName(): String? {
        val city = (locality ?: subAdministrativeArea)?.takeIf { it.isNotBlank() } ?: return null
        return when (ISOcountryCode) {
            "US" -> cityLabel(city, administrativeArea)
            "PR" -> "$city, PR"
            else -> city
        }
    }

    private companion object {
        const val LOCATION_TIMEOUT_MS = 15_000L
        const val GEOCODE_TIMEOUT_MS = 10_000L
    }
}

/** One approximate fix; [start] calls back once with the location, or null on failure. */
private class OneLocationRequest : NSObject(), CLLocationManagerDelegateProtocol {
    private val manager = CLLocationManager()
    private var onResult: ((CLLocation?) -> Unit)? = null

    fun start(onResult: (CLLocation?) -> Unit) {
        this.onResult = onResult
        manager.delegate = this
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.requestLocation()
    }

    fun stop() {
        onResult = null
        manager.stopUpdatingLocation()
        manager.delegate = null
    }

    private fun finish(location: CLLocation?) {
        val callback = onResult ?: return
        onResult = null
        callback(location)
    }

    override fun locationManager(manager: CLLocationManager, didUpdateLocations: List<*>) {
        finish(didUpdateLocations.lastOrNull() as? CLLocation)
    }

    override fun locationManager(manager: CLLocationManager, didFailWithError: NSError) {
        NSLog("Dzirent: location failed: %@", didFailWithError.localizedDescription)
        finish(null)
    }
}

/** Asks for "when in use" location once; [request] calls back with whether it's allowed. */
internal class LocationPermissionRequester : NSObject(), CLLocationManagerDelegateProtocol {
    private val manager = CLLocationManager()
    private var pending: ((Boolean) -> Unit)? = null

    fun request(onResult: (Boolean) -> Unit) {
        val status = manager.authorizationStatus
        if (status != kCLAuthorizationStatusNotDetermined) {
            onResult(isAuthorized(status))
            return
        }
        pending = onResult
        manager.delegate = this
        manager.requestWhenInUseAuthorization()
    }

    override fun locationManagerDidChangeAuthorization(manager: CLLocationManager) {
        val status = manager.authorizationStatus
        if (status == kCLAuthorizationStatusNotDetermined) return
        val callback = pending ?: return
        pending = null
        callback(isAuthorized(status))
    }
}

/** Settings in NSUserDefaults, under the same keys as Android's DataStore. */
class IosSettingsStorage : SettingsStorage {
    private val defaults = NSUserDefaults.standardUserDefaults
    private val state = MutableStateFlow(read())

    override val settings: StateFlow<AppSettings> get() = state

    private fun read() = AppSettings(
        theme = ThemeMode.fromKey(defaults.stringForKey(THEME)),
        distanceUnit = DistanceUnit.fromKey(defaults.stringForKey(DISTANCE_UNIT)),
        measureUnit = MeasureUnit.fromKey(defaults.stringForKey(MEASURE_UNIT)),
        rentalDays = intOrNull(RENTAL_DAYS)?.takeIf { it in RENTAL_LENGTH_OPTIONS } ?: DEFAULT_RENTAL_DAYS,
        defaultDistanceStep = intOrNull(DEFAULT_DISTANCE)?.takeIf { it in DISTANCE_STEPS } ?: DEFAULT_DISTANCE_STEP
    )

    private fun intOrNull(key: String): Int? =
        if (defaults.objectForKey(key) == null) null else defaults.integerForKey(key).toInt()

    private fun update(write: () -> Unit) {
        write()
        state.value = read()
    }

    override suspend fun setTheme(mode: ThemeMode) = update { defaults.setObject(mode.key, forKey = THEME) }
    override suspend fun setDistanceUnit(unit: DistanceUnit) = update { defaults.setObject(unit.key, forKey = DISTANCE_UNIT) }
    override suspend fun setMeasureUnit(unit: MeasureUnit) = update { defaults.setObject(unit.key, forKey = MEASURE_UNIT) }
    override suspend fun setRentalDays(days: Int) = update { defaults.setInteger(days.toLong(), forKey = RENTAL_DAYS) }
    override suspend fun setDefaultDistanceStep(step: Int) = update { defaults.setInteger(step.toLong(), forKey = DEFAULT_DISTANCE) }

    override fun getRecentSearches(userId: String): List<String> =
        defaults.stringForKey("recent_searches_$userId")?.split('\n')?.filter { it.isNotBlank() }.orEmpty()

    override fun addRecentSearch(userId: String, query: String): List<String> {
        val updated = com.dzirent.shared.util.addRecentSearch(getRecentSearches(userId), query)
        defaults.setObject(updated.joinToString("\n"), forKey = "recent_searches_$userId")
        return updated
    }

    override fun clearRecentSearches(userId: String) {
        defaults.removeObjectForKey("recent_searches_$userId")
    }

    private companion object {
        const val THEME = "theme"
        const val DISTANCE_UNIT = "distance_unit"
        const val MEASURE_UNIT = "measure_unit"
        const val RENTAL_DAYS = "rental_days"
        const val DEFAULT_DISTANCE = "default_distance_step"
    }
}

/** The view controller on top, to present the picker and camera from. */
internal fun UIViewController.topPresented(): UIViewController {
    var top = this
    while (true) top = top.presentedViewController ?: return top
}

/** The system photo picker (PHPicker, no library permission needed), images only. */
class IosPhotoPicker(private val presenter: () -> UIViewController?) : PhotoPicker {
    private var delegate: PickerDelegate? = null

    override suspend fun pickPhotos(maxItems: Int): List<ByteArray> = pickPhotoData(maxItems).filterNotNull()

    /** One entry per picked photo, in order; null where a photo couldn't be read. */
    internal suspend fun pickPhotoData(maxItems: Int): List<ByteArray?> {
        val results = withContext(Dispatchers.Main) {
            suspendCancellableCoroutine<List<PHPickerResult>> { cont ->
                val configuration = PHPickerConfiguration()
                configuration.selectionLimit = maxItems.toLong()
                configuration.filter = PHPickerFilter.imagesFilter
                val picker = PHPickerViewController(configuration = configuration)
                val pickerDelegate = PickerDelegate { picked ->
                    picker.dismissViewControllerAnimated(true, completion = null)
                    delegate = null
                    if (cont.isActive) cont.resume(picked)
                }
                delegate = pickerDelegate
                picker.delegate = pickerDelegate
                val from = presenter()
                if (from == null) {
                    delegate = null
                    cont.resume(emptyList())
                } else {
                    from.presentViewController(picker, animated = true, completion = null)
                }
            }
        }
        return coroutineScope { results.map { async { it.loadImageData() } }.awaitAll() }
    }

    private suspend fun PHPickerResult.loadImageData(): ByteArray? = suspendCancellableCoroutine { cont ->
        itemProvider.loadDataRepresentationForTypeIdentifier(IMAGE_TYPE) { data: NSData?, _: NSError? ->
            if (cont.isActive) cont.resume(data?.toByteArray()?.takeIf { it.isNotEmpty() })
        }
    }

    private class PickerDelegate(private val onDone: (List<PHPickerResult>) -> Unit) :
        NSObject(), PHPickerViewControllerDelegateProtocol {
        override fun picker(picker: PHPickerViewController, didFinishPicking: List<*>) {
            onDone(didFinishPicking.filterIsInstance<PHPickerResult>())
        }
    }

    private companion object {
        const val IMAGE_TYPE = "public.image"
    }
}

/** The system camera (UIImagePickerController). */
class IosCameraService(private val presenter: () -> UIViewController?) : CameraService {
    private var delegate: CameraDelegate? = null

    /** False in the Simulator and on devices without a camera. */
    val isAvailable: Boolean
        get() = UIImagePickerController.isSourceTypeAvailable(
            UIImagePickerControllerSourceType.UIImagePickerControllerSourceTypeCamera
        )

    override fun hasCameraPermission(): Boolean =
        AVCaptureDevice.authorizationStatusForMediaType(AVMediaTypeVideo) == AVAuthorizationStatusAuthorized

    /** True while the system question hasn't been answered yet. */
    val canAskPermission: Boolean
        get() = AVCaptureDevice.authorizationStatusForMediaType(AVMediaTypeVideo) == AVAuthorizationStatusNotDetermined

    /** Asks the system question; true if allowed. */
    suspend fun requestPermission(): Boolean = suspendCancellableCoroutine { cont ->
        AVCaptureDevice.requestAccessForMediaType(AVMediaTypeVideo) { granted ->
            if (cont.isActive) cont.resume(granted)
        }
    }

    override suspend fun capturePhoto(): ByteArray? = capture()?.bytes

    /** Null if the person cancelled; otherwise the JPEG (null bytes if the camera gave no photo). */
    internal suspend fun capture(): Capture? = withContext(Dispatchers.Main) {
        suspendCancellableCoroutine { cont ->
            val from = presenter()
            if (from == null || !isAvailable) {
                cont.resume(null)
                return@suspendCancellableCoroutine
            }
            val picker = UIImagePickerController()
            picker.sourceType = UIImagePickerControllerSourceType.UIImagePickerControllerSourceTypeCamera
            val cameraDelegate = CameraDelegate { image, cancelled ->
                picker.dismissViewControllerAnimated(true, completion = null)
                delegate = null
                val result = if (cancelled) null else Capture(image?.let { UIImageJPEGRepresentation(it, CAPTURE_QUALITY) }?.toByteArray())
                if (cont.isActive) cont.resume(result)
            }
            delegate = cameraDelegate
            picker.delegate = cameraDelegate
            from.presentViewController(picker, animated = true, completion = null)
        }
    }

    internal class Capture(val bytes: ByteArray?)

    private class CameraDelegate(private val onDone: (UIImage?, Boolean) -> Unit) :
        NSObject(), UIImagePickerControllerDelegateProtocol, UINavigationControllerDelegateProtocol {
        override fun imagePickerController(picker: UIImagePickerController, didFinishPickingMediaWithInfo: Map<Any?, *>) {
            onDone(didFinishPickingMediaWithInfo[UIImagePickerControllerOriginalImage] as? UIImage, false)
        }

        override fun imagePickerControllerDidCancel(picker: UIImagePickerController) {
            onDone(null, true)
        }
    }

    private companion object {
        // The full photo, like Android's camera file; it's compressed (1600 px, 80) on upload.
        const val CAPTURE_QUALITY = 0.95
    }
}

/** Same size and quality as Android: long side at most [maxDimension], JPEG at [quality], upright. */
class IosImageCompressor : ImageCompressor {
    override suspend fun compressImage(imageBytes: ByteArray, maxDimension: Int, quality: Int): ByteArray? =
        withContext(Dispatchers.Default) {
            val image = uprightImage(imageBytes.toNSData(), maxDimension) ?: return@withContext null
            UIImageJPEGRepresentation(image, quality / 100.0)?.toByteArray()
        }
}

/** iOS push (APNs through Firebase) needs a paid Apple Developer account: off for now, never throws. */
class IosPushService : PushService {
    override val platform: String get() = "ios"
    override val canAskPermission: Boolean get() = false
    override suspend fun token(): String? = null
    override suspend fun deleteToken() = Unit
    override fun canNotify(): Boolean = false
    override fun openNotificationSettings() = openAppSettings()
    override fun setSignedInUser(userId: String?) = Unit
    override fun chatShown(conversationId: String) = Unit
    override fun chatHidden(conversationId: String) = Unit
}

/** Dzirent's page in the iPhone's Settings app. */
internal fun openAppSettings() {
    val url = NSURL.URLWithString(UIApplicationOpenSettingsURLString) ?: return
    UIApplication.sharedApplication.openURL(url, options = emptyMap<Any?, Any>(), completionHandler = null)
}
