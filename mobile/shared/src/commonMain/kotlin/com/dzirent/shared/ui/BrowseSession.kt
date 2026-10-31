package com.dzirent.shared.ui

import com.dzirent.shared.util.*
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.dzirent.shared.model.ListingCard
import com.dzirent.shared.model.SavedStudioCard
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.LocalDate

/** A Home row is only shown with at least this many listings. */
const val HOME_ROW_MIN = 3

/** "New near you" covers listings created in the last 7 days. */
const val NEW_NEAR_YOU_DAYS = 7L

/** The "Under $15" row: pieces priced below this. */
const val UNDER_PRICE_USD = 15.0

/** The reference app's Search sort options, as browse_listings' p_sort values. */
val SearchSort.dbSort: String
    get() = when (this) {
        SearchSort.NEAREST -> "nearest"
        SearchSort.NEWEST -> "newest"
        SearchSort.PRICE_LOW -> "price_low"
        SearchSort.PRICE_HIGH -> "price_high"
    }

/** The search radius in miles for the distance filter's step, in the chosen unit. */
fun radiusMiles(step: Int, unit: DistanceUnit): Double = unit.radiusKm(step) / KM_PER_MILE


/** One lender on Home's Studios tab, built from their listings that match the filters. */
data class StudioSummary(
    val studioName: String,
    val studioHandle: String?,
    val pieceCount: Int,
    val coverPhotoPath: String?,
    val distance: Int?
)

/** Everything Home shows, from the listings loaded for the current distance. */
data class HomeSections(
    val visible: List<ListingCard>,
    /** Null when the renter has no measurements or is a guest (Home shows the prompt card). */
    val likelyFit: List<ListingCard>?,
    val newNearYou: List<ListingCard>,
    /** Pieces in a style I'm interested in; empty when I picked no styles. */
    val forYourStyle: List<ListingCard>,
    val underPrice: List<ListingCard>,
    val fromSavedStudios: List<ListingCard>,
    val studios: List<StudioSummary>
)

/** Home's rows, in the order they are shown. */
enum class HomeRow(val title: String, val subtitle: String?) {
    FIT("Likely to fit you", "Matched to your measurements"),
    NEW("New near you", null),
    STYLE("For your style", null),
    UNDER_PRICE("Under \$15", null),
    SAVED_STUDIOS("From studios you saved", null);

    fun listings(sections: HomeSections): List<ListingCard> = when (this) {
        FIT -> sections.likelyFit.orEmpty()
        NEW -> sections.newNearYou
        STYLE -> sections.forYourStyle
        UNDER_PRICE -> sections.underPrice
        SAVED_STUDIOS -> sections.fromSavedStudios
    }
}

data class BrowseData(
    val listings: List<ListingCard>,
    val fitListings: List<ListingCard>?,
    val savedStudios: List<SavedStudioCard>,
    val newNearYou: List<ListingCard> = emptyList(),
    val forYourStyle: List<ListingCard> = emptyList()
)

/**
 * Shared by Home, See all and Search: the sidebar filters, the date range and listings loaded
 * from shop window functions.
 */
@Stable
class BrowseSession(
    private val repository: DzirentRepository,
    private val userId: String?,
    defaultDistanceStep: Int = DEFAULT_DISTANCE_STEP,
    rentalDays: Int = DEFAULT_RENTAL_DAYS
) {
    private val today: LocalDate get() = today()

    var filters by mutableStateOf(BrowseFilters(distanceStep = defaultDistanceStep))
    var dates by mutableStateOf(defaultBrowseRange(today, rentalDays))
    var state by mutableStateOf<UiState<BrowseData>>(UiState.Loading)
        private set

    private var loadedKey: String? = null
    private val mutex = Mutex()

    /**
     * Loads listings within [radiusMiles] using shop window RPCs.
     */
    suspend fun load(
        lat: Double?,
        lng: Double?,
        radiusMiles: Double?,
        force: Boolean = false
    ) = mutex.withLock {
        val key = "$lat,$lng,$radiusMiles,${dates.start},${dates.end},${filters.category},${filters.itemType},${filters.size},${filters.minPrice},${filters.maxPrice}"
        if (!force && key == loadedKey && state is UiState.Success) return@withLock
        if (state !is UiState.Success) state = UiState.Loading
        state = try {
            val listings = repository.browseListings(
                lat = lat,
                lng = lng,
                radiusMiles = radiusMiles,
                category = filters.category,
                itemType = filters.itemType,
                size = filters.size,
                minPrice = filters.minPrice,
                maxPrice = filters.maxPrice,
                startDate = dates.start.toString(),
                endDate = dates.end.toString(),
                limit = 30
            )
            val newNear = repository.browseListings(
                lat = lat,
                lng = lng,
                radiusMiles = radiusMiles,
                category = filters.category,
                itemType = filters.itemType,
                size = filters.size,
                minPrice = filters.minPrice,
                maxPrice = filters.maxPrice,
                startDate = dates.start.toString(),
                endDate = dates.end.toString(),
                newDays = NEW_NEAR_YOU_DAYS.toInt(),
                sort = "nearest",
                limit = 30
            )
            // Null without measurements, so Home shows the "Add your measurements" card instead.
            val body = if (!userId.isNullOrBlank()) runCatching { repository.getPrivateProfile() }.getOrNull() else null
            val fit = if (body != null && hasFitMeasurements(body)) {
                runCatching {
                    repository.fitListings(lat = lat, lng = lng, radiusMiles = radiusMiles, limit = 30)
                }.getOrElse { emptyList() }
                    .filter { filters.category == null || it.category == filters.category }
            } else null
            val interests = body?.styleInterests.orEmpty()
            val forStyle = if (interests.isNotEmpty()) {
                runCatching {
                    repository.browseListings(
                        lat = lat,
                        lng = lng,
                        radiusMiles = radiusMiles,
                        category = filters.category,
                        itemType = filters.itemType,
                        size = filters.size,
                        styles = interests,
                        minPrice = filters.minPrice,
                        maxPrice = filters.maxPrice,
                        startDate = dates.start.toString(),
                        endDate = dates.end.toString(),
                        sort = "nearest",
                        limit = 30
                    )
                }.getOrElse { emptyList() }
            } else emptyList()

            val saved = if (!userId.isNullOrBlank()) {
                runCatching { repository.mySavedStudios(limit = 20) }.getOrElse { emptyList() }
            } else emptyList()

            loadedKey = key
            UiState.Success(BrowseData(listings, fit, saved, newNear, forStyle))
        } catch (e: Exception) {
            UiState.Error(e.userMessage("Couldn't load listings. Please try again."))
        }
    }

    fun invalidate() {
        loadedKey = null
    }

    /**
     * Home's rows and tabs for the current filters and dates.
     */
    fun sections(): HomeSections? = (state as? UiState.Success)?.data?.let { data ->
        val visible = data.listings
        val underPrice = visible.filter { (it.price ?: Double.MAX_VALUE) < UNDER_PRICE_USD }.sortedBy { it.distance ?: Int.MAX_VALUE }
        val savedHandles = data.savedStudios.map { it.studioHandle }.toSet()
        val fromSaved = visible.filter { it.studioHandle != null && it.studioHandle in savedHandles }

        val studios = visible
            .filter { !it.studioHandle.isNullOrBlank() || !it.studioName.isNullOrBlank() }
            .groupBy { it.studioHandle ?: it.studioName.orEmpty() }
            .map { (_, pieces) ->
                val first = pieces.first()
                StudioSummary(
                    studioName = first.studioName?.ifBlank { null } ?: "Studio",
                    studioHandle = first.studioHandle,
                    pieceCount = pieces.size,
                    coverPhotoPath = pieces.firstNotNullOfOrNull { it.coverPhotoPath },
                    distance = pieces.mapNotNull { it.distance }.minOrNull()
                )
            }.sortedBy { it.distance ?: Int.MAX_VALUE }

        HomeSections(
            visible = visible,
            likelyFit = data.fitListings,
            newNearYou = data.newNearYou,
            forYourStyle = data.forYourStyle,
            underPrice = underPrice,
            fromSavedStudios = fromSaved,
            studios = studios
        )
    }
}

