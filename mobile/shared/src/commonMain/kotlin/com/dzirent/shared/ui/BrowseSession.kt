package com.dzirent.shared.ui

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.dzirent.shared.model.DateRange
import com.dzirent.shared.model.ListingCard
import com.dzirent.shared.model.SavedStudioCard
import com.dzirent.shared.repository.DzirentRepository
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

const val DEFAULT_DISTANCE_STEP = 25
const val DEFAULT_RENTAL_DAYS = 5
const val HOME_ROW_MIN = 3
const val UNDER_PRICE_USD = 15.0

/** Helper to add/subtract whole days from a kotlinx.datetime.LocalDate */
fun LocalDate.plusDays(days: Int): LocalDate = LocalDate.fromEpochDays(toEpochDays() + days)
fun LocalDate.minusDays(days: Int): LocalDate = LocalDate.fromEpochDays(toEpochDays() - days)

private fun monthName(monthNumber: Int): String = when (monthNumber) {
    1 -> "Jan"; 2 -> "Feb"; 3 -> "Mar"; 4 -> "Apr"; 5 -> "May"; 6 -> "Jun"
    7 -> "Jul"; 8 -> "Aug"; 9 -> "Sep"; 10 -> "Oct"; 11 -> "Nov"; 12 -> "Dec"
    else -> ""
}

/**
 * The Home date chip: "Oct 26 - 30" in one month, "Oct 26 - Nov 1" across months.
 */
fun formatDateChip(range: DateRange): String {
    val startMonth = monthName(range.start.monthNumber)
    val startDay = range.start.dayOfMonth
    val endMonth = monthName(range.end.monthNumber)
    val endDay = range.end.dayOfMonth
    return when {
        range.start == range.end -> "$startMonth $startDay"
        range.start.year == range.end.year && range.start.monthNumber == range.end.monthNumber ->
            "$startMonth $startDay - $endDay"
        else -> "$startMonth $startDay - $endMonth $endDay"
    }
}

fun defaultBrowseRange(today: LocalDate, days: Int = DEFAULT_RENTAL_DAYS): DateRange =
    DateRange(today, today.plusDays(days.coerceAtLeast(1) - 1))

fun datesQuestion(dates: DateRange): String = "Is this available ${formatDateChip(dates)}?"

/**
 * What Home and Search show, set from the sidebar (category) and its filter sheet.
 */
data class BrowseFilters(
    val category: String? = null,
    val itemType: String? = null,
    val distanceStep: Int = DEFAULT_DISTANCE_STEP,
    val minPrice: Double? = null,
    val maxPrice: Double? = null,
    val size: String? = null
) {
    fun withCategory(newCategory: String?): BrowseFilters =
        copy(category = newCategory, itemType = if (newCategory == "Accessories") itemType else null)
}

/** Sort options for Search matching backend browse_listings p_sort */
enum class SearchSort(val label: String, val dbSort: String) {
    NEAREST("Closest to me", "closest"),
    NEWEST("Newest", "newest"),
    PRICE_LOW("Price: Low to High", "price_asc"),
    PRICE_HIGH("Price: High to Low", "price_desc")
}

sealed class UiState<out T> {
    object Loading : UiState<Nothing>()
    data class Error(val message: String) : UiState<Nothing>()
    data class Success<T>(val data: T) : UiState<T>()
}

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
    val underPrice: List<ListingCard>,
    val fromSavedStudios: List<ListingCard>,
    val studios: List<StudioSummary>
)

/** Home's rows, in the order they are shown. */
enum class HomeRow(val title: String, val subtitle: String?) {
    FIT("Likely to fit you", "Matched to your measurements"),
    NEW("New near you", null),
    UNDER_PRICE("Under \$15", null),
    SAVED_STUDIOS("From studios you saved", null);

    fun listings(sections: HomeSections): List<ListingCard> = when (this) {
        FIT -> sections.likelyFit.orEmpty()
        NEW -> sections.newNearYou
        UNDER_PRICE -> sections.underPrice
        SAVED_STUDIOS -> sections.fromSavedStudios
    }
}

data class BrowseData(
    val listings: List<ListingCard>,
    val fitListings: List<ListingCard>?,
    val savedStudios: List<SavedStudioCard>
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
    private val today: LocalDate get() = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date

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
            val fit = if (!userId.isNullOrBlank()) {
                runCatching {
                    repository.fitListings(lat = lat, lng = lng, radiusMiles = radiusMiles, limit = 20)
                }.getOrNull()?.takeIf { it.isNotEmpty() }
            } else null

            val saved = if (!userId.isNullOrBlank()) {
                runCatching { repository.mySavedStudios(limit = 20) }.getOrElse { emptyList() }
            } else emptyList()

            loadedKey = key
            UiState.Success(BrowseData(listings, fit, saved))
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
        val underPrice = visible.filter { (it.price ?: Double.MAX_VALUE) < UNDER_PRICE_USD }
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
            newNearYou = visible.take(8), // Newest returned by browse_listings
            underPrice = underPrice,
            fromSavedStudios = fromSaved,
            studios = studios
        )
    }
}

