package com.dzirent.shared.platform

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

private fun roundCoord(coord: Double): Double = round(coord * 100.0) / 100.0

class AndroidLocationService(context: Context) : LocationService {
    private val appContext = context.applicationContext
    private val fused = LocationServices.getFusedLocationProviderClient(appContext)

    override fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    override suspend fun currentPlace(): ApproxPlace? {
        if (!hasPermission()) return null
        val tokenSource = CancellationTokenSource()
        val location = try {
            withTimeoutOrNull(LOCATION_TIMEOUT_MS) {
                suspendCancellableCoroutine<Location?> { cont ->
                    fused.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, tokenSource.token)
                        .addOnSuccessListener { cont.resume(it) }
                        .addOnFailureListener { e ->
                            log("getCurrentLocation", e)
                            cont.resume(null)
                        }
                    cont.invokeOnCancellation { tokenSource.cancel() }
                }
            }
        } catch (e: Exception) {
            log("getCurrentLocation", e)
            null
        } ?: return null

        val lat = roundCoord(location.latitude)
        val lng = roundCoord(location.longitude)
        return ApproxPlace(lat, lng, cityFor(lat, lng))
    }

    override suspend fun cityFor(lat: Double, lng: Double): String? {
        val address = geocode { geocoder, onResult ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                geocoder.getFromLocation(lat, lng, 1, listener(onResult))
                null
            } else {
                @Suppress("DEPRECATION")
                geocoder.getFromLocation(lat, lng, 1).orEmpty()
            }
        }
        return address?.cityName()
    }

    private suspend fun geocode(
        lookup: (Geocoder, (List<Address>) -> Unit) -> List<Address>?
    ): Address? {
        if (!Geocoder.isPresent()) {
            Log.w("Dzirent", "Geocoder not available on this device")
            return null
        }
        val geocoder = Geocoder(appContext, Locale.getDefault())
        return try {
            withTimeoutOrNull(GEOCODE_TIMEOUT_MS) {
                withContext(Dispatchers.IO) {
                    suspendCancellableCoroutine<List<Address>> { cont ->
                        val direct = lookup(geocoder) { results -> if (cont.isActive) cont.resume(results) }
                        if (direct != null) cont.resume(direct)
                    }
                }
            }?.firstOrNull()
        } catch (e: Exception) {
            log("geocode", e)
            null
        }
    }

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun listener(onResult: (List<Address>) -> Unit) = object : Geocoder.GeocodeListener {
        override fun onGeocode(addresses: MutableList<Address>) = onResult(addresses)
        override fun onError(errorMessage: String?) {
            Log.w("Dzirent", "Geocoder error: ${errorMessage?.lineSequence()?.firstOrNull().orEmpty()}")
            onResult(emptyList())
        }
    }

    private fun Address.cityName(): String? {
        val city = (locality ?: subAdminArea)?.takeIf { it.isNotBlank() } ?: return null
        return when (countryCode) {
            "US" -> if (!adminArea.isNullOrBlank()) "$city, $adminArea" else city
            "PR" -> "$city, PR"
            else -> city
        }
    }

    private fun log(operation: String, e: Throwable) {
        val firstLine = e.message?.lineSequence()?.firstOrNull().orEmpty()
        Log.w("Dzirent", "Location $operation failed: ${e.javaClass.simpleName} - $firstLine")
    }

    private companion object {
        const val LOCATION_TIMEOUT_MS = 15_000L
        const val GEOCODE_TIMEOUT_MS = 10_000L
    }
}

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "dzirent_settings")

class AndroidSettingsStorage(context: Context) : SettingsStorage {
    private val store = context.applicationContext.settingsDataStore

    override val settings: Flow<AppSettings> = store.data
        .catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }
        .map { prefs ->
            AppSettings(
                theme = ThemeMode.fromKey(prefs[THEME]),
                distanceUnit = DistanceUnit.fromKey(prefs[DISTANCE_UNIT]),
                measureUnit = MeasureUnit.fromKey(prefs[MEASURE_UNIT]),
                rentalDays = prefs[RENTAL_DAYS] ?: 5,
                defaultDistanceStep = prefs[DEFAULT_DISTANCE] ?: 25
            )
        }

    override suspend fun setTheme(mode: ThemeMode) {
        store.edit { it[THEME] = mode.key }
    }

    override suspend fun setDistanceUnit(unit: DistanceUnit) {
        store.edit { it[DISTANCE_UNIT] = unit.key }
    }

    override suspend fun setMeasureUnit(unit: MeasureUnit) {
        store.edit { it[MEASURE_UNIT] = unit.key }
    }

    override suspend fun setRentalDays(days: Int) {
        store.edit { it[RENTAL_DAYS] = days }
    }

    override suspend fun setDefaultDistanceStep(step: Int) {
        store.edit { it[DEFAULT_DISTANCE] = step }
    }

    private companion object {
        val THEME = stringPreferencesKey("theme")
        val DISTANCE_UNIT = stringPreferencesKey("distance_unit")
        val MEASURE_UNIT = stringPreferencesKey("measure_unit")
        val RENTAL_DAYS = intPreferencesKey("rental_days")
        val DEFAULT_DISTANCE = intPreferencesKey("default_distance_step")
    }
}

class AndroidImageCompressor : ImageCompressor {
    override suspend fun compressImage(imageBytes: ByteArray, maxDimension: Int, quality: Int): ByteArray? =
        withContext(Dispatchers.Default) {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null

            var sampleSize = 1
            while (max(bounds.outWidth, bounds.outHeight) / (sampleSize * 2) >= maxDimension) {
                sampleSize *= 2
            }
            val bitmap = BitmapFactory.decodeByteArray(
                imageBytes, 0, imageBytes.size,
                BitmapFactory.Options().apply { inSampleSize = sampleSize }
            ) ?: return@withContext null

            val width = bitmap.width
            val height = bitmap.height
            val ratio = min(1f, maxDimension.toFloat() / max(width, height))
            val matrix = Matrix().apply {
                postScale(ratio, ratio)
                postRotate(exifRotationDegrees(imageBytes))
            }
            val output = Bitmap.createBitmap(bitmap, 0, 0, width, height, matrix, true)
            val out = ByteArrayOutputStream()
            output.compress(Bitmap.CompressFormat.JPEG, quality, out)
            out.toByteArray()
        }

    private fun exifRotationDegrees(bytes: ByteArray): Float = try {
        when (ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(
            ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL
        )) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
    } catch (_: Exception) {
        0f
    }
}

class AndroidPhotoPicker : PhotoPicker {
    override suspend fun pickPhotos(maxItems: Int): List<ByteArray> {
        throw UnsupportedOperationException("AndroidPhotoPicker requires activity result launcher from UI layer")
    }
}

class AndroidCameraService : CameraService {
    override fun hasCameraPermission(): Boolean = false
    override suspend fun capturePhoto(): ByteArray? {
        throw UnsupportedOperationException("AndroidCameraService requires activity result launcher from UI layer")
    }
}

