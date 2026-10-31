package com.dzirent.shared.ui

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.dzirent.shared.model.Listing
import com.dzirent.shared.model.PrivateProfile
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.util.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Nearby listings plus what Home needs to sort them into rows. */
data class BrowseData(
    val listings: List<Listing>,
    val savedStudioIds: Set<String>,
    val body: PrivateProfile
)

/**
 * Shared by Home, See all and Search: the sidebar filters, the date range and one load of
 * nearby listings (reloaded when the location or distance changes, or on refresh).
 * The distance and the date range start from Settings > Preferences.
 */
@Stable
class BrowseSession(
    private val repository: DzirentRepository,
    private val userId: String,
    defaultDistanceStep: Int = DEFAULT_DISTANCE_STEP,
    rentalDays: Int = DEFAULT_RENTAL_DAYS
) {
    var filters by mutableStateOf(BrowseFilters(distanceStep = defaultDistanceStep))
    var dates by mutableStateOf(defaultBrowseRange(today(), rentalDays))
    var state by mutableStateOf<UiState<BrowseData>>(UiState.Loading)
        private set

    private var loadedFor: Triple<Double, Double, Double>? = null
    private val mutex = Mutex()

    /**
     * Loads listings within [radiusKm] unless this location and radius are already loaded;
     * [force] always reloads.
     */
    suspend fun load(lat: Double, lng: Double, radiusKm: Double, force: Boolean = false) = mutex.withLock {
        val key = Triple(lat, lng, radiusKm)
        if (!force && key == loadedFor && state is UiState.Success) return@withLock
        if (state !is UiState.Success) state = UiState.Loading
        state = try {
            val radiusMiles = radiusKm / KM_PER_MILE
            val listings = repository.browseListings(lat = lat, lng = lng, radiusMiles = radiusMiles, limit = 30)
                .map { it.toListing() }
            val saved = if (userId.isNotBlank()) repository.getSavedStudioIds(userId) else emptySet()
            val body = if (userId.isNotBlank()) runCatching { repository.getPrivateProfile() }.getOrNull() ?: PrivateProfile() else PrivateProfile()
            loadedFor = key
            UiState.Success(BrowseData(listings, saved, body))
        } catch (e: Exception) {
            UiState.Error(e.userMessage("Couldn't load listings. Please try again."))
        }
    }

    /** My "Styles you're interested in" (from private_profiles, loaded with the listings). */
    fun styleInterests(): Set<String> = (state as? UiState.Success)?.data?.body?.styleInterests.orEmpty().toSet()

    /** Everything loaded for the current distance (before filters and dates). */
    fun loadedListings(): List<Listing> = (state as? UiState.Success)?.data?.listings.orEmpty()

    private var wider: Pair<Triple<Double, Double, Double>, List<Listing>>? = null

    /** Listings within [radiusKm] for the "wider distance" suggestion, loaded once per place and radius. */
    suspend fun widerListings(lat: Double, lng: Double, radiusKm: Double): List<Listing> {
        val key = Triple(lat, lng, radiusKm)
        wider?.takeIf { it.first == key }?.let { return it.second }
        val radiusMiles = radiusKm / KM_PER_MILE
        return repository.browseListings(lat = lat, lng = lng, radiusMiles = radiusMiles, limit = 30)
            .map { it.toListing() }
            .also { wider = key to it }
    }

    /** Close text matches for a search that found nothing (typos), with their distance from me. */
    suspend fun similarListings(query: String, lat: Double, lng: Double): List<Listing> =
        repository.browseListings(query = query, lat = lat, lng = lng, limit = 10)
            .map { it.toListing() }

    /** The next [load] fetches again, e.g. after saving measurements or a studio. */
    fun invalidate() {
        loadedFor = null
        wider = null
    }

    /**
     * Home's rows and tabs for the current filters and dates, once loaded. [anyDates]
     * (Search only) ignores the date range.
     */
    fun sections(anyDates: Boolean = false): HomeSections? = (state as? UiState.Success)?.data?.let {
        buildHomeSections(it.listings, userId, filters, if (anyDates) null else dates, it.body, it.savedStudioIds)
    }
}
