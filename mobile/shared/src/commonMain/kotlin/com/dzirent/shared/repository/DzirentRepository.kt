package com.dzirent.shared.repository

import com.dzirent.shared.config.SupabaseBuildConfig
import com.dzirent.shared.model.*
import com.dzirent.shared.platform.ImageCompressor
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.CodeVerifierCache
import io.github.jan.supabase.auth.MemoryCodeVerifierCache
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.SettingsCodeVerifierCache
import io.github.jan.supabase.auth.SettingsSessionManager
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.realtime.HasRecord
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.decodeRecord
import io.github.jan.supabase.realtime.decodeRecordOrNull
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.github.jan.supabase.storage.Storage
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import kotlin.random.Random

/** User-friendly exception safe for display in UI. */
class DzirentException(message: String) : Exception(message)

const val CANT_MESSAGE_USER = "You can't message this user."

/** Live chat subscription handle. */
class ChatSubscription(
    val messages: Flow<Message>,
    val rentals: Flow<Rental>,
    val close: suspend () -> Unit
)

/** Pure Kotlin RFC 4122 v4 UUID generator. */
fun generateUuid(): String {
    val chars = "0123456789abcdef"
    val bytes = ByteArray(16)
    Random.nextBytes(bytes)
    bytes[6] = ((bytes[6].toInt() and 0x0f) or 0x40).toByte()
    bytes[8] = ((bytes[8].toInt() and 0x3f) or 0x80).toByte()
    val sb = StringBuilder(36)
    for (i in 0 until 16) {
        if (i == 4 || i == 6 || i == 8 || i == 10) sb.append('-')
        val b = bytes[i].toInt() and 0xff
        sb.append(chars[b shr 4])
        sb.append(chars[b and 0x0f])
    }
    return sb.toString()
}

/** Random hex string for storage filenames. */
private fun generateRandomHex(length: Int = 16): String {
    val chars = "0123456789abcdef"
    return (1..length).map { chars[Random.nextInt(chars.length)] }.joinToString("")
}

@OptIn(ExperimentalSerializationApi::class)
fun createDzirentSupabaseClient(
    url: String = SupabaseBuildConfig.SUPABASE_URL,
    key: String = SupabaseBuildConfig.SUPABASE_PUBLISHABLE_KEY,
    sessionManager: SessionManager? = null
): SupabaseClient {
    return createSupabaseClient(
        supabaseUrl = url,
        supabaseKey = key
    ) {
        defaultSerializer = KotlinXSerializer(
            Json {
                ignoreUnknownKeys = true
                coerceInputValues = true
                encodeDefaults = false
            }
        )
        install(Auth) {
            this.sessionManager = sessionManager ?: runCatching { SettingsSessionManager() }.getOrElse { MemorySessionManager() }
            this.codeVerifierCache = runCatching { SettingsCodeVerifierCache() }.getOrElse { MemoryCodeVerifierCache() }
        }
        install(Postgrest)
        install(Storage)
        install(Realtime)
        install(Functions)
    }
}

class DzirentRepository(
    val client: SupabaseClient = createDzirentSupabaseClient()
) {
    val auth: Auth get() = client.auth
    val postgrest: Postgrest get() = client.postgrest
    val storage: Storage get() = client.storage
    val realtime: Realtime get() = client.realtime
    val functions: Functions get() = client.functions

    fun currentEmail(): String? = auth.currentUserOrNull()?.email

    private fun fail(operation: String, throwable: Throwable): DzirentException {
        if (throwable is DzirentException) return throwable
        val raw = throwable.message.orEmpty().lowercase()
        val message = when {
            "invalid login credentials" in raw -> "Email or password is incorrect."
            "email not confirmed" in raw -> "Please confirm your email first. Check your inbox for the link."
            "already registered" in raw || "already been registered" in raw || "user_already_exists" in raw ->
                "An account with this email already exists. Try logging in."
            "password should" in raw || "weak_password" in raw ->
                "That password is too weak. Use at least 6 characters."
            "rate limit" in raw || "too many requests" in raw ->
                "Too many attempts. Please try again later."
            "unable to resolve host" in raw || "failed to connect" in raw || "timeout" in raw || "timed out" in raw ->
                "Can't reach the server. Check your internet connection and try again."
            "row-level security" in raw || "permission denied" in raw || "jwt" in raw ->
                "Your session may have expired. Please log out and log in again."
            else -> "Couldn't $operation. Please try again."
        }
        return DzirentException(message)
    }

    private fun failBlockAware(operation: String, throwable: Throwable): DzirentException {
        val raw = throwable.message.orEmpty().lowercase()
        if ("row-level security" in raw) {
            return DzirentException(CANT_MESSAGE_USER)
        }
        return fail(operation, throwable)
    }

    val currentUserId: String? get() = auth.currentUserOrNull()?.id
    val currentEmail: String? get() = auth.currentUserOrNull()?.email

    suspend fun awaitAuth() {
        runCatching { auth.awaitInitialization() }
    }

    fun hasSession(): Boolean = auth.currentSessionOrNull() != null

    private fun requireUserId(): String =
        currentUserId ?: throw DzirentException("Your session may have expired. Please log out and log in again.")

    // =========================================================================
    // AUTHENTICATION
    // =========================================================================

    suspend fun signUp(
        emailStr: String,
        passwordStr: String,
        displayName: String,
        role: String,
        adultConfirmed: Boolean,
        city: UsCity?
    ): Profile? {
        try {
            auth.signUpWith(Email) {
                email = emailStr
                password = passwordStr
                data = buildJsonObject {
                    put("display_name", displayName)
                    put("role", role)
                    put("adult_confirmed", adultConfirmed)
                    if (city != null) {
                        put("city", city.label)
                        put("approx_lat", city.lat)
                        put("approx_lng", city.lng)
                    }
                }
            }
        } catch (e: Exception) {
            throw fail("create your account", e)
        }

        if (auth.currentSessionOrNull() == null) return null
        val userId = auth.currentUserOrNull()?.id ?: return null

        return try {
            if (city != null) {
                postgrest.from("profiles").update(
                    buildJsonObject {
                        put("city", city.label)
                        put("approx_lat", city.lat)
                        put("approx_lng", city.lng)
                    }
                ) {
                    filter { eq("id", userId) }
                }
            }
            getCurrentProfile()
        } catch (e: Exception) {
            throw fail("finish setting up your profile", e)
        }
    }

    suspend fun signIn(emailStr: String, passwordStr: String) {
        try {
            auth.signInWith(Email) {
                email = emailStr
                password = passwordStr
            }
        } catch (e: Exception) {
            throw fail("log in", e)
        }
    }

    suspend fun signOut() {
        try {
            auth.signOut()
        } catch (_: Exception) {
            try {
                auth.clearSession()
            } catch (clearEx: Exception) {
                throw fail("log out", clearEx)
            }
        }
    }

    suspend fun changePassword(current: String, new: String) {
        val emailStr = currentEmail ?: throw DzirentException("Your session may have expired. Please log out and log in again.")
        try {
            auth.signInWith(Email) {
                email = emailStr
                password = current
            }
        } catch (e: Exception) {
            if ("invalid login credentials" in e.message.orEmpty().lowercase()) {
                throw DzirentException("Your current password is incorrect.")
            }
            throw fail("check your password", e)
        }
        try {
            auth.updateUser { password = new }
        } catch (e: Exception) {
            if ("different from the old" in e.message.orEmpty().lowercase()) {
                throw DzirentException("Choose a password that's different from your current one.")
            }
            throw fail("change your password", e)
        }
    }

    suspend fun resetPassword(emailStr: String) {
        try {
            auth.resetPasswordForEmail(emailStr)
        } catch (e: Exception) {
            throw fail("send the reset email", e)
        }
    }

    // =========================================================================
    // SHOP WINDOW FUNCTIONS (PUBLIC & CROSS-USER)
    // =========================================================================

    suspend fun browseListings(
        lat: Double? = null,
        lng: Double? = null,
        radiusMiles: Double? = null,
        query: String? = null,
        category: String? = null,
        itemType: String? = null,
        garmentType: String? = null,
        size: String? = null,
        styles: List<String>? = null,
        startDate: String? = null,
        endDate: String? = null,
        minPrice: Double? = null,
        maxPrice: Double? = null,
        newDays: Int? = null,
        savedOnly: Boolean = false,
        savedStudiosOnly: Boolean = false,
        sort: String? = null,
        limit: Int = 20,
        offset: Int = 0
    ): List<ListingCard> {
        return try {
            postgrest.rpc(
                "browse_listings",
                buildJsonObject {
                    lat?.let { put("p_lat", it) }
                    lng?.let { put("p_lng", it) }
                    radiusMiles?.let { put("p_radius_miles", it) }
                    query?.takeIf { it.isNotBlank() }?.let { put("p_query", it) }
                    category?.let { put("p_category", it) }
                    itemType?.let { put("p_item_type", it) }
                    garmentType?.let { put("p_garment_type", it) }
                    size?.let { put("p_size", it) }
                    styles?.takeIf { it.isNotEmpty() }?.let {
                        put("p_styles", JsonArray(it.map { s -> JsonPrimitive(s) }))
                    }
                    startDate?.let { put("p_start_date", it) }
                    endDate?.let { put("p_end_date", it) }
                    minPrice?.let { put("p_min_price", it) }
                    maxPrice?.let { put("p_max_price", it) }
                    newDays?.let { put("p_new_days", it) }
                    if (savedOnly) put("p_saved_only", true)
                    if (savedStudiosOnly) put("p_saved_studios_only", true)
                    sort?.let { put("p_sort", it) }
                    put("p_limit", limit)
                    put("p_offset", offset)
                }
            ).decodeList<ListingCard>()
        } catch (e: Exception) {
            throw fail("browse listings", e)
        }
    }

    suspend fun getListing(listingId: String, lat: Double? = null, lng: Double? = null): ListingDetail? {
        return try {
            postgrest.rpc(
                "get_listing",
                buildJsonObject {
                    put("p_listing_id", listingId)
                    lat?.let { put("p_lat", it) }
                    lng?.let { put("p_lng", it) }
                }
            ).decodeList<ListingDetail>().firstOrNull()
        } catch (e: Exception) {
            throw fail("load listing details", e)
        }
    }

    suspend fun getStudio(handle: String, lat: Double? = null, lng: Double? = null): StudioDetail? {
        return try {
            postgrest.rpc(
                "get_studio",
                buildJsonObject {
                    put("p_handle", handle)
                    lat?.let { put("p_lat", it) }
                    lng?.let { put("p_lng", it) }
                }
            ).decodeList<StudioDetail>().firstOrNull()
        } catch (e: Exception) {
            throw fail("load studio", e)
        }
    }

    suspend fun fitListings(
        lat: Double? = null,
        lng: Double? = null,
        radiusMiles: Double? = null,
        limit: Int = 20,
        offset: Int = 0
    ): List<ListingCard> {
        return try {
            postgrest.rpc(
                "fit_listings",
                buildJsonObject {
                    lat?.let { put("p_lat", it) }
                    lng?.let { put("p_lng", it) }
                    radiusMiles?.let { put("p_radius_miles", it) }
                    put("p_limit", limit)
                    put("p_offset", offset)
                }
            ).decodeList<ListingCard>()
        } catch (e: Exception) {
            throw fail("load items that fit you", e)
        }
    }

    suspend fun myConversations(
        conversationId: String? = null,
        limit: Int = 20,
        offset: Int = 0
    ): List<ConversationCard> {
        return try {
            postgrest.rpc(
                "my_conversations",
                buildJsonObject {
                    conversationId?.let { put("p_conversation_id", it) }
                    put("p_limit", limit)
                    put("p_offset", offset)
                }
            ).decodeList<ConversationCard>()
        } catch (e: Exception) {
            throw fail("load your conversations", e)
        }
    }

    suspend fun mySavedStudios(
        lat: Double? = null,
        lng: Double? = null,
        limit: Int = 20,
        offset: Int = 0
    ): List<SavedStudioCard> {
        return try {
            postgrest.rpc(
                "my_saved_studios",
                buildJsonObject {
                    lat?.let { put("p_lat", it) }
                    lng?.let { put("p_lng", it) }
                    put("p_limit", limit)
                    put("p_offset", offset)
                }
            ).decodeList<SavedStudioCard>()
        } catch (e: Exception) {
            throw fail("load your saved studios", e)
        }
    }

    suspend fun searchCities(query: String, limit: Int = 20): List<UsCity> {
        return try {
            postgrest.rpc(
                "search_cities",
                buildJsonObject {
                    put("p_query", query)
                    put("p_limit", limit)
                }
            ).decodeList<UsCity>()
        } catch (e: Exception) {
            throw fail("search cities", e)
        }
    }

    // =========================================================================
    // ACTIONS & MODERATION (HANDLE-BASED)
    // =========================================================================

    suspend fun startConversation(listingId: String, start: String? = null, end: String? = null): String {
        return try {
            postgrest.rpc(
                "start_conversation",
                buildJsonObject {
                    put("p_listing_id", listingId)
                    start?.let { put("p_start", it) }
                    end?.let { put("p_end", it) }
                }
            ).decodeAs<String>()
        } catch (e: Exception) {
            throw failBlockAware("start conversation", e)
        }
    }

    suspend fun saveStudio(handle: String) {
        try {
            postgrest.rpc("save_studio", buildJsonObject { put("p_handle", handle) })
        } catch (e: Exception) {
            throw fail("save studio", e)
        }
    }

    suspend fun unsaveStudio(handle: String) {
        try {
            postgrest.rpc("unsave_studio", buildJsonObject { put("p_handle", handle) })
        } catch (e: Exception) {
            throw fail("unsave studio", e)
        }
    }

    suspend fun blockUser(handle: String) {
        try {
            postgrest.rpc("block_user", buildJsonObject { put("p_handle", handle) })
        } catch (e: Exception) {
            throw fail("block user", e)
        }
    }

    suspend fun unblockUser(handle: String) {
        try {
            postgrest.rpc("unblock_user", buildJsonObject { put("p_handle", handle) })
        } catch (e: Exception) {
            throw fail("unblock user", e)
        }
    }

    suspend fun reportUser(handle: String, reason: String, details: String? = null) {
        try {
            postgrest.rpc("report_user", buildJsonObject {
                put("p_handle", handle)
                put("p_reason", reason)
                details?.let { put("p_details", it) }
            })
        } catch (e: Exception) {
            throw fail("submit report", e)
        }
    }

    suspend fun setConversationDates(conversationId: String, start: String, end: String): Boolean {
        return try {
            postgrest.rpc(
                "set_conversation_dates",
                buildJsonObject {
                    put("p_conversation_id", conversationId)
                    put("p_start", start)
                    put("p_end", end)
                }
            )
            true
        } catch (_: Exception) {
            false
        }
    }

    suspend fun markConversationRead(conversationId: String) {
        try {
            postgrest.rpc("mark_conversation_read", buildJsonObject { put("p_conversation_id", conversationId) })
        } catch (_: Exception) {
        }
    }

    suspend fun markActivitySeen() {
        try {
            postgrest.rpc("mark_activity_seen")
        } catch (_: Exception) {
        }
    }

    suspend fun recordAccessoryDeclaration(fullLegalName: String, version: Int, appVersion: String) {
        try {
            postgrest.rpc(
                "record_accessory_declaration",
                buildJsonObject {
                    put("p_full_legal_name", fullLegalName)
                    put("p_declaration_version", version)
                    put("p_app_version", appVersion)
                }
            )
        } catch (e: Exception) {
            throw fail("save declaration", e)
        }
    }

    suspend fun recordListingDeclaration(listingId: String, version: Int) {
        try {
            postgrest.rpc(
                "record_listing_declaration",
                buildJsonObject {
                    put("p_listing_id", listingId)
                    put("p_declaration_version", version)
                }
            )
        } catch (e: Exception) {
            throw fail("save listing declaration", e)
        }
    }

    // =========================================================================
    // EDGE FUNCTIONS
    // =========================================================================

    suspend fun deleteListing(listingId: String) {
        try {
            functions.invoke("delete-listing", buildJsonObject {
                put("listing_id", listingId)
            })
        } catch (e: Exception) {
            throw fail("delete your listing", e)
        }
    }

    suspend fun deleteAccount() {
        try {
            functions.invoke("delete-account", buildJsonObject {})
        } catch (e: Exception) {
            throw fail("delete your account", e)
        }
    }

    // =========================================================================
    // OWNER DATA (RAW TABLES UNDER RLS)
    // =========================================================================

    // --- Profiles ---
    suspend fun getCurrentProfile(): Profile? {
        val uid = currentUserId ?: return null
        return try {
            postgrest.from("profiles")
                .select { filter { eq("id", uid) } }
                .decodeSingleOrNull<Profile>()
        } catch (e: Exception) {
            throw fail("load your profile", e)
        }
    }

    suspend fun updateProfile(profile: Profile) {
        val uid = requireUserId()
        try {
            postgrest.from("profiles").update(profile) {
                filter { eq("id", uid) }
            }
        } catch (e: Exception) {
            throw fail("save your profile", e)
        }
    }

    suspend fun updateRole(role: String): Profile {
        val uid = requireUserId()
        try {
            postgrest.from("profiles").update(buildJsonObject { put("role", role) }) {
                filter { eq("id", uid) }
            }
            return getCurrentProfile() ?: throw DzirentException("Couldn't load your profile.")
        } catch (e: Exception) {
            throw fail("update your role", e)
        }
    }

    suspend fun updateLocation(lat: Double, lng: Double, city: String): Profile {
        val uid = requireUserId()
        try {
            postgrest.from("profiles").update(
                buildJsonObject {
                    put("approx_lat", lat)
                    put("approx_lng", lng)
                    put("city", city)
                }
            ) {
                filter { eq("id", uid) }
            }
            return getCurrentProfile() ?: throw DzirentException("Couldn't load your profile.")
        } catch (e: Exception) {
            throw fail("save your location", e)
        }
    }

    suspend fun updateStudio(
        name: String?,
        handle: String?,
        bio: String?,
        styleTags: List<String>,
        pickupArea: String?
    ): Profile {
        val uid = requireUserId()
        try {
            postgrest.from("profiles").update(
                buildJsonObject {
                    put("studio_name", name?.ifBlank { null })
                    put("studio_handle", handle?.ifBlank { null })
                    put("studio_bio", bio?.ifBlank { null })
                    put("style_tags", buildJsonArray { styleTags.forEach { add(it) } })
                    put("pickup_area", pickupArea?.ifBlank { null })
                }
            ) {
                filter { eq("id", uid) }
            }
            return getCurrentProfile() ?: throw DzirentException("Couldn't load your profile.")
        } catch (e: Exception) {
            throw fail("save your studio", e)
        }
    }

    // --- Private Profiles ---
    suspend fun getPrivateProfile(): PrivateProfile {
        val uid = requireUserId()
        return try {
            postgrest.from("private_profiles")
                .select { filter { eq("user_id", uid) } }
                .decodeSingleOrNull<PrivateProfile>() ?: PrivateProfile(userId = uid)
        } catch (e: Exception) {
            throw fail("load your measurements", e)
        }
    }

    suspend fun saveBodyMeasurements(
        valuesCm: Map<BodyMeasurement, Double?>,
        fitProfile: FitProfile?,
        styleInterests: List<String>
    ): PrivateProfile {
        val uid = requireUserId()
        return try {
            postgrest.from("private_profiles").upsert(
                buildJsonObject {
                    put("user_id", uid)
                    valuesCm.forEach { (measurement, cm) -> put(measurement.column, cm) }
                    put("fit_profile", fitProfile?.dbValue)
                    put("style_interests", JsonArray(styleInterests.map { JsonPrimitive(it) }))
                }
            ) { select() }.decodeSingle<PrivateProfile>()
        } catch (e: Exception) {
            throw fail("save your measurements", e)
        }
    }

    // --- Listings (Own) ---
    suspend fun getMyListings(): List<Listing> {
        val uid = requireUserId()
        return try {
            val listings = postgrest.from("listings").select {
                filter { eq("lender_id", uid) }
                order("created_at", Order.DESCENDING)
            }.decodeList<Listing>()

            if (listings.isEmpty()) return emptyList()
            val ids = listings.map { it.id }

            val photos = postgrest.from("listing_photos").select {
                filter { isIn("listing_id", ids) }
                order("position", Order.ASCENDING)
            }.decodeList<ListingPhoto>().groupBy { it.listingId }

            val measurements = postgrest.from("listing_measurements").select {
                filter { isIn("listing_id", ids) }
            }.decodeList<ListingMeasurement>().groupBy { it.listingId }

            val availability = postgrest.from("availability").select {
                filter { isIn("listing_id", ids) }
                order("start_date", Order.ASCENDING)
            }.decodeList<Availability>().groupBy { it.listingId }

            listings.map { l ->
                l.copy(
                    photos = photos[l.id].orEmpty(),
                    measurements = measurements[l.id].orEmpty(),
                    availability = availability[l.id].orEmpty()
                )
            }
        } catch (e: Exception) {
            throw fail("load your listings", e)
        }
    }

    suspend fun getListingDetail(listingId: String): Listing? {
        val uid = requireUserId()
        return try {
            val listing = postgrest.from("listings").select {
                filter {
                    eq("id", listingId)
                    eq("lender_id", uid)
                }
            }.decodeSingleOrNull<Listing>() ?: return null

            val photos = postgrest.from("listing_photos").select {
                filter { eq("listing_id", listingId) }
                order("position", Order.ASCENDING)
            }.decodeList<ListingPhoto>()

            val measurements = postgrest.from("listing_measurements").select {
                filter { eq("listing_id", listingId) }
            }.decodeList<ListingMeasurement>()

            val availability = postgrest.from("availability").select {
                filter { eq("listing_id", listingId) }
                order("start_date", Order.ASCENDING)
            }.decodeList<Availability>()

            listing.copy(
                photos = photos,
                measurements = measurements,
                availability = availability
            )
        } catch (e: Exception) {
            throw fail("load listing details", e)
        }
    }

    suspend fun createListing(listing: Listing): Listing {
        val uid = requireUserId()
        return try {
            postgrest.from("listings").insert(listing.copy(lenderId = uid)) { select() }
                .decodeSingle<Listing>()
        } catch (e: Exception) {
            throw fail("create your listing", e)
        }
    }

    suspend fun updateListing(listing: Listing): Listing {
        val uid = requireUserId()
        return try {
            postgrest.from("listings").update(listing) {
                filter {
                    eq("id", listing.id)
                    eq("lender_id", uid)
                }
                select()
            }.decodeSingle<Listing>()
        } catch (e: Exception) {
            throw fail("update your listing", e)
        }
    }

    suspend fun setListingStatus(listingId: String, status: String) {
        val uid = requireUserId()
        try {
            postgrest.from("listings").update(buildJsonObject { put("status", status) }) {
                filter {
                    eq("id", listingId)
                    eq("lender_id", uid)
                }
            }
        } catch (e: Exception) {
            throw fail("update listing status", e)
        }
    }

    // --- Listing Photos ---
    suspend fun uploadListingPhoto(
        listingId: String,
        imageBytes: ByteArray,
        position: Int,
        slot: String? = null,
        compressor: ImageCompressor? = null
    ): ListingPhoto {
        val bytes = compressor?.compressImage(imageBytes) ?: imageBytes
        val photoUuid = generateUuid()
        val randomHex = generateRandomHex()
        val path = "$listingId/$randomHex.jpg"

        try {
            storage.from("listing-photos").upload(path, bytes) {
                upsert = false
            }
        } catch (e: Exception) {
            throw fail("upload photo file", e)
        }

        val photo = ListingPhoto(
            id = photoUuid,
            listingId = listingId,
            storagePath = path,
            position = position,
            slot = slot
        )

        try {
            postgrest.from("listing_photos").insert(photo)
        } catch (e: Exception) {
            runCatching { storage.from("listing-photos").delete(listOf(path)) }
            throw fail("save photo record", e)
        }
        return photo
    }

    suspend fun deleteListingPhoto(photo: ListingPhoto) {
        try {
            postgrest.from("listing_photos").delete { filter { eq("id", photo.id) } }
        } catch (e: Exception) {
            throw fail("remove photo record", e)
        }
        try {
            storage.from("listing-photos").delete(listOf(photo.storagePath))
        } catch (_: Exception) {
        }
    }

    suspend fun updatePhotoPositions(photos: List<ListingPhoto>) {
        try {
            photos.forEach { p ->
                postgrest.from("listing_photos").update(buildJsonObject {
                    put("position", p.position)
                    put("slot", p.slot)
                }) {
                    filter { eq("id", p.id) }
                }
            }
        } catch (e: Exception) {
            throw fail("update photo positions", e)
        }
    }

    // --- Listing Measurements ---
    suspend fun saveListingMeasurements(listingId: String, measurements: List<ListingMeasurement>) {
        try {
            postgrest.from("listing_measurements").delete { filter { eq("listing_id", listingId) } }
            if (measurements.isNotEmpty()) {
                postgrest.from("listing_measurements").insert(measurements.map { m ->
                    m.copy(id = m.id ?: generateUuid(), listingId = listingId)
                })
            }
        } catch (e: Exception) {
            throw fail("save measurements", e)
        }
    }

    // --- Availability ---
    suspend fun saveAvailability(listingId: String, ranges: List<Availability>) {
        try {
            postgrest.from("availability").delete { filter { eq("listing_id", listingId) } }
            if (ranges.isNotEmpty()) {
                postgrest.from("availability").insert(ranges.map { a ->
                    a.copy(id = a.id ?: generateUuid(), listingId = listingId)
                })
            }
        } catch (e: Exception) {
            throw fail("save availability", e)
        }
    }

    // --- Saved Pieces ---
    suspend fun hasSavedListing(listingId: String): Boolean {
        val uid = currentUserId ?: return false
        return try {
            postgrest.from("saved_listings").select(Columns.list("listing_id")) {
                filter {
                    eq("user_id", uid)
                    eq("listing_id", listingId)
                }
            }.decodeList<JsonObject>().isNotEmpty()
        } catch (_: Exception) {
            false
        }
    }

    suspend fun saveListing(listingId: String) {
        val uid = requireUserId()
        try {
            postgrest.from("saved_listings").upsert(
                buildJsonObject {
                    put("user_id", uid)
                    put("listing_id", listingId)
                }
            ) { ignoreDuplicates = true }
        } catch (e: Exception) {
            throw fail("save piece", e)
        }
        recordListingEvent(listingId, ListingEvents.SAVE)
    }

    suspend fun unsaveListing(listingId: String) {
        val uid = requireUserId()
        try {
            postgrest.from("saved_listings").delete {
                filter {
                    eq("user_id", uid)
                    eq("listing_id", listingId)
                }
            }
        } catch (e: Exception) {
            throw fail("remove saved piece", e)
        }
    }

    suspend fun isListingSaved(listingId: String): Boolean {
        val uid = currentUserId ?: return false
        return try {
            postgrest.from("saved_listings").select {
                filter {
                    eq("user_id", uid)
                    eq("listing_id", listingId)
                }
            }.decodeList<SavedListing>().isNotEmpty()
        } catch (_: Exception) {
            false
        }
    }

    // --- Messages & Chat ---
    suspend fun getConversation(conversationId: String): Conversation? {
        val uid = requireUserId()
        return try {
            postgrest.from("conversations").select {
                filter {
                    eq("id", conversationId)
                    or {
                        eq("renter_id", uid)
                        eq("lender_id", uid)
                    }
                }
            }.decodeSingleOrNull<Conversation>()
        } catch (e: Exception) {
            throw fail("load conversation", e)
        }
    }

    suspend fun getMessages(conversationId: String): List<Message> {
        return try {
            postgrest.from("messages").select {
                filter { eq("conversation_id", conversationId) }
                order("created_at", Order.ASCENDING)
            }.decodeList<Message>()
        } catch (e: Exception) {
            throw fail("load messages", e)
        }
    }

    suspend fun sendMessage(conversationId: String, text: String): Message {
        val uid = requireUserId()
        return try {
            val msg = Message(
                id = generateUuid(),
                conversationId = conversationId,
                senderId = uid,
                body = text
            )
            postgrest.from("messages").insert(msg) { select() }.decodeSingle<Message>()
        } catch (e: Exception) {
            throw failBlockAware("send message", e)
        }
    }

    suspend fun subscribeToChat(conversationId: String): ChatSubscription {
        val channel = realtime.channel("chat_$conversationId")
        val messages = channel.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
            table = "messages"
            filter("conversation_id", FilterOperator.EQ, conversationId)
        }.mapNotNull { action ->
            runCatching { action.decodeRecord<Message>() }.getOrNull()
        }

        val rentals = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "rentals"
            filter("conversation_id", FilterOperator.EQ, conversationId)
        }.mapNotNull { action ->
            (action as? HasRecord)?.decodeRecordOrNull<Rental>()
        }

        try {
            channel.subscribe()
        } catch (e: Exception) {
            runCatching { realtime.removeChannel(channel) }
            throw fail("connect to live chat", e)
        }

        return ChatSubscription(messages, rentals) {
            runCatching { realtime.removeChannel(channel) }
        }
    }

    // --- Rentals ---
    suspend fun getRental(conversationId: String): Rental? {
        return try {
            postgrest.from("rentals").select {
                filter { eq("conversation_id", conversationId) }
            }.decodeSingleOrNull<Rental>()
        } catch (e: Exception) {
            throw fail("load rental status", e)
        }
    }

    suspend fun getMyRentals(): List<Rental> {
        val uid = requireUserId()
        return try {
            postgrest.from("rentals").select {
                filter {
                    or {
                        eq("renter_id", uid)
                        eq("lender_id", uid)
                    }
                }
                order("updated_at", Order.DESCENDING)
            }.decodeList<Rental>()
        } catch (e: Exception) {
            throw fail("load your rentals", e)
        }
    }

    suspend fun getRentedOutListingIds(): Set<String> {
        val uid = requireUserId()
        return try {
            postgrest.from("rentals").select {
                filter {
                    eq("lender_id", uid)
                    eq("status", "active")
                }
            }.decodeList<Rental>().map { it.listingId }.toSet()
        } catch (_: Exception) {
            emptySet()
        }
    }

    suspend fun saveRental(
        conversationId: String,
        listingId: String,
        renterId: String,
        lenderId: String,
        status: String,
        startDate: String?,
        endDate: String?
    ): Rental {
        val uid = requireUserId()
        val changes = buildJsonObject {
            put("status", status)
            put("updated_by", uid)
            if (startDate != null && endDate != null) {
                put("start_date", startDate)
                put("end_date", endDate)
            }
        }

        return try {
            val existing = getRental(conversationId)
            if (existing?.id != null) {
                postgrest.from("rentals").update(changes) {
                    filter { eq("id", existing.id) }
                    select()
                }.decodeSingle<Rental>()
            } else {
                postgrest.from("rentals").insert(
                    buildJsonObject {
                        put("conversation_id", conversationId)
                        put("listing_id", listingId)
                        put("renter_id", renterId)
                        put("lender_id", lenderId)
                        changes.forEach { (k, v) -> put(k, v) }
                    }
                ) { select() }.decodeSingle<Rental>()
            }
        } catch (e: Exception) {
            throw fail("update rental", e)
        }
    }

    // --- Rental Outcomes ---
    suspend fun getMyRentalOutcome(conversationId: String): RentalOutcome? {
        val uid = requireUserId()
        return try {
            postgrest.from("rental_outcomes").select {
                filter {
                    eq("conversation_id", conversationId)
                    eq("user_id", uid)
                }
            }.decodeSingleOrNull<RentalOutcome>()
        } catch (e: Exception) {
            throw fail("load rental outcome", e)
        }
    }

    suspend fun submitRentalOutcome(conversationId: String, happened: Boolean): RentalOutcome {
        val uid = requireUserId()
        val outcome = RentalOutcome(
            conversationId = conversationId,
            userId = uid,
            happened = happened
        )
        return try {
            postgrest.from("rental_outcomes").upsert(outcome) { select() }
                .decodeSingle<RentalOutcome>()
        } catch (e: Exception) {
            throw fail("save rental outcome", e)
        }
    }

    // --- Blocks (Own list) ---
    suspend fun getMyBlockedUsers(): List<Block> {
        val uid = requireUserId()
        return try {
            postgrest.from("blocks").select {
                filter { eq("blocker_id", uid) }
            }.decodeList<Block>()
        } catch (e: Exception) {
            throw fail("load blocked users", e)
        }
    }

    suspend fun unblockUserById(blockedId: String) {
        val uid = requireUserId()
        try {
            postgrest.from("blocks").delete {
                filter {
                    eq("blocker_id", uid)
                    eq("blocked_id", blockedId)
                }
            }
        } catch (e: Exception) {
            throw fail("unblock this user", e)
        }
    }

    suspend fun haveIBlocked(otherId: String): Boolean {
        val uid = currentUserId ?: return false
        return try {
            val blocks = postgrest.from("blocks").select {
                filter {
                    eq("blocker_id", uid)
                    eq("blocked_id", otherId)
                }
            }.decodeList<Block>()
            blocks.isNotEmpty()
        } catch (_: Exception) {
            false
        }
    }

    // --- Reports ---
    suspend fun submitReport(targetType: String, targetId: String, reason: String, details: String? = null): Report {
        val uid = requireUserId()
        val report = Report(
            reporterId = uid,
            targetType = targetType,
            targetId = targetId,
            reason = reason,
            details = details
        )
        return try {
            postgrest.from("reports").insert(report) { select() }.decodeSingle<Report>()
        } catch (e: Exception) {
            throw fail("submit report", e)
        }
    }

    // --- Accessory Declarations ---
    suspend fun hasAccessoryDeclaration(version: Int): Boolean {
        val uid = currentUserId ?: return false
        return try {
            postgrest.from("accessory_declarations").select(Columns.list("id")) {
                filter {
                    eq("user_id", uid)
                    eq("declaration_version", version)
                }
                limit(1)
            }.decodeList<JsonObject>().isNotEmpty()
        } catch (_: Exception) {
            false
        }
    }

    // --- Events & Suggestions ---
    suspend fun recordListingEvent(listingId: String, type: String) {
        val uid = currentUserId ?: return
        try {
            postgrest.from("listing_events").insert(
                buildJsonObject {
                    put("user_id", uid)
                    put("listing_id", listingId)
                    put("type", type)
                }
            )
        } catch (_: Exception) {
        }
    }

    suspend fun logSuggestionEvents(events: List<SuggestionEvent>) {
        val uid = currentUserId ?: return
        if (events.isEmpty()) return
        try {
            postgrest.from("suggestion_events").insert(events.map { e ->
                buildJsonObject {
                    put("user_id", uid)
                    put("listing_id", e.listingId)
                    put("field", e.field)
                    put("label", e.label)
                    put("action", e.action)
                }
            })
        } catch (_: Exception) {
        }
    }
}

