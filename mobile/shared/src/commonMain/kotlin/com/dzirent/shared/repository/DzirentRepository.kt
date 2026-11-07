package com.dzirent.shared.repository

import com.dzirent.shared.util.*
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
import io.github.jan.supabase.exceptions.RestException
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import com.dzirent.shared.util.DataExport
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
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.transformWhile
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import kotlin.random.Random

/** User-friendly exception safe for display in UI. */
/** A message for the person. [field] is the database column a refusal is about (its HINT), if any. */
class DzirentException(message: String, val field: String? = null) : Exception(message)

const val CANT_MESSAGE_USER = "You can't message this user."

/** How the database's plain-words refusals start (supabase/migrations); these reach the lender as they are. */
private val DATABASE_MESSAGES = listOf(
    "This listing can't be published yet",
    "Check the photos before publishing",
    "The photo check is still running",
    "The photos changed after they were checked",
    "Too many photo checks",
    "Add a photo first",
    "Sign the accessory declaration",
    "Give consent before saving your measurements",
    // The text filter (P2A); its HINT names the field.
    "This text includes language that isn't allowed",
    "Please remove contact details",
    // Admin actions (P2B).
    "Your account is suspended",
    "This listing is hidden by Dzirent",
    "You can only report messages in your own chats",
    // Age gate (P2C).
    "Dzirent is only for people 18 and older"
)

/** How often the editor asks for a scan's state when Realtime hasn't sent it. */
private const val SCAN_POLL_MS = 4_000L

/** Live chat subscription handle. */
@Serializable
private data class ConversationIdRow(@SerialName("conversation_id") val conversationId: String)

@Serializable
private data class AppSettingRow(val key: String, val enabled: Boolean)

/** Everything Inbox and its dot need: my chats, which are unread, and Activity. */
data class InboxSnapshot(
    val conversations: List<Conversation>,
    val unreadIds: Set<String>,
    val activity: List<ActivityItem>
) {
    /** Shows the dot on the Inbox tab. */
    val hasNews: Boolean get() = unreadIds.isNotEmpty() || activity.any { it.isNew }
}

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
    companion object {
        /**
         * The app's one client per process, shared by the screens and the Android push
         * service. Two clients would each refresh the saved session and sign each other out.
         */
        val shared: DzirentRepository by lazy { DzirentRepository() }
    }

    val auth: Auth get() = client.auth
    val postgrest: Postgrest get() = client.postgrest
    val storage: Storage get() = client.storage
    val realtime: Realtime get() = client.realtime
    val functions: Functions get() = client.functions

    fun currentEmail(): String? = auth.currentUserOrNull()?.email

    private fun fail(operation: String, throwable: Throwable): DzirentException {
        if (throwable is DzirentException) return throwable
        // The database's own plain-words refusals (publish gate, photo checks, declaration) are shown as they are.
        (throwable as? RestException)?.let { rest ->
            val said = rest.error.trim()
            if (DATABASE_MESSAGES.any { said.startsWith(it) }) {
                return DzirentException(said, field = rest.description?.trim()?.ifBlank { null })
            }
        }
        val raw = throwable.message.orEmpty().lowercase()
        val message = when {
            "invalid login credentials" in raw -> "Email or password is incorrect."
            "email not confirmed" in raw -> "Please confirm your email first. Check your inbox for the link."
            "already registered" in raw || "already been registered" in raw || "user_already_exists" in raw ->
                "An account with this email already exists. Try logging in."
            "password should" in raw || "weak_password" in raw ->
                "That password is too weak. Use at least $PASSWORD_MIN_LENGTH characters."
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
        // The downloaded data file (kept in memory for a retry) goes with the session.
        DataExport.forget()
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

    // --- Text filter (P2A) ---
    /**
     * The database's refusal for [text] written in [where] ("listing", "profile", "message" or
     * "report"), or null when it's fine. Saving runs the same check; this is for asking first
     * (sign-up's display name). Works signed out.
     */
    suspend fun checkText(text: String, where: String): String? = try {
        val answer = postgrest.rpc("check_text", buildJsonObject {
            put("p_text", text)
            put("p_where", where)
        }).decodeAs<kotlinx.serialization.json.JsonElement>()
        (answer as? JsonPrimitive)?.takeIf { it.isString }?.content
    } catch (e: Exception) {
        throw fail("check your text", e)
    }

    // --- Terms of Use and Privacy Policy ---
    /** True while I haven't accepted the current version of the Terms of Use or Privacy Policy. */
    suspend fun needsLegalAcceptance(): Boolean = try {
        postgrest.rpc("needs_legal_acceptance").decodeAs<Boolean>()
    } catch (e: Exception) {
        throw fail("check the terms", e)
    }

    /** Records that I accept the current Terms of Use and Privacy Policy, from [platform] ("android" or "ios"). */
    suspend fun acceptLegal(platform: String) {
        try {
            postgrest.rpc("accept_legal", buildJsonObject { put("p_platform", platform) })
        } catch (e: Exception) {
            throw fail("save your agreement", e)
        }
    }

    // --- Measurements consent ---
    /** Lets my body measurements be saved (needed before the first one). */
    suspend fun giveMeasurementsConsent() {
        try {
            postgrest.rpc("give_measurements_consent")
        } catch (e: Exception) {
            throw fail("save your consent", e)
        }
    }

    /** Withdraws the consent; the server deletes my saved body measurements with it. */
    suspend fun withdrawMeasurementsConsent() {
        try {
            postgrest.rpc("withdraw_measurements_consent")
        } catch (e: Exception) {
            throw fail("withdraw your consent", e)
        }
    }

    // --- Age gate (P2C) ---
    /**
     * Records what the app store said about my age ([source] "store_signal" or "self_declared",
     * [result] "adult", "minor" or "unknown", [platform] "android" or "ios"). Returns true when my
     * account is blocked afterwards (Dzirent is 18+).
     */
    suspend fun recordAgeCheck(source: String, result: String, platform: String): Boolean = try {
        postgrest.rpc(
            "record_age_check",
            buildJsonObject {
                put("p_source", source)
                put("p_result", result)
                put("p_platform", platform)
            }
        ).decodeAs<Boolean>()
    } catch (e: Exception) {
        throw fail("check your age", e)
    }

    // --- Push notifications ---
    /** This phone's push token now gets my notifications (it moves from whoever had it). */
    suspend fun registerPushToken(token: String, platform: String) {
        try {
            postgrest.rpc(
                "register_push_token",
                buildJsonObject {
                    put("p_token", token)
                    put("p_platform", platform)
                }
            )
        } catch (e: Exception) {
            throw fail("turn on notifications", e)
        }
    }

    /** This phone stops getting my notifications (before signing out). */
    suspend fun unregisterPushToken(token: String) {
        try {
            postgrest.rpc("unregister_push_token", buildJsonObject { put("p_token", token) })
        } catch (e: Exception) {
            throw fail("turn off notifications", e)
        }
    }

    suspend fun getNotificationSettings(): NotificationSettings {
        val uid = requireUserId()
        return try {
            postgrest.from("notification_settings")
                .select { filter { eq("user_id", uid) } }
                .decodeSingleOrNull<NotificationSettings>() ?: NotificationSettings()
        } catch (e: Exception) {
            throw fail("load your notification settings", e)
        }
    }

    suspend fun saveNotificationSettings(settings: NotificationSettings) {
        val uid = requireUserId()
        try {
            postgrest.from("notification_settings").upsert(
                buildJsonObject {
                    put("user_id", uid)
                    put("messages", settings.messages)
                    put("show_message_text", settings.showMessageText)
                }
            )
        } catch (e: Exception) {
            throw fail("save your notification settings", e)
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

    /**
     * Download my data (P3A): the export-my-data function's JSON file, as text. Once a day: a
     * second try within 24 hours is refused with the server's plain sentence.
     */
    suspend fun exportMyData(): String {
        val response = try {
            functions.invoke("export-my-data", buildJsonObject {})
        } catch (e: Exception) {
            val rest = e as? RestException
            val said = DataExport.refusal(listOfNotNull(rest?.error, rest?.description, e.message).joinToString(" "))
            throw if (said != null) DzirentException(said) else fail("download your data", e)
        }
        val text = response.bodyAsText()
        if (!response.status.isSuccess()) {
            throw DzirentException(DataExport.refusal(text) ?: "Couldn't prepare your data. Please try again.")
        }
        return text
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
            throw fail("load your closet", e)
        }
    }

    /** My own listing with all its rows, or null if it isn't mine (owner-only read). */
    suspend fun getMyListing(listingId: String): Listing? {
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
            throw fail("load this listing", e)
        }
    }

    /** Inserts the listing row only. Callers insert it as 'paused' and activate it last. */
    suspend fun createListing(listing: Listing): Listing {
        val uid = requireUserId()
        val row = listing.copy(lenderId = uid, photos = emptyList(), measurements = emptyList(), availability = emptyList(), lender = null, distanceKm = null)
        return try {
            postgrest.from("listings").insert(row)
            row
        } catch (e: Exception) {
            throw fail("save your listing", e)
        }
    }

    /** Updates the fields the lender can edit (location and owner never change here). */
    suspend fun updateListingDetails(listing: Listing, status: String) {
        try {
            postgrest.from("listings").update(
                buildJsonObject {
                    put("title", listing.title)
                    put("category", listing.category)
                    put("item_type", listing.itemType)
                    put("size_label", listing.sizeLabel)
                    put("description", listing.description)
                    put("price_usd", listing.priceUsd)
                    put("price_note", listing.priceNote)
                    put("retail_value", listing.retailValue)
                    put("deposit_note", listing.depositNote)
                    put("listing_styles", JsonArray(listing.listingStyles.map { JsonPrimitive(it) }))
                    put("garment_type", listing.garmentType)
                    // Only ever set here; a trigger keeps owners from clearing it.
                    if (listing.aiReviewNeeded) put("ai_review_needed", true)
                    put("status", status)
                }
            ) {
                filter { eq("id", listing.id) }
            }
        } catch (e: Exception) {
            throw fail("save your listing", e)
        }
    }

    /** Replaces all measurements of a listing (safe to repeat on retry). */
    suspend fun replaceMeasurements(listingId: String, measurements: List<ListingMeasurement>) {
        try {
            postgrest.from("listing_measurements").delete { filter { eq("listing_id", listingId) } }
            if (measurements.isNotEmpty()) postgrest.from("listing_measurements").insert(measurements)
        } catch (e: Exception) {
            throw fail("save the measurements", e)
        }
    }

    /** Replaces all availability ranges of a listing (safe to repeat on retry). */
    suspend fun replaceAvailability(listingId: String, ranges: List<Availability>) {
        try {
            postgrest.from("availability").delete { filter { eq("listing_id", listingId) } }
            if (ranges.isNotEmpty()) postgrest.from("availability").insert(ranges)
        } catch (e: Exception) {
            throw fail("save the available dates", e)
        }
    }

    suspend fun toggleListingStatus(id: String, newStatus: String) {
        try {
            postgrest.from("listings").update(buildJsonObject { put("status", newStatus) }) {
                filter { eq("id", id) }
            }
        } catch (e: Exception) {
            throw fail("update your listing", e)
        }
    }

    suspend fun updatePhotoPosition(photoId: String, position: Int, slot: String?) {
        try {
            postgrest.from("listing_photos").update(buildJsonObject {
                put("position", position)
                put("slot", slot)
            }) {
                filter { eq("id", photoId) }
            }
        } catch (e: Exception) {
            throw fail("save the photo order", e)
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
    /**
     * Uploads one already-compressed photo and adds its row. Photo paths are the listing id and
     * a fresh random name, never a user id.
     */
    suspend fun uploadListingPhoto(
        listingId: String,
        imageBytes: ByteArray,
        position: Int,
        slot: String?
    ): ListingPhoto {
        val photoUuid = generateUuid()
        val path = "$listingId/${generateRandomHex()}.jpg"
        try {
            // Filenames are fresh; upsert would need an UPDATE policy the bucket doesn't grant.
            storage.from("listing-photos").upload(path, imageBytes) {
                upsert = false
            }
        } catch (e: Exception) {
            throw fail("upload the photo", e)
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
            // Don't leave an orphaned file behind if the row couldn't be saved.
            runCatching { storage.from("listing-photos").delete(listOf(path)) }
            throw fail("upload the photo", e)
        }
        return photo
    }

    /** Deletes the photo row, then its file. A leftover file is ignored. */
    suspend fun deleteListingPhoto(photo: ListingPhoto) {
        try {
            postgrest.from("listing_photos").delete { filter { eq("id", photo.id) } }
        } catch (e: Exception) {
            throw fail("remove the photo", e)
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

    // --- Rental Outcomes ---
    // --- Blocks (Own list) ---
    suspend fun getMyBlockedUsers(): List<Block> {
        val uid = requireUserId()
        return try {
            val items = postgrest.rpc("my_blocked_users").decodeList<BlockedUserItem>()
            items.map { item ->
                Block(
                    blockerId = uid,
                    blockedId = item.blockedId,
                    blocked = Profile(
                        id = item.blockedId,
                        displayName = item.displayName,
                        city = item.city.orEmpty()
                    )
                )
            }
        } catch (e: Exception) {
            throw fail("load blocked users", e)
        }
    }

    suspend fun getBlockedUsers(blockerId: String): List<Block> = getMyBlockedUsers()

    suspend fun unblockUser(blockerId: String, blockedId: String) = unblockUserById(blockedId)

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

    // =========================================================================
    // PHOTO CHECKS (server side; the listing's owner asks and reads)
    // =========================================================================

    /** The feature flags (app_settings, readable by everyone); missing flags are off. */
    suspend fun getAppSettings(): Map<String, Boolean> = try {
        postgrest.from("app_settings").select(Columns.list("key", "enabled"))
            .decodeList<AppSettingRow>().associate { it.key to it.enabled }
    } catch (e: Exception) {
        throw fail("load the app settings", e)
    }

    /**
     * The photo check of the listing's current photos: the one already running, the latest one
     * if it covers these photos, or a new one (request_scan). Returns its id.
     */
    suspend fun requestScan(listingId: String): String = try {
        postgrest.rpc("request_scan", buildJsonObject { put("p_listing_id", listingId) }).decodeAs<String>()
    } catch (e: Exception) {
        throw fail("check your photos", e)
    }

    suspend fun getListingScan(scanId: String): ListingScan? = try {
        postgrest.from("listing_scans").select {
            filter { eq("id", scanId) }
        }.decodeSingleOrNull<ListingScan>()
    } catch (e: Exception) {
        throw fail("load the photo check", e)
    }

    /** The server's per-photo warnings of a finished check. */
    suspend fun getPhotoScans(scanId: String): List<PhotoScanRow> = try {
        postgrest.from("photo_scans").select(Columns.list("photo_id", "warnings", "decision")) {
            filter { eq("scan_id", scanId) }
        }.decodeList<PhotoScanRow>()
    } catch (e: Exception) {
        throw fail("load the photo check", e)
    }

    /**
     * The scan each time it changes, ending with the finished one: live through Realtime, with a
     * read every few seconds as the fallback (Realtime can be slow to connect or blocked).
     */
    fun watchScan(scanId: String): Flow<ListingScan> = channelFlow {
        val channel = realtime.channel("scan_$scanId")
        try {
            val live = channel.postgresChangeFlow<PostgresAction.Update>(schema = "public") {
                table = "listing_scans"
                filter("id", FilterOperator.EQ, scanId)
            }
            launch {
                live.collect { action -> action.decodeRecordOrNull<ListingScan>()?.let { send(it) } }
            }
            runCatching { channel.subscribe() }
            while (true) {
                runCatching { getListingScan(scanId) }.getOrNull()?.let { send(it) }
                delay(SCAN_POLL_MS)
            }
        } finally {
            withContext(NonCancellable) { runCatching { realtime.removeChannel(channel) } }
        }
    }.distinctUntilChanged().transformWhile { scan ->
        emit(scan)
        !scan.finished
    }

    // =========================================================================
    // INBOX, CHAT & RENTALS (participant rows; names and titles from my_conversations)
    // =========================================================================

    /** All my conversation cards from my_conversations (pages of 30). */
    private suspend fun allConversationCards(): List<ConversationCard> {
        val cards = mutableListOf<ConversationCard>()
        while (true) {
            val page = myConversations(limit = 30, offset = cards.size)
            cards += page
            if (page.size < 30 || cards.size >= 600) break
        }
        return cards
    }

    /** The listing and the other person, as far as the shop window shows them. */
    private fun Conversation.withCard(card: ConversationCard?, me: String): Conversation {
        if (card == null) return this
        val other = Profile(id = otherUserId(me), displayName = card.otherName, studioHandle = card.otherHandle)
        return copy(
            listing = cardListing(card, lenderId),
            renter = if (renterId == me) null else other,
            lender = if (lenderId == me) null else other
        )
    }

    private fun cardListing(card: ConversationCard, lenderId: String): Listing? =
        card.listingTitle.takeIf { it.isNotBlank() }?.let { title ->
            Listing(
                id = card.listingId,
                lenderId = lenderId,
                title = title,
                category = "",
                priceUsd = card.price,
                approxLat = 0.0,
                approxLng = 0.0,
                photos = listOfNotNull(card.coverPhotoPath?.let { ListingPhoto(id = "", listingId = card.listingId, storagePath = it, position = 0) })
            )
        }

    /** My conversations with the latest message embedded, newest activity first. */
    suspend fun getConversations(): List<Conversation> {
        val me = requireUserId()
        return try {
            val cards = allConversationCards().associateBy { it.id }
            postgrest.from("conversations").select(
                Columns.raw("*, messages(id, conversation_id, sender_id, body, created_at)")
            ) {
                filter {
                    or {
                        eq("renter_id", me)
                        eq("lender_id", me)
                    }
                }
                order("created_at", Order.DESCENDING, referencedTable = "messages")
                limit(1, referencedTable = "messages")
            }.decodeList<Conversation>()
                // my_conversations leaves out chats with someone blocked, so they're left out here too.
                .filter { it.id in cards }
                .map { it.withCard(cards[it.id], me) }
                .sortedByDescending { timestampMillis(it.lastMessage?.createdAt ?: it.createdAt) }
        } catch (e: Exception) {
            throw fail("load your messages", e)
        }
    }

    /** Conversations with unread flags plus Activity (rental changes and follow-ups). */
    suspend fun getInboxSnapshot(): InboxSnapshot {
        val me = requireUserId()
        val conversations = getConversations()
        return try {
            val unread = allConversationCards().filter { it.unread }.map { it.id }.toSet()
            val byId = conversations.associateBy { it.id }
            val rentals = postgrest.from("rentals").select {
                filter {
                    or {
                        eq("renter_id", me)
                        eq("lender_id", me)
                    }
                }
            }.decodeList<Rental>().map { rental ->
                val conv = byId[rental.conversationId]
                rental.copy(listing = conv?.listing, lender = conv?.lender, renter = conv?.renter)
            }
            val answered = postgrest.from("rental_outcomes").select(Columns.list("conversation_id")) {
                filter { eq("user_id", me) }
            }.decodeList<ConversationIdRow>().map { it.conversationId }.toSet()
            val seenAt = getPrivateProfile().activitySeenAt
            InboxSnapshot(
                conversations = conversations,
                unreadIds = unread.filter { it in byId }.toSet(),
                activity = buildActivity(me, conversations, rentals, answered, seenAt)
            )
        } catch (e: Exception) {
            throw fail("load your messages", e)
        }
    }

    suspend fun setConversationDates(conversationId: String, dates: DateRange): Boolean =
        setConversationDates(conversationId, dates.start.toString(), dates.end.toString())

    suspend fun getConversation(conversationId: String): Conversation {
        val me = requireUserId()
        return try {
            val conversation = postgrest.from("conversations").select {
                filter { eq("id", conversationId) }
            }.decodeSingle<Conversation>()
            conversation.withCard(myConversations(conversationId = conversationId).firstOrNull(), me)
        } catch (e: Exception) {
            throw fail("open the chat", e)
        }
    }

    /** Sends a message and returns the saved row (with the server's id and time). */
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
            throw failBlockAware("send your message", e)
        }
    }

    /** Rentals where I am the renter, with the listing and the lender from my conversations. */
    suspend fun getMyRentals(): List<Rental> {
        val me = requireUserId()
        return try {
            val cards = allConversationCards().associateBy { it.id }
            postgrest.from("rentals").select {
                filter { eq("renter_id", me) }
                order("updated_at", Order.DESCENDING)
            }.decodeList<Rental>().map { rental ->
                val card = cards[rental.conversationId]
                rental.copy(
                    listing = card?.let { cardListing(it, rental.lenderId) },
                    lender = card?.let { Profile(id = rental.lenderId, displayName = it.otherName, studioHandle = it.otherHandle) }
                )
            }
        } catch (e: Exception) {
            throw fail("load your rentals", e)
        }
    }

    suspend fun getRental(conversationId: String): Rental? {
        return try {
            postgrest.from("rentals").select {
                filter { eq("conversation_id", conversationId) }
            }.decodeSingleOrNull<Rental>()
        } catch (e: Exception) {
            throw fail("load the rental status", e)
        }
    }

    /**
     * Creates or updates the rental row for a conversation. Dates are only changed when
     * given. If the other person created the row a moment earlier, this updates it instead.
     */
    suspend fun saveRental(
        conversation: Conversation,
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
        suspend fun update(rentalId: String): Rental =
            postgrest.from("rentals").update(changes) {
                filter { eq("id", rentalId) }
                select()
            }.decodeSingle<Rental>()

        return try {
            val existing = getRental(conversation.id)
            if (existing?.id != null) {
                update(existing.id)
            } else {
                try {
                    postgrest.from("rentals").insert(
                        buildJsonObject {
                            put("conversation_id", conversation.id)
                            put("listing_id", conversation.listingId)
                            put("renter_id", conversation.renterId)
                            put("lender_id", conversation.lenderId)
                            changes.forEach { (key, value) -> put(key, value) }
                        }
                    ) { select() }.decodeSingle<Rental>()
                } catch (insertEx: Exception) {
                    val raced = getRental(conversation.id)?.id ?: throw insertEx
                    update(raced)
                }
            }
        } catch (e: Exception) {
            throw fail("update the rental", e)
        }
    }

    /** My answer to "Did this rental happen?" for a conversation, if any. */
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
            throw fail("load your answer", e)
        }
    }

    suspend fun submitRentalOutcome(outcome: RentalOutcome) {
        try {
            postgrest.from("rental_outcomes").upsert(outcome)
        } catch (e: Exception) {
            throw fail("save your answer", e)
        }
    }

    /** Blocks a chat partner by account id (chat rows carry them; my own blocks row). */
    suspend fun blockUserById(blockedId: String) {
        val uid = requireUserId()
        try {
            // Blocking twice is harmless: the primary key makes the second insert a no-op.
            postgrest.from("blocks").upsert(Block(uid, blockedId)) { ignoreDuplicates = true }
        } catch (e: Exception) {
            throw fail("block this user", e)
        }
    }

    /** True if I blocked this user (not whether they blocked me). */
    suspend fun haveIBlocked(otherId: String): Boolean {
        val uid = requireUserId()
        return try {
            postgrest.from("blocks").select(Columns.list("blocker_id")) {
                filter {
                    eq("blocker_id", uid)
                    eq("blocked_id", otherId)
                }
            }.decodeList<JsonObject>().isNotEmpty()
        } catch (e: Exception) {
            throw fail("load your blocked users", e)
        }
    }

    /** A report on a listing, user or message by id (my own reports row). */
    suspend fun report(report: Report) {
        try {
            postgrest.from("reports").insert(report.copy(reporterId = requireUserId()))
        } catch (e: Exception) {
            throw fail("send your report", e)
        }
    }


    // =========================================================================
    // THE REFERENCE APP'S CALLS, ON THE SHOP WINDOW
    // The screens are the reference app's, so they keep its calls. The account id arguments
    // are ignored (the server takes the caller from the login). Other people are known only by
    // their studio handle, so a studio's handle stands in for its "lender id" on screen.
    // =========================================================================

    /** A browse card as the reference app's Listing: cover photo, studio, whole-mile distance. */
    fun ListingCard.toListing(): Listing = Listing(
        id = id,
        lenderId = studioHandle.orEmpty(),
        title = title,
        category = category,
        priceUsd = price,
        city = city,
        approxLat = 0.0,
        approxLng = 0.0,
        photos = listOfNotNull(coverPhotoPath?.let { ListingPhoto(id = "", listingId = id, storagePath = it, position = 0) }),
        lender = Profile(id = studioHandle.orEmpty(), displayName = studioName.orEmpty(), city = city, studioName = studioName, studioHandle = studioHandle),
        distanceKm = distance?.let { it * KM_PER_MILE },
        distanceMiles = distance
    )

    private fun ListingDetail.toListing(): Listing = Listing(
        id = id,
        lenderId = studioHandle.orEmpty(),
        title = title,
        category = category,
        itemType = itemType,
        sizeLabel = sizeLabel,
        description = description,
        priceUsd = price,
        priceNote = priceNote,
        city = city,
        approxLat = 0.0,
        approxLng = 0.0,
        createdAt = createdAt,
        retailValue = retailValue,
        depositNote = depositNote,
        listingStyles = listingStyles,
        garmentType = garmentType,
        photos = photos.sortedBy { it.position }.mapIndexed { i, p ->
            ListingPhoto(id = "photo-$i", listingId = id, storagePath = p.storagePath, position = p.position, slot = p.slot)
        },
        measurements = measurements.map { ListingMeasurement(listingId = id, label = it.label, value = it.value, unit = it.unit) },
        availability = availability.map { Availability(listingId = id, startDate = it.startDate, endDate = it.endDate) },
        lender = Profile(id = studioHandle.orEmpty(), displayName = studioName.orEmpty(), city = city, studioName = studioName, studioHandle = studioHandle),
        distanceKm = distance?.let { it * KM_PER_MILE },
        distanceMiles = distance
    )

    /** My own listing in full, or anyone's active listing through the shop window. */
    suspend fun getListingDetail(id: String, lat: Double? = null, lng: Double? = null): Listing {
        if (currentUserId != null) getMyListing(id)?.let { return it }
        return getListing(id, lat, lng)?.toListing()
            ?: throw DzirentException("Couldn't load this listing. Please try again.")
    }

    suspend fun recordListingEvent(userId: String, listingId: String, type: String) = recordListingEvent(listingId, type)
    suspend fun isListingSaved(userId: String, listingId: String): Boolean = isListingSaved(listingId)
    suspend fun saveListing(userId: String, listingId: String) = saveListing(listingId)
    suspend fun unsaveListing(userId: String, listingId: String) = unsaveListing(listingId)
    suspend fun getMyListings(lenderId: String): List<Listing> = getMyListings()
    suspend fun getRentedOutListingIds(lenderId: String): Set<String> = getRentedOutListingIds()
    suspend fun getMyRentals(renterId: String): List<Rental> = getMyRentals()
    suspend fun getPrivateProfile(userId: String): PrivateProfile = getPrivateProfile()
    suspend fun updateRole(userId: String, role: String): Profile = updateRole(role)
    suspend fun updateLocation(userId: String, lat: Double, lng: Double, city: String): Profile = updateLocation(lat, lng, city)
    suspend fun getInboxSnapshot(userId: String): InboxSnapshot = getInboxSnapshot()

    suspend fun saveBodyMeasurements(
        userId: String,
        valuesCm: Map<BodyMeasurement, Double?>,
        fitProfile: FitProfile?,
        styleInterests: List<String>
    ): PrivateProfile = saveBodyMeasurements(valuesCm, fitProfile, styleInterests)

    suspend fun updateStudio(
        userId: String,
        name: String,
        handle: String,
        bio: String,
        styleTags: List<String>,
        pickupArea: String
    ): Profile = updateStudio(name, handle, bio, styleTags, pickupArea)

    /** True while I have an active rental as renter or lender (account deletion waits for it). */
    suspend fun hasActiveRental(userId: String): Boolean {
        val uid = requireUserId()
        return try {
            postgrest.from("rentals").select(Columns.raw("id")) {
                filter {
                    eq("status", "active")
                    or {
                        eq("renter_id", uid)
                        eq("lender_id", uid)
                    }
                }
                limit(1)
            }.decodeList<JsonObject>().isNotEmpty()
        } catch (e: Exception) {
            throw fail("check your rentals", e)
        }
    }

    /** Opens (or starts) my chat about a listing; the server finds the lender. */
    suspend fun getOrCreateConversation(listingId: String, renterId: String, lenderId: String): Conversation {
        val id = startConversation(listingId)
        recordListingEvent(listingId, ListingEvents.MESSAGE)
        return Conversation(id = id, listingId = listingId, renterId = renterId, lenderId = lenderId)
    }

    /** Everything a studio page shows; [lenderId] is the studio's handle. */
    suspend fun getStudio(lenderId: String, userId: String, lat: Double? = null, lng: Double? = null): StudioPage {
        val studio = try {
            getStudio(lenderId, lat, lng)
        } catch (e: Exception) {
            throw fail("load this studio", e)
        } ?: throw DzirentException("Couldn't load this studio. Please try again.")
        return StudioPage(
            lender = Profile(
                id = studio.studioHandle,
                displayName = studio.studioName,
                city = studio.city,
                studioName = studio.studioName,
                studioHandle = studio.studioHandle,
                studioBio = studio.studioBio,
                styleTags = studio.styleTags,
                pickupArea = studio.pickupArea,
                createdAt = studio.since
            ),
            pieces = studio.listings.map { it.toListing() },
            rentedCount = studio.rentalCount,
            replyMinutes = studio.replyMinutes,
            isSaved = studio.isSaved,
            isOwn = studio.isOwn,
            since = studio.since
        )
    }

    suspend fun saveStudio(userId: String, lenderId: String) = saveStudio(lenderId)
    suspend fun unsaveStudio(userId: String, lenderId: String) = unsaveStudio(lenderId)

    /** Handles of the studios I saved ("From studios you saved"). */
    suspend fun getSavedStudioIds(userId: String): Set<String> =
        getSavedStudios(userId).map { it.lenderId }.toSet()

    /** Saved > Pieces, newest first. Paused pieces show with listing = null ("No longer available"). */
    suspend fun getSavedListings(userId: String): List<SavedListing> {
        val items = mutableListOf<SavedListingItem>()
        while (true) {
            val page = try {
                postgrest.rpc("my_saved_listings", buildJsonObject {
                    put("p_limit", 30)
                    put("p_offset", items.size)
                }).decodeList<SavedListingItem>()
            } catch (e: Exception) {
                throw fail("load your saved pieces", e)
            }
            items += page
            if (page.size < 30 || items.size >= 300) break
        }
        return items.map { item ->
            val listing = if (item.isAvailable && item.title != null) {
                Listing(
                    id = item.listingId,
                    lenderId = item.studioHandle.orEmpty(),
                    title = item.title,
                    category = item.category ?: "",
                    priceUsd = item.price,
                    city = item.city ?: "",
                    approxLat = 0.0,
                    approxLng = 0.0,
                    photos = listOfNotNull(item.coverPhotoPath?.let {
                        ListingPhoto(id = "", listingId = item.listingId, storagePath = it, position = 0)
                    }),
                    lender = Profile(
                        id = item.studioHandle.orEmpty(),
                        displayName = item.studioName.orEmpty(),
                        city = item.city ?: "",
                        studioName = item.studioName,
                        studioHandle = item.studioHandle
                    ),
                    distanceKm = item.distance?.let { it * KM_PER_MILE },
                    distanceMiles = item.distance
                )
            } else null
            SavedListing(userId = userId, listingId = item.listingId, listing = listing)
        }
    }

    /** Saved > Studios, with each studio's public details. */
    suspend fun getSavedStudios(userId: String): List<SavedStudio> {
        val studios = mutableListOf<SavedStudioCard>()
        while (true) {
            val page = mySavedStudios(limit = 30, offset = studios.size)
            studios += page
            if (page.size < 30 || studios.size >= 300) break
        }
        return studios.map { s ->
            SavedStudio(
                userId = userId,
                lenderId = s.studioHandle,
                lender = Profile(id = s.studioHandle, displayName = s.studioName, city = s.city, studioName = s.studioName, studioHandle = s.studioHandle)
            )
        }
    }

}

