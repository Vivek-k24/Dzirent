# Dzirent - Code reference (C4 level 4, generated)

Generated from the `Preview` branch source by a script (`tools/gen-code-reference.py`; CI fails when this file is out of date). It lists every source file with its line count and every top-level declaration (Kotlin, TypeScript/TSX, Python) and every schema statement (SQL migrations). It is an index, not a hand-written description: the architecture and the meaning live in `pranalika/architecture.md`. Regenerate it instead of editing it.

## Shared mobile code and Android/iOS (Kotlin)


### `mobile/androidApp/src/main/java/com/dzirent/app/AppLinks.kt` (11 lines)

- L6: `object AppLinks {`
- L7: `const val TERMS_URL = "https://dzirent.com/terms"`
- L8: `const val PRIVACY_URL = "https://dzirent.com/privacy"`
- L9: `const val SUPPORT_EMAIL = "support@dzirent.com"`

### `mobile/androidApp/src/main/java/com/dzirent/app/DzirentApplication.kt` (15 lines)

- L10: `class DzirentApplication : Application() {`
- L11: `override fun onCreate() {`

### `mobile/androidApp/src/main/java/com/dzirent/app/MainActivity.kt` (80 lines)

- L25: `class MainActivity : ComponentActivity() {`
- L35: `override fun onCreate(savedInstanceState: Bundle?) {`
- L74: `override fun onNewIntent(intent: Intent) {`

### `mobile/androidApp/src/main/java/com/dzirent/app/age/PlayAgeSignals.kt` (55 lines)

- L23: `class PlayAgeSignals(context: Context) : AgeSignalsService {`
- L26: `override val platform: String = PLATFORM`
- L28: `override suspend fun check(): AgeSignal {`

### `mobile/androidApp/src/main/java/com/dzirent/app/push/ChatNotifications.kt` (96 lines)

- L23: `object ChatNotifications {`
- L34: `fun createChannel(context: Context) {`
- L42: `fun canNotify(context: Context): Boolean {`
- L49: `fun show(context: Context, data: Map<String, String>) {`
- L87: `fun cancel(context: Context, conversationId: String) {`
- L92: `fun chatToOpen(intent: Intent?): String? {`

### `mobile/androidApp/src/main/java/com/dzirent/app/push/DzirentMessagingService.kt` (38 lines)

- L10: `class DzirentMessagingService : FirebaseMessagingService() {`
- L12: `override fun onMessageReceived(message: RemoteMessage) {`
- L21: `override fun onNewToken(token: String) {`

### `mobile/androidApp/src/main/java/com/dzirent/app/push/FirebasePush.kt` (102 lines)

- L26: `class FirebasePush(context: Context) : PushService {`
- L29: `override val platform: String = PLATFORM`
- L31: `override val canAskPermission: Boolean`
- L34: `override suspend fun token(): String? {`
- L41: `override suspend fun deleteToken() {`
- L48: `override fun canNotify(): Boolean = ChatNotifications.canNotify(app)`
- L50: `override fun openNotificationSettings() {`
- L57: `override fun setSignedInUser(userId: String?) {`
- L63: `override fun chatShown(conversationId: String) {`
- L68: `override fun chatHidden(conversationId: String) {`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/data/PhotoAnalyzer.kt` (102 lines)

- L29: `class AndroidPhotoAnalyzer(context: Context) : PhotoAnalyzer {`
- L32: `override suspend fun analyze(uri: String): PhotoAnalysis = withContext(Dispatchers.Default) {`
- L97: `fun Bitmap.toRgbImage(): RgbImage {`
- L98: `val pixels = IntArray(width * height)`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidDataExport.kt` (70 lines)

- L21: `class AndroidDataExport(activity: ComponentActivity) : DataExportService {`
- L27: `override val savesFiles: Boolean = true`
- L29: `override suspend fun save(fileName: String, bytes: ByteArray): SaveResult {`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidDevice.kt` (169 lines)

- L16: `fun cameraDir(context: Context): File = File(context.cacheDir, "camera").apply { mkdirs() }`
- L18: `class AndroidDeviceServices(`
- L32: `override val prefs: KeyValueStore = SharedPreferencesStore(app.getSharedPreferences("dzirent_prefs", Context.MODE_PRIVATE))`
- L33: `override val photoAnalyzer: PhotoAnalyzer by lazy { AndroidPhotoAnalyzer(app) }`
- L34: `override val imageCompressor: ImageCompressor = AndroidImageCompressor()`
- L35: `override val locationService: LocationService by lazy { AndroidLocationService(app) }`
- L36: `override val searchRelated: com.dzirent.shared.util.SearchRelated by lazy {`
- L46: `override fun photoStore(userId: String): PhotoStore = AndroidPhotoStore(app, userId)`
- L47: `override fun draftStore(userId: String, listingId: String?): DraftStore = AndroidDraftStore(app, userId, listingId)`
- L49: `override suspend fun readPhoto(uri: String): ByteArray? = withContext(Dispatchers.IO) {`
- L57: `override fun clearCameraCache() {`
- L61: `override fun toast(message: String) {`
- L65: `override fun openUrl(url: String) {`
- L70: `override fun share(text: String) {`
- L78: `override fun getBoolean(key: String, default: Boolean): Boolean = prefs.getBoolean(key, default)`
- L79: `override fun putBoolean(key: String, value: Boolean) = prefs.edit().putBoolean(key, value).apply()`
- L80: `override fun getString(key: String): String? = prefs.getString(key, null)`
- L81: `override fun putString(key: String, value: String?) = prefs.edit().putString(key, value).apply()`
- L85: `class AndroidPhotoStore(context: Context, userId: String) : PhotoStore {`
- L90: `suspend fun copyIn(uri: Uri): String? = withContext(Dispatchers.IO) {`
- L107: `suspend fun moveIn(capture: File): String? = withContext(Dispatchers.IO) {`
- L120: `override fun prune(keep: Set<String>) {`
- L124: `override fun delete(uris: Collection<String>) {`
- L128: `override fun clear() {`
- L147: `override suspend fun load(): SavedDraft? = withContext(Dispatchers.IO) {`
- L151: `override suspend fun save(draft: SavedDraft) {`
- L166: `override suspend fun clear() {`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidPlatformServices.kt` (268 lines)

- L53: `class AndroidLocationService(context: Context) : LocationService {`
- L57: `override fun hasPermission(): Boolean =`
- L62: `override suspend fun currentPlace(): ApproxPlace? {`
- L87: `override suspend fun cityFor(lat: Double, lng: Double): String? {`
- L155: `class AndroidSettingsStorage(context: Context) : SettingsStorage {`
- L159: `override val settings: Flow<AppSettings> = store.data`
- L171: `override suspend fun setTheme(mode: ThemeMode) {`
- L175: `override suspend fun setDistanceUnit(unit: DistanceUnit) {`
- L179: `override suspend fun setMeasureUnit(unit: MeasureUnit) {`
- L183: `override suspend fun setRentalDays(days: Int) {`
- L187: `override suspend fun setDefaultDistanceStep(step: Int) {`
- L191: `override fun getRecentSearches(userId: String): List<String> =`
- L194: `override fun addRecentSearch(userId: String, query: String): List<String> {`
- L200: `override fun clearRecentSearches(userId: String) {`
- L213: `class AndroidImageCompressor : ImageCompressor {`
- L214: `override suspend fun compressImage(imageBytes: ByteArray, maxDimension: Int, quality: Int): ByteArray? =`
- L256: `class AndroidPhotoPicker : PhotoPicker {`
- L257: `override suspend fun pickPhotos(maxItems: Int): List<ByteArray> {`
- L262: `class AndroidCameraService : CameraService {`
- L263: `override fun hasCameraPermission(): Boolean = false`
- L264: `override suspend fun capturePhoto(): ByteArray? {`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidSecureStore.kt` (85 lines)

- L17: `object AndroidSecureStorage {`
- L19: `internal var store: SecureStore? = null`
- L21: `fun init(context: Context) {`
- L26: `actual fun platformSecureStore(): SecureStore? = AndroidSecureStorage.store`
- L50: `override fun read(key: String): String? = synchronized(lock) {`
- L64: `override fun write(key: String, value: String) {`
- L73: `override fun delete(key: String) {`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/ui/BackHandler.android.kt` (20 lines)

- L11: `actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {`
- L17: `actual fun PlatformNavigationBackHandler(navController: NavHostController) = Unit`
- L20: `actual fun Modifier.consumeScaffoldInsets(padding: PaddingValues): Modifier = consumeWindowInsets(padding)`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/ui/Licenses.android.kt` (10 lines)

- L8: `actual fun LicensesList(modifier: Modifier) {`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/ui/LocationPermission.android.kt` (12 lines)

- L9: `actual fun rememberLocationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit {`
- L10: `val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission(), onResult)`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/ui/NotificationPermission.android.kt` (17 lines)

- L10: `actual fun rememberNotificationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit {`
- L11: `val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission(), onResult)`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/ui/PaymentSheet.android.kt` (41 lines)

- L17: `actual fun rememberPaymentSheetLauncher(onOutcome: (PaymentSheetOutcome) -> Unit): PaymentSheetLauncher {`
- L18: `val context = LocalContext.current.applicationContext`
- L19: `val sheet = rememberPaymentSheet { result: PaymentSheetResult ->`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/ui/PhotoPermissions.android.kt` (169 lines)

- L46: `actual fun rememberPhotoSources(`
- L52: `val context = LocalContext.current`
- L53: `val scope = rememberCoroutineScope()`
- L54: `val device = LocalDevice.current`
- L55: `val consent = remember { PhotoConsentStore(device.prefs) }`
- L56: `val store = photoStore as AndroidPhotoStore`
- L57: `val currentOnPhotos by rememberUpdatedState(onPhotos)`
- L58: `val currentOnMessage by rememberUpdatedState(onMessage)`
- L59: `var askingConsent by remember { mutableStateOf<PhotoSource?>(null) }`
- L60: `var showCameraDenied by remember { mutableStateOf(false) }`
- L61: `var pendingCameraPath by rememberSaveable { mutableStateOf<String?>(null) }`
- L63: `val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(maxPhotos)) { picked ->`
- L71: `val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->`
- L81: `fun openGallery() {`
- L85: `fun openCamera() {`
- L97: `val cameraPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->`
- L101: `fun start(source: PhotoSource) {`
- L141: `fun CameraDeniedDialog(context: Context, onUseGallery: () -> Unit, onDismiss: () -> Unit) {`
- L166: `val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/ui/theme/Theme.android.kt` (22 lines)

- L11: `actual fun SystemBarIcons(darkTheme: Boolean) {`
- L12: `val view = LocalView.current`

### `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/util/Text.android.kt` (6 lines)

- L5: `actual fun stripAccents(text: String): String =`

### `mobile/shared/src/androidUnitTest/kotlin/com/dzirent/shared/ErrorCodesFreshnessTest.kt` (48 lines)

- L19: `class ErrorCodesFreshnessTest {`
- L31: `fun generatedKotlinMatchesTheCatalog() {`

### `mobile/shared/src/androidUnitTest/kotlin/com/dzirent/shared/SmokeTest.kt` (84 lines)

- L19: `class SmokeTest {`
- L22: `fun setUp() {`
- L27: `fun tearDown() {`
- L35: `fun testSmokeRepositoryOperations() = runBlocking {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/data/ListingPublisher.kt` (224 lines)

- L14: `sealed class PhotoItem {`
- L15: `abstract val key: String`
- L17: `data class Existing(val photo: ListingPhoto) : PhotoItem() {`
- L22: `data class New(val uri: String) : PhotoItem() {`
- L32: `data class ListingDraft(`
- L42: `class PublishStepException(val step: String, cause: Throwable) :`
- L57: `class ListingPublisher(`
- L77: `val created: Boolean get() = listingCreated`
- L80: `val uploadedPhotos: Map<String, ListingPhoto> get() = uploaded.toMap()`
- L83: `fun photoOf(item: PhotoItem): ListingPhoto? = when (item) {`
- L89: `fun restore(created: Boolean, photos: Map<String, ListingPhoto>) {`
- L96: `fun reset() {`
- L108: `suspend fun syncPhotos(draftRow: Listing, photos: List<PhotoItem>, slots: List<String?>, onProgress: (String) -> Unit = {}) {`
- L122: `suspend fun publish(`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/data/PhotoAnalysis.kt` (21 lines)

- L10: `class PhotoAnalysis(val checks: PhotoChecks?)`
- L13: `class DeclarationCache(private val prefs: KeyValueStore) {`
- L14: `fun isSigned(userId: String, version: Int): Boolean = prefs.getBoolean(key(userId, version), false)`
- L16: `fun markSigned(userId: String, version: Int) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/model/Models.kt` (683 lines)

- L16: `data class Profile(`
- L34: `val hasLocation: Boolean get() = approxLat != null && approxLng != null`
- L35: `val studioTitle: String get() = studioName?.ifBlank { null } ?: displayName.ifBlank { "Studio" }`
- L38: `val suspensionNotice: String? get() = com.dzirent.shared.util.suspensionNotice(suspendedUntil, suspensionReason)`
- L45: `data class PrivateProfile(`
- L59: `val fit: FitProfile? get() = FitProfile.fromDb(fitProfile)`
- L60: `val hasMeasurementsConsent: Boolean get() = measurementsConsentAt != null`
- L62: `fun bodyCm(measurement: BodyMeasurement): Double? = when (measurement) {`
- L74: `data class UsCity(`
- L81: `val label: String get() = "$name, $state"`
- L86: `data class ListingCard(`
- L99: `data class ListingPhotoDetail(`
- L106: `data class ListingMeasurementDetail(`
- L113: `data class AvailabilityRange(`
- L120: `data class ListingDetail(`
- L147: `data class StudioDetail(`
- L164: `data class BlockedUserItem(`
- L174: `data class SavedListingItem(`
- L190: `data class SavedStudioCard(`
- L201: `data class ConversationCard(`
- L215: `val requestedDates: DateRange? get() = parseDateRange(requestedStart, requestedEnd)`
- L220: `data class Listing(`
- L253: `val typeLabel: String get() = itemType ?: category`
- L257: `val priceLabel: String get() = priceUsd?.let { formatPerDay(it) } ?: priceNote`
- L261: `data class ListingPhoto(`
- L274: `data class ListingScan(`
- L287: `val finished: Boolean get() = status == "done" || status == "failed"`
- L292: `data class PhotoScanRow(`
- L299: `data class ListingMeasurement(`
- L308: `data class Availability(`
- L316: `data class Conversation(`
- L331: `val requestedDates: DateRange? get() = parseDateRange(requestedStart, requestedEnd)`
- L332: `fun otherUserId(me: String): String = if (me == renterId) lenderId else renterId`
- L333: `fun otherUser(me: String): Profile? = if (me == renterId) lender else renter`
- L334: `val lastMessage: Message? get() = messages.firstOrNull()`
- L338: `data class Message(`
- L347: `data class Rental(`
- L368: `data class RentalEvent(`
- L379: `data class RentalPhoto(`
- L392: `data class RentalView(`
- L430: `val iAmLender: Boolean get() = yourRole == "lender"`
- L431: `val dates: DateRange? get() = parseDateRange(startDate, endDate)`
- L436: `data class RentalClaimView(`
- L451: `data class RentalSettings(`
- L463: `data class PayoutAccount(`
- L470: `data class PaymentStart(val clientSecret: String, val publishableKey: String, val amount: Double?)`
- L473: `data class ConversationRead(`
- L479: `data class RentalOutcome(`
- L487: `data class Block(`
- L496: `data class NotificationSettings(`
- L506: `data class Report(`
- L516: `data class SavedListing(`
- L526: `data class SavedStudio(`
- L535: `data class StudioPage(`
- L549: `data class SuggestionEvent(`
- L556: `object Roles {`
- L557: `const val RENTER = "renter"`
- L558: `const val LENDER = "lender"`
- L559: `const val BOTH = "both"`
- L561: `fun canLend(role: String) = role == LENDER || role == BOTH`
- L564: `object Categories {`
- L565: `const val ACCESSORIES = "Accessories"`
- L567: `val ALL = listOf(`
- L586: `fun measurementSuggestions(category: String, itemType: String?): List<String> =`
- L592: `object AccessoryTypes {`
- L594: `const val COSTUME_JEWELRY = "Costume jewelry"`
- L596: `val ALL = listOf("Sunglasses", "Handbag", "Tie", "Watch (non-smart)", "Belt buckle", COSTUME_JEWELRY)`
- L598: `val SUGGESTIONS = mapOf(`
- L608: `object ReportReasons {`
- L609: `val ALL = listOf("Inappropriate photo", "Prohibited item", "Scam or fraud", "Harassment", "Other")`
- L610: `const val DETAILS_MAX = 500`
- L613: `object ListingEvents {`
- L614: `const val VIEW = "view"`
- L615: `const val SAVE = "save"`
- L616: `const val MESSAGE = "message"`
- L619: `sealed class UiState<out T> {`
- L620: `object Loading : UiState<Nothing>()`
- L621: `data class Error(val message: String) : UiState<Nothing>()`
- L622: `data class Success<T>(val data: T) : UiState<T>()`
- L625: `data class ListingValidationResult(`
- L633: `fun validateListingForm(`
- L638: `val trimmedTitle = title.trim()`
- L639: `val titleError = when {`
- L646: `val priceError = when {`
- L653: `val mErrors = validateMeasurements(measurements)`
- L654: `val hasMeasurementError = mErrors.any { it != null }`
- L656: `val first = titleError ?: priceError ?: mErrors.firstOrNull { it != null }`
- L667: `object AppLinks {`
- L668: `const val TERMS_URL = "https://dzirent.com/terms"`
- L669: `const val PRIVACY_URL = "https://dzirent.com/privacy"`
- L670: `const val SUPPORT_EMAIL = "support@dzirent.com"`
- L671: `const val HELP_URL = "https://dzirent.com/help"`
- L672: `const val SAFETY_URL = "https://dzirent.com/safety"`
- L673: `const val COMMUNITY_GUIDELINES_URL = "https://dzirent.com/community-guidelines"`
- L674: `const val COPYRIGHT_URL = "https://dzirent.com/copyright"`
- L675: `const val DELETE_ACCOUNT_URL = "https://dzirent.com/delete-account"`
- L676: `const val SUPPORT_URL = "https://dzirent.com/support"`
- L678: `const val DATA_EXPORT_URL = "https://dzirent.com/app/settings/preferences#privacy"`
- L682: `const val PASSWORD_MIN_LENGTH = 8`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/AgeSignals.kt` (45 lines)

- L7: `enum class AgeSignal {`
- L39: `interface AgeSignalsService {`
- L41: `val platform: String`
- L44: `suspend fun check(): AgeSignal`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/DataExport.kt` (17 lines)

- L4: `enum class SaveResult { SAVED, CANCELLED, FAILED }`
- L11: `interface DataExportService {`
- L13: `val savesFiles: Boolean`
- L16: `suspend fun save(fileName: String, bytes: ByteArray): SaveResult`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/Device.kt` (83 lines)

- L8: `interface KeyValueStore {`
- L9: `fun getBoolean(key: String, default: Boolean = false): Boolean`
- L10: `fun putBoolean(key: String, value: Boolean)`
- L11: `fun getString(key: String): String?`
- L12: `fun putString(key: String, value: String?)`
- L21: `interface PhotoStore {`
- L23: `fun prune(keep: Set<String>)`
- L26: `fun delete(uris: Collection<String>)`
- L28: `fun clear()`
- L32: `interface DraftStore {`
- L33: `suspend fun load(): SavedDraft?`
- L34: `suspend fun save(draft: SavedDraft)`
- L35: `suspend fun clear()`
- L39: `interface PhotoAnalyzer {`
- L40: `suspend fun analyze(uri: String): PhotoAnalysis`
- L44: `interface DeviceServices {`
- L45: `val prefs: KeyValueStore`
- L46: `val photoAnalyzer: PhotoAnalyzer`
- L47: `val imageCompressor: ImageCompressor`
- L48: `val locationService: LocationService`
- L49: `val searchRelated: com.dzirent.shared.util.SearchRelated`
- L50: `val push: PushService`
- L53: `val ageSignals: AgeSignalsService`
- L56: `val dataExport: DataExportService`
- L59: `val appVersion: String`
- L62: `val appBuild: Long`
- L64: `fun photoStore(userId: String): PhotoStore`
- L65: `fun draftStore(userId: String, listingId: String?): DraftStore`
- L68: `suspend fun readPhoto(uri: String): ByteArray?`
- L71: `fun clearCameraCache()`
- L74: `fun toast(message: String)`
- L77: `fun openUrl(url: String)`
- L80: `fun share(text: String)`
- L83: `val LocalDevice = staticCompositionLocalOf<DeviceServices> { error("DeviceServices not provided") }`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/PlatformServices.kt` (51 lines)

- L10: `data class ApproxPlace(`
- L17: `interface LocationService {`
- L18: `fun hasPermission(): Boolean`
- L19: `suspend fun currentPlace(): ApproxPlace?`
- L20: `suspend fun cityFor(lat: Double, lng: Double): String?`
- L24: `interface SettingsStorage {`
- L25: `val settings: Flow<AppSettings>`
- L26: `suspend fun setTheme(mode: ThemeMode)`
- L27: `suspend fun setDistanceUnit(unit: DistanceUnit)`
- L28: `suspend fun setMeasureUnit(unit: MeasureUnit)`
- L29: `suspend fun setRentalDays(days: Int)`
- L30: `suspend fun setDefaultDistanceStep(step: Int)`
- L31: `fun getRecentSearches(userId: String): List<String> = emptyList()`
- L32: `fun addRecentSearch(userId: String, query: String): List<String> = emptyList()`
- L33: `fun clearRecentSearches(userId: String) {}`
- L37: `interface PhotoPicker {`
- L38: `suspend fun pickPhotos(maxItems: Int): List<ByteArray>`
- L42: `interface CameraService {`
- L43: `fun hasCameraPermission(): Boolean`
- L44: `suspend fun capturePhoto(): ByteArray?`
- L48: `interface ImageCompressor {`
- L49: `suspend fun compressImage(imageBytes: ByteArray, maxDimension: Int = 1600, quality: Int = 80): ByteArray?`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/Push.kt` (75 lines)

- L7: `interface PushService {`
- L9: `val platform: String`
- L12: `val canAskPermission: Boolean`
- L15: `suspend fun token(): String?`
- L18: `suspend fun deleteToken()`
- L21: `fun canNotify(): Boolean`
- L24: `fun openNotificationSettings()`
- L27: `fun setSignedInUser(userId: String?)`
- L30: `fun chatShown(conversationId: String)`
- L33: `fun chatHidden(conversationId: String)`
- L37: `fun chatNotificationTag(conversationId: String): String = "chat_$conversationId"`
- L40: `data class ChatPush(`
- L55: `fun shouldShow(signedInUserId: String?, visibleChatId: String?): Boolean =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/SecureSession.kt` (56 lines)

- L12: `interface SecureStore {`
- L13: `fun read(key: String): String?`
- L14: `fun write(key: String, value: String)`
- L15: `fun delete(key: String)`
- L19: `expect fun platformSecureStore(): SecureStore?`
- L26: `class SecureSessionManager(`
- L32: `override suspend fun saveSession(session: UserSession) {`
- L36: `override suspend fun loadSession(): UserSession? {`
- L48: `override suspend fun deleteSession() {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/repository/DzirentRepository.kt` (2110 lines)

- L68: `class DzirentException(message: String, val field: String? = null, val code: String? = null) : Exception(message) {`
- L73: `val CANT_MESSAGE_USER: String = ErrorCatalog.shown("DZ-E3005").text`
- L79: `internal fun storageRefusal(statusCode: Int?, raw: String): String? {`
- L80: `val said = raw.lowercase()`
- L89: `internal fun serverError(throwable: Throwable): ShownError? {`
- L90: `val rest = throwable as? RestException`
- L91: `val hint = rest?.description?.trim()?.takeIf { it.isNotEmpty() && ErrorCatalog.parse(it) == null && !it.startsWith("{") }`
- L96: `internal fun clientErrorCode(raw: String): String? {`
- L97: `val said = raw.lowercase()`
- L121: `data class InboxSnapshot(`
- L127: `val hasNews: Boolean get() = unreadIds.isNotEmpty() || activity.any { it.isNew }`
- L130: `class ChatSubscription(`
- L137: `fun generateUuid(): String {`
- L138: `val chars = "0123456789abcdef"`
- L139: `val bytes = ByteArray(16)`
- L143: `val sb = StringBuilder(36)`
- L155: `val chars = "0123456789abcdef"`
- L160: `fun createDzirentSupabaseClient(`
- L208: `class DzirentRepository(`
- L219: `val auth: Auth get() = client.auth`
- L220: `val postgrest: Postgrest get() = client.postgrest`
- L221: `val storage: Storage get() = client.storage`
- L222: `val realtime: Realtime get() = client.realtime`
- L223: `val functions: Functions get() = client.functions`
- L225: `fun currentEmail(): String? = auth.currentUserOrNull()?.email`
- L248: `val currentUserId: String? get() = auth.currentUserOrNull()?.id`
- L249: `val currentEmail: String? get() = auth.currentUserOrNull()?.email`
- L251: `suspend fun awaitAuth() {`
- L255: `fun hasSession(): Boolean = auth.currentSessionOrNull() != null`
- L264: `suspend fun signUp(`
- L312: `suspend fun signIn(emailStr: String, passwordStr: String) {`
- L323: `suspend fun signOut() {`
- L337: `suspend fun changePassword(current: String, new: String) {`
- L360: `suspend fun resetPassword(emailStr: String) {`
- L372: `suspend fun browseListings(`
- L425: `suspend fun getListing(listingId: String, lat: Double? = null, lng: Double? = null): ListingDetail? {`
- L440: `suspend fun getStudio(handle: String, lat: Double? = null, lng: Double? = null): StudioDetail? {`
- L455: `suspend fun fitListings(`
- L478: `suspend fun myConversations(`
- L497: `suspend fun mySavedStudios(`
- L518: `suspend fun searchCities(query: String, limit: Int = 20): List<UsCity> {`
- L536: `suspend fun startConversation(listingId: String, start: String? = null, end: String? = null): String {`
- L551: `suspend fun saveStudio(handle: String) {`
- L559: `suspend fun unsaveStudio(handle: String) {`
- L567: `suspend fun blockUser(handle: String) {`
- L575: `suspend fun unblockUser(handle: String) {`
- L583: `suspend fun reportUser(handle: String, reason: String, details: String? = null) {`
- L595: `suspend fun setConversationDates(conversationId: String, start: String, end: String): Boolean {`
- L611: `suspend fun markConversationRead(conversationId: String) {`
- L618: `suspend fun markActivitySeen() {`
- L625: `suspend fun recordAccessoryDeclaration(fullLegalName: String, version: Int, appVersion: String) {`
- L646: `suspend fun checkText(text: String, where: String): String? = try {`
- L659: `suspend fun needsLegalAcceptance(): Boolean = try {`
- L666: `suspend fun acceptLegal(platform: String) {`
- L676: `suspend fun giveMeasurementsConsent() {`
- L685: `suspend fun withdrawMeasurementsConsent() {`
- L699: `suspend fun recordAgeCheck(source: String, result: String, platform: String): Boolean = try {`
- L714: `suspend fun registerPushToken(token: String, platform: String) {`
- L729: `suspend fun unregisterPushToken(token: String) {`
- L737: `suspend fun getNotificationSettings(): NotificationSettings {`
- L748: `suspend fun saveNotificationSettings(settings: NotificationSettings) {`
- L765: `suspend fun recordListingDeclaration(listingId: String, version: Int) {`
- L783: `suspend fun deleteListing(listingId: String) {`
- L797: `suspend fun exportMyData(): String {`
- L811: `suspend fun deleteAccount() {`
- L824: `suspend fun getCurrentProfile(): Profile? {`
- L835: `suspend fun updateProfile(profile: Profile) {`
- L846: `suspend fun updateRole(role: String): Profile {`
- L858: `suspend fun updateLocation(lat: Double, lng: Double, city: String): Profile {`
- L876: `suspend fun updateStudio(`
- L903: `suspend fun getPrivateProfile(): PrivateProfile {`
- L914: `suspend fun saveBodyMeasurements(`
- L935: `suspend fun getMyListings(): List<Listing> {`
- L973: `suspend fun getMyListing(listingId: String): Listing? {`
- L1008: `suspend fun createListing(listing: Listing): Listing {`
- L1020: `suspend fun updateListingDetails(listing: Listing, status: String) {`
- L1050: `suspend fun replaceMeasurements(listingId: String, measurements: List<ListingMeasurement>) {`
- L1060: `suspend fun replaceAvailability(listingId: String, ranges: List<Availability>) {`
- L1069: `suspend fun toggleListingStatus(id: String, newStatus: String) {`
- L1079: `suspend fun updatePhotoPosition(photoId: String, position: Int, slot: String?) {`
- L1092: `suspend fun updateListing(listing: Listing): Listing {`
- L1107: `suspend fun setListingStatus(listingId: String, status: String) {`
- L1126: `suspend fun uploadListingPhoto(`
- L1166: `suspend fun deleteListingPhoto(photo: ListingPhoto) {`
- L1178: `suspend fun updatePhotoPositions(photos: List<ListingPhoto>) {`
- L1194: `suspend fun saveListingMeasurements(listingId: String, measurements: List<ListingMeasurement>) {`
- L1208: `suspend fun saveAvailability(listingId: String, ranges: List<Availability>) {`
- L1222: `suspend fun hasSavedListing(listingId: String): Boolean {`
- L1236: `suspend fun saveListing(listingId: String) {`
- L1251: `suspend fun unsaveListing(listingId: String) {`
- L1265: `suspend fun isListingSaved(listingId: String): Boolean {`
- L1280: `suspend fun getMessages(conversationId: String): List<Message> {`
- L1291: `suspend fun subscribeToChat(conversationId: String): ChatSubscription {`
- L1321: `suspend fun getRentedOutListingIds(): Set<String> {`
- L1341: `suspend fun getChatRental(conversationId: String): RentalView? = try {`
- L1348: `suspend fun getRentalById(rentalId: String): RentalView? = try {`
- L1356: `suspend fun myRentals(): List<RentalView> = try {`
- L1364: `suspend fun requestRental(listingId: String, dates: DateRange): String = try {`
- L1375: `suspend fun respondRental(rentalId: String, accept: Boolean, note: String? = null): String = rentalCall(`
- L1384: `suspend fun cancelRental(rentalId: String, reason: String? = null): String = rentalCall(`
- L1392: `suspend fun markPickedUp(rentalId: String, note: String? = null): String = rentalCall(`
- L1400: `suspend fun markReturned(rentalId: String, note: String? = null): String = rentalCall(`
- L1408: `suspend fun completeRental(rentalId: String): String = rentalCall(`
- L1423: `suspend fun rentalSettings(refresh: Boolean = false): RentalSettings {`
- L1434: `suspend fun myPayoutAccount(): PayoutAccount? {`
- L1446: `suspend fun payoutSetupLink(): String {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/AboutScreen.kt` (108 lines)

- L25: `fun AboutScreen(`
- L31: `val device = LocalDevice.current`
- L32: `val uriHandler = LocalUriHandler.current`
- L35: `fun open(uri: String, failure: String) {`
- L80: `fun LinkRow(title: String, icon: ImageVector, onClick: () -> Unit) {`
- L92: `fun LicensesScreen(onBack: () -> Unit) {`
- L108: `expect fun LicensesList(modifier: Modifier)`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Accessibility.kt` (18 lines)

- L12: `fun Modifier.asHeading(): Modifier = semantics { heading() }`
- L18: `fun Modifier.announced(): Modifier = semantics { liveRegion = LiveRegionMode.Polite }`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/AccessoryDeclarationScreen.kt` (121 lines)

- L30: `fun AccessoryDeclarationScreen(onSign: suspend (String) -> Unit, onDismiss: () -> Unit) {`
- L31: `val scope = rememberCoroutineScope()`
- L32: `val checked = remember { mutableStateListOf(*Array(AccessoryDeclaration.STATEMENTS.size) { false }) }`
- L33: `var name by remember { mutableStateOf("") }`
- L34: `var saving by remember { mutableStateOf(false) }`
- L35: `var error by remember { mutableStateOf<String?>(null) }`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/AgeBlocked.kt` (142 lines)

- L27: `fun AgeBlockedScreen(`
- L31: `val scope = rememberCoroutineScope()`
- L32: `val device = LocalDevice.current`
- L33: `val open = rememberOpenLink()`
- L34: `var isBusy by remember { mutableStateOf(false) }`
- L35: `var confirmDelete by remember { mutableStateOf(false) }`
- L36: `var error by remember { mutableStateOf<String?>(null) }`
- L38: `fun signOut() {`
- L48: `fun delete() {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/AuthScreens.kt` (708 lines)

- L29: `fun WelcomeScreen(`
- L96: `fun LoginScreen(`
- L102: `var email by remember { mutableStateOf("") }`
- L103: `var password by remember { mutableStateOf("") }`
- L104: `var isLoading by remember { mutableStateOf(false) }`
- L105: `var errorMessage by remember { mutableStateOf<String?>(null) }`
- L106: `var resetSentTo by remember { mutableStateOf<String?>(null) }`
- L107: `var isSendingReset by remember { mutableStateOf(false) }`
- L108: `val scope = rememberCoroutineScope()`
- L270: `fun SignUpScreen(`
- L276: `var displayName by remember { mutableStateOf("") }`
- L277: `var email by remember { mutableStateOf("") }`
- L278: `var password by remember { mutableStateOf("") }`
- L279: `var city by remember { mutableStateOf<UsCity?>(null) }`
- L280: `var cityText by remember { mutableStateOf("") }`
- L281: `var showCityHint by remember { mutableStateOf(false) }`
- L282: `var selectedRole by remember { mutableStateOf("both") }`
- L283: `var adultConfirmed by remember { mutableStateOf(false) }`
- L284: `var termsAccepted by remember { mutableStateOf(false) }`
- L285: `var showPolicy by remember { mutableStateOf(false) }`
- L287: `var nameError by remember { mutableStateOf<String?>(null) }`
- L289: `var isLoading by remember { mutableStateOf(false) }`
- L290: `var errorMessage by remember { mutableStateOf<String?>(null) }`
- L291: `var confirmationSentTo by remember { mutableStateOf<String?>(null) }`
- L292: `val scope = rememberCoroutineScope()`
- L293: `val device = LocalDevice.current`
- L300: `val sentTo = confirmationSentTo`
- L556: `fun EmailConfirmationView(`
- L608: `fun FirstVisitBottomSheet(`
- L676: `fun SignUpPromptDialog(`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/BodyMeasurementsScreen.kt` (269 lines)

- L41: `fun BodyMeasurementsScreen(`
- L46: `var loadState by remember { mutableStateOf<UiState<PrivateProfile>>(UiState.Loading) }`
- L47: `val scope = rememberCoroutineScope()`
- L49: `fun load() {`
- L92: `val scope = rememberCoroutineScope()`
- L94: `val startUnit = LocalAppSettings.current.measureUnit.key`
- L95: `var unit by rememberSaveable { mutableStateOf(startUnit) }`
- L97: `var fit by rememberSaveable { mutableStateOf(saved.fit) }`
- L98: `var styles by rememberSaveable { mutableStateOf(saved.styleInterests.filter { it in FashionStyles.ALL }) }`
- L99: `val texts = remember {`
- L104: `var showErrors by remember { mutableStateOf(false) }`
- L105: `var isSaving by remember { mutableStateOf(false) }`
- L106: `var saveError by remember { mutableStateOf<String?>(null) }`
- L107: `var hasConsent by remember { mutableStateOf(saved.hasMeasurementsConsent) }`
- L108: `var askConsent by remember { mutableStateOf(false) }`
- L110: `fun errorFor(measurement: BodyMeasurement): String? {`
- L117: `fun changeUnit(newUnit: String) {`
- L127: `fun save() {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/BrowseSession.kt` (98 lines)

- L15: `data class BrowseData(`
- L27: `class BrowseSession(`
- L33: `var filters by mutableStateOf(BrowseFilters(distanceStep = defaultDistanceStep))`
- L34: `var dates by mutableStateOf(defaultBrowseRange(today(), rentalDays))`
- L35: `var state by mutableStateOf<UiState<BrowseData>>(UiState.Loading)`
- L45: `suspend fun load(lat: Double, lng: Double, radiusKm: Double, force: Boolean = false) = mutex.withLock {`
- L63: `fun styleInterests(): Set<String> = (state as? UiState.Success)?.data?.body?.styleInterests.orEmpty().toSet()`
- L66: `fun loadedListings(): List<Listing> = (state as? UiState.Success)?.data?.listings.orEmpty()`
- L71: `suspend fun widerListings(lat: Double, lng: Double, radiusKm: Double): List<Listing> {`
- L81: `suspend fun similarListings(query: String, lat: Double, lng: Double): List<Listing> =`
- L86: `fun invalidate() {`
- L95: `fun sections(anyDates: Boolean = false): HomeSections? = (state as? UiState.Success)?.data?.let {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ChatScreens.kt` (989 lines)

- L56: `fun InboxScreen(`
- L63: `var uiState by remember { mutableStateOf<UiState<InboxSnapshot>>(UiState.Loading) }`
- L64: `var selectedTab by rememberSaveable { mutableIntStateOf(0) }`
- L66: `var activitySeenThisVisit by remember { mutableStateOf(false) }`
- L67: `val scope = rememberCoroutineScope()`
- L69: `fun load() {`
- L85: `val snapshot = (uiState as? UiState.Success)?.data`
- L202: `val last = conv.lastMessage`
- L266: `fun ChatScreen(`
- L277: `val scope = rememberCoroutineScope()`
- L278: `val device = LocalDevice.current`
- L279: `val safetyTips = remember { SafetyTipStore(device.prefs) }`
- L280: `var showSafetyTip by remember(conversationId) { mutableStateOf(!safetyTips.isDismissed(conversationId)) }`
- L281: `val notificationPrompt = remember { NotificationPromptStore(device.prefs) }`
- L282: `var showNotificationPrompt by remember { mutableStateOf(false) }`
- L283: `val turnOnNotifications = rememberTurnOnNotifications { }`
- L291: `var uiState by remember { mutableStateOf<UiState<Conversation>>(UiState.Loading) }`
- L292: `var messages by remember { mutableStateOf<List<Message>>(emptyList()) }`
- L295: `var rental by remember { mutableStateOf<RentalView?>(null) }`
- L296: `var photoLinks by remember { mutableStateOf<Map<String, String>>(emptyMap()) }`
- L297: `var listingDetail by remember { mutableStateOf<ListingDetail?>(null) }`
- L298: `var liveUnavailable by remember { mutableStateOf(false) }`
- L300: `var input by remember { mutableStateOf(initialDraft.orEmpty()) }`
- L301: `var isSending by remember { mutableStateOf(false) }`
- L302: `var sendError by remember { mutableStateOf<String?>(null) }`
- L303: `var sendRefused by remember { mutableStateOf(false) }`
- L304: `val suspended = rememberSuspensionNotice(repository)`
- L305: `var actionError by remember { mutableStateOf<String?>(null) }`
- L306: `var isSavingRental by remember { mutableStateOf(false) }`
- L307: `var menuOpen by remember { mutableStateOf(false) }`
- L308: `var showRequestDialog by remember { mutableStateOf(false) }`
- L309: `var showCancelDialog by remember { mutableStateOf(false) }`
- L311: `var showPayDialog by remember { mutableStateOf(false) }`
- L312: `var showClaimDialog by remember { mutableStateOf(false) }`
- L313: `var claimAnswer by remember { mutableStateOf<Boolean?>(null) }`
- L314: `var showReceipt by remember { mutableStateOf(false) }`
- L315: `var rentalNotice by remember { mutableStateOf<String?>(null) }`
- L316: `var rentalSettings by remember { mutableStateOf<RentalSettings?>(null) }`
- L319: `var choosingPhotoStage by remember { mutableStateOf<String?>(null) }`
- L320: `var uploadingStage by remember { mutableStateOf<String?>(null) }`
- L321: `var iBlocked by remember { mutableStateOf(false) }`
- L322: `var showBlockConfirm by remember { mutableStateOf(false) }`
- L323: `var reportTarget by remember { mutableStateOf<ReportTarget?>(null) }`
- L325: `val listState = rememberLazyListState()`
- L328: `fun merge(incoming: List<Message>) {`
- L335: `suspend fun reloadRental() {`
- L344: `suspend fun loadAll() {`
- L393: `val conversation = (uiState as? UiState.Success)?.data`
- L394: `val otherName = conversation?.otherUser(currentUserId)?.displayName?.ifBlank { null } ?: "Dzirent member"`
- L396: `fun send(text: String) {`
- L433: `fun rentalStep(block: suspend () -> Unit) {`
- L447: `fun openRequestDialog() {`
- L461: `val conditionPhotoStore = remember(currentUserId) { device.photoStore("rentals-$currentUserId") }`
- L462: `val startConditionPhotos = rememberPhotoSources(`
- L486: `val paymentSheet = rememberPaymentSheetLauncher { outcome ->`
- L498: `fun pay() {`
- L518: `fun onRentalAction(action: RentalAction) {`
- L588: `fun setBlocked(block: Boolean) {`
- L955: `val shape = RoundedCornerShape(12.dp)`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/CityField.kt` (183 lines)

- L26: `object Idle : CitySearch()`
- L27: `object Loading : CitySearch()`
- L28: `data class Results(val cities: List<UsCity>) : CitySearch()`
- L29: `data class Failed(val message: String) : CitySearch()`
- L40: `fun CityField(`
- L50: `val focusManager = LocalFocusManager.current`
- L51: `var query by remember { mutableStateOf(selected?.label.orEmpty()) }`
- L52: `var search by remember { mutableStateOf<CitySearch>(CitySearch.Idle) }`
- L53: `var retryCount by remember { mutableIntStateOf(0) }`
- L54: `val trimmed = query.trim()`
- L61: `fun setQuery(text: String) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Components.kt` (291 lines)

- L34: `fun Throwable.userMessage(fallback: String = ErrorCatalog.message(ErrorCatalog.FALLBACK)): String =`
- L38: `fun initialsOf(name: String): String {`
- L39: `val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }`
- L52: `fun Avatar(name: String, size: Dp, modifier: Modifier = Modifier) {`
- L72: `fun DzirentTabRow(selectedTabIndex: Int, tabs: @Composable () -> Unit) {`
- L89: `fun AccentDot(modifier: Modifier = Modifier) {`
- L103: `fun ListingPhoto(url: String?, contentDescription: String?, modifier: Modifier = Modifier) {`
- L104: `val gray = MaterialTheme.colorScheme.surfaceVariant`
- L121: `fun NoPhotoPlaceholder(`
- L151: `fun LoadingView(`
- L175: `fun ErrorView(`
- L224: `fun EmptyView(`
- L276: `fun listingPhotoUrl(storagePath: String?): String? {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/DzirentApp.kt` (257 lines)

- L22: `sealed class AuthScreenState {`
- L23: `object Loading : AuthScreenState()`
- L24: `object AuthFlow : AuthScreenState()`
- L25: `data class Authenticated(val profile: Profile) : AuthScreenState()`
- L27: `data class NeedsTerms(val profile: Profile) : AuthScreenState()`
- L29: `data class AgeBlocked(val profile: Profile) : AuthScreenState()`
- L30: `object Guest : AuthScreenState()`
- L53: `fun DzirentApp(`
- L64: `var screenState by remember { mutableStateOf<AuthScreenState>(AuthScreenState.Loading) }`
- L65: `var firstVisitSeen by rememberSaveable { mutableStateOf(false) }`
- L66: `var pendingGatedAction by remember { mutableStateOf<GatedAction?>(null) }`
- L67: `var authStartDestination by rememberSaveable { mutableStateOf("welcome") }`
- L68: `val device = LocalDevice.current`
- L69: `val push = device.push`
- L70: `val scope = rememberCoroutineScope()`
- L84: `val signedInId = (screenState as? AuthScreenState.Authenticated)?.profile?.id`
- L219: `fun AuthNavHost(`
- L225: `val authNavController = rememberNavController()`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/FilterSheet.kt` (169 lines)

- L26: `fun FilterSheet(`
- L31: `var draft by remember { mutableStateOf(current) }`
- L32: `var minText by remember { mutableStateOf(priceInputText(current.minPrice)) }`
- L33: `var maxText by remember { mutableStateOf(priceInputText(current.maxPrice)) }`
- L34: `var sizeText by remember { mutableStateOf(current.size.orEmpty()) }`
- L35: `val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)`
- L36: `val settings = LocalAppSettings.current`
- L38: `val minPrice = parsePrice(minText)`
- L39: `val maxPrice = parsePrice(maxText)`
- L40: `val priceError = when {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/GuestGate.kt` (53 lines)

- L6: `enum class GatedAction(val title: String, val message: String) {`
- L28: `val requiresSignIn: Boolean get() = true`
- L34: `object GuestGate {`
- L38: `fun requiresSignIn(action: GatedAction): Boolean = action.requiresSignIn`
- L44: `fun isActionAllowed(isGuest: Boolean, action: GatedAction): Boolean {`
- L51: `fun isBrowsingAllowedForGuest(): Boolean = true`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Guide.kt` (211 lines)

- L45: `class GuideTargets {`
- L46: `val bounds = mutableStateMapOf<GuideTarget, Rect>()`
- L49: `val LocalGuideTargets = staticCompositionLocalOf { GuideTargets() }`
- L53: `fun Modifier.guideTarget(target: GuideTarget): Modifier {`
- L54: `val targets = LocalGuideTargets.current`
- L66: `fun GuideOverlay(steps: List<GuideStep>, targets: GuideTargets, onFinish: () -> Unit) {`
- L67: `var index by rememberSaveable { mutableIntStateOf(0) }`
- L68: `var origin by remember { mutableStateOf(Offset.Zero) }`
- L69: `val density = LocalDensity.current`
- L70: `val step = steps[index.coerceIn(0, steps.lastIndex)]`
- L71: `val isLast = index >= steps.lastIndex`
- L76: `val hole = targets.bounds[step.target]?.translate(-origin)?.inflate(with(density) { 6.dp.toPx() })`
- L124: `val insets = WindowInsets.safeDrawing`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/HomeScreen.kt` (461 lines)

- L47: `fun HomeScreen(`
- L62: `val lat = if (isGuest) guestLat else profile?.approxLat`
- L63: `val lng = if (isGuest) guestLng else profile?.approxLng`
- L64: `val scope = rememberCoroutineScope()`
- L65: `var showDatePicker by remember { mutableStateOf(false) }`
- L66: `var refreshing by remember { mutableStateOf(false) }`
- L67: `var studiosTab by rememberSaveable { mutableStateOf(false) }`
- L68: `val unit = LocalAppSettings.current.distanceUnit`
- L69: `val radiusKm = unit.radiusKm(session.filters.distanceStep)`
- L170: `val displayName = if (isGuest || profile == null) "?" else profile.displayName`
- L171: `val cityText = (if (isGuest) guestCity else profile?.city)?.ifBlank { null } ?: "Set location"`
- L392: `fun StudioCard(studio: StudioSummary, onClick: (() -> Unit)?) {`
- L423: `fun SeeAllScreen(`
- L432: `val listings = session.sections()?.let { row.listings(it) }.orEmpty()`
- L433: `val suggestions = rememberSuggestions(`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Legal.kt` (323 lines)

- L33: `const val MEASUREMENTS_CONSENT_TEXT =`
- L39: `fun rememberOpenLink(): (String) -> Unit {`
- L40: `val uriHandler = LocalUriHandler.current`
- L41: `val device = LocalDevice.current`
- L55: `fun LegalLinksText(`
- L62: `val open = rememberOpenLink()`
- L63: `val linkStyles = TextLinkStyles(`
- L66: `val text = buildAnnotatedString {`
- L81: `fun TermsUpdateScreen(`
- L86: `val scope = rememberCoroutineScope()`
- L87: `val device = LocalDevice.current`
- L88: `var isBusy by remember { mutableStateOf(false) }`
- L89: `var error by remember { mutableStateOf<String?>(null) }`
- L172: `fun MeasurementsConsentDialog(onAgree: () -> Unit, onNotNow: () -> Unit) {`
- L188: `fun MeasurementsConsentSetting(repository: DzirentRepository) {`
- L189: `val scope = rememberCoroutineScope()`
- L190: `val device = LocalDevice.current`
- L191: `var saved by remember { mutableStateOf<PrivateProfile?>(null) }`
- L192: `var loadFailed by remember { mutableStateOf(false) }`
- L193: `var confirmWithdraw by remember { mutableStateOf(false) }`
- L194: `var isWithdrawing by remember { mutableStateOf(false) }`
- L202: `val current = saved`
- L262: `fun DataExportSetting(repository: DzirentRepository, userId: String) {`
- L263: `val scope = rememberCoroutineScope()`
- L264: `val device = LocalDevice.current`
- L265: `val open = rememberOpenLink()`
- L266: `var isBusy by remember { mutableStateOf(false) }`
- L267: `var status by remember { mutableStateOf<String?>(null) }`
- L269: `fun download() {`
- L312: `fun HelpAndLegalSection() {`
- L313: `val open = rememberOpenLink()`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ListingEditor.kt` (794 lines)

- L75: `fun ListingEditorScreen(`
- L83: `var loadState by remember(listingId) {`
- L86: `val scope = rememberCoroutineScope()`
- L88: `fun load() {`
- L140: `object Idle : PublishState()`
- L141: `data class Running(val progress: String) : PublishState()`
- L142: `data class Failed(val step: String, val message: String) : PublishState()`
- L163: `val device = LocalDevice.current`
- L164: `val scope = rememberCoroutineScope()`
- L165: `val settings = LocalAppSettings.current`
- L166: `val today = remember { today() }`
- L167: `val state = remember { ListingEditorState(original, settings.measureUnit.key, today) }`
- L168: `val isNew = state.isNew`
- L169: `val publisher = remember { ListingPublisher(repository, device, original) }`
- L170: `val analyzer = device.photoAnalyzer`
- L171: `val photoStore = remember { device.photoStore(profile.id) }`
- L172: `val drafts = remember { device.draftStore(profile.id, original?.id) }`
- L173: `val declarationCache = remember { DeclarationCache(device.prefs) }`
- L175: `var errorMessage by remember { mutableStateOf<String?>(null) }`
- L176: `var publishState by remember { mutableStateOf<PublishState>(PublishState.Idle) }`
- L177: `var showWhatCanIList by remember { mutableStateOf(false) }`
- L180: `var visionRequired by remember { mutableStateOf(false) }`
- L190: `var declarationSigned by remember { mutableStateOf(declarationCache.isSigned(profile.id, AccessoryDeclaration.VERSION)) }`
- L191: `var declarationChecked by remember { mutableStateOf(declarationSigned) }`
- L192: `var showDeclaration by remember { mutableStateOf(false) }`
- L193: `var declarationOffered by remember { mutableStateOf(false) }`
- L205: `val declarationPending = declarationNeeded(state.category, state.jewelrySuggested, declarationSigned)`
- L216: `val photoKeys = state.slots.values.map { it.key }.toSet()`
- L232: `fun draftRow(): Listing? {`
- L246: `fun orderedPhotos(): List<Pair<PhotoSlot, PhotoItem>> = PhotoSlot.entries.mapNotNull { slot -> state.slots[slot]?.let { slot to it } }`
- L248: `var syncJob by remember { mutableStateOf<Job?>(null) }`
- L251: `fun startPhotoCheck() {`
- L276: `fun checkAgain() {`
- L324: `var draftOffer by remember { mutableStateOf<SavedDraft?>(null) }`
- L325: `var draftChecked by remember { mutableStateOf(false) }`
- L326: `var finished by remember { mutableStateOf(false) }`
- L329: `suspend fun restoreDraft(saved: SavedDraft) {`
- L348: `var sessionStarted by rememberSaveable { mutableStateOf(false) }`
- L399: `fun next() {`
- L426: `suspend fun awaitCheck(onProgress: (String) -> Unit) {`
- L435: `fun publish() {`
- L737: `fun DepositFields(`
- L778: `val retailValue = retailValueText.toDoubleOrNull()`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ListingEditorSections.kt` (266 lines)

- L35: `data class MeasurementRow(`
- L41: `fun toInput() = MeasurementInput(label, valueText)`
- L44: `val isUnused: Boolean get() = toInput().isBlank || (template && valueText.isBlank())`
- L54: `fun MeasurementsSection(`
- L62: `val errors = validateMeasurements(rows.map { if (it.isUnused) MeasurementInput("", "") else it.toInput() })`
- L133: `val present = rows.map { it.label.trim().lowercase() }.toSet()`
- L134: `val remaining = suggestions.filter { it.lowercase() !in present }`
- L156: `fun AvailabilitySection(`
- L160: `var showPicker by remember { mutableStateOf(false) }`
- L161: `var error by remember { mutableStateOf<String?>(null) }`
- L219: `fun DateRangePickerDialog(`
- L227: `val todayUtcMillis = remember { today().utcMillis() }`
- L228: `val currentYear = remember { today().year }`
- L229: `val state = rememberDateRangePickerState(`
- L237: `val startMillis = state.selectedStartDateMillis`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ListingEditorState.kt` (406 lines)

- L54: `const val STEP_PHOTOS = 1`
- L55: `const val STEP_DETAILS = 2`
- L56: `const val STEP_PRICE = 3`
- L62: `class ListingEditorState(val original: Listing?, defaultUnit: String, today: LocalDate) {`
- L63: `val isNew = original == null`
- L66: `val isDraft = original?.isDraft == true`
- L69: `var listingId by mutableStateOf(original?.id ?: generateUuid())`
- L71: `var step by mutableIntStateOf(STEP_PHOTOS)`
- L74: `val slots = mutableStateMapOf<PhotoSlot, PhotoItem>()`
- L76: `val reviews = mutableStateMapOf<String, PhotoReview>()`
- L77: `val analyses = mutableStateMapOf<String, PhotoAnalysis>()`
- L78: `var photosChanged by mutableStateOf(false)`
- L81: `var checkPhase by mutableStateOf(CheckPhase.NONE)`
- L82: `var uploadError by mutableStateOf<String?>(null)`
- L83: `var scanId by mutableStateOf<String?>(null)`
- L84: `var scan by mutableStateOf<ListingScan?>(null)`
- L86: `var checkedPhotos by mutableStateOf<String?>(null)`
- L88: `val serverWarnings = mutableStateMapOf<String, List<String>>()`
- L90: `var jewelrySuggested by mutableStateOf(false)`
- L93: `var title by mutableStateOf(textValue(if (isDraft) "" else original?.title.orEmpty()))`
- L94: `var category by mutableStateOf(if (isDraft) null else original?.category)`
- L95: `var itemType by mutableStateOf(original?.itemType)`
- L96: `var description by mutableStateOf(textValue(original?.description.orEmpty()))`
- L97: `var styles by mutableStateOf(original?.listingStyles.orEmpty().filter { it in FashionStyles.ALL })`
- L98: `val fields = mutableStateMapOf<SuggestField, FieldState>()`
- L100: `var recognizedKind by mutableStateOf<GarmentKind?>(null)`
- L101: `var pickedKind by mutableStateOf(GarmentKind.fromKey(original?.garmentType))`
- L104: `var sizeLabel by mutableStateOf(original?.sizeLabel.orEmpty())`
- L105: `var unit by mutableStateOf(original?.measurements?.firstOrNull()?.unit ?: defaultUnit)`
- L106: `var measurementRows by mutableStateOf(`
- L109: `var sameAsAnswered by mutableStateOf(!isNew && !isDraft)`
- L110: `var priceText by mutableStateOf(priceInputText(original?.priceUsd))`
- L111: `var priceNote by mutableStateOf(original?.priceNote.orEmpty())`
- L112: `var retailValueText by mutableStateOf(original?.retailValue?.let { formatNumber(it) }.orEmpty())`
- L113: `var depositNote by mutableStateOf(original?.depositNote.orEmpty())`
- L115: `var depositAmountText by mutableStateOf(priceInputText(original?.depositAmount))`
- L116: `var paymentsEnabled by mutableStateOf(false)`
- L117: `var ranges by mutableStateOf(`
- L121: `var listingDeclarationChecked by mutableStateOf(false)`
- L122: `var aiReviewNeeded by mutableStateOf(original?.aiReviewNeeded ?: false)`
- L128: `var textErrors by mutableStateOf<Map<String, String>>(emptyMap())`
- L130: `fun clearTextError(column: String) {`
- L151: `val isAccessory: Boolean get() = category == Categories.ACCESSORIES`
- L152: `val kind: GarmentKind? get() = garmentKindFor(recognizedKind, pickedKind, category)`
- L154: `fun field(f: SuggestField) = fields[f] ?: FieldState()`
- L159: `fun reviewOf(slot: PhotoSlot): PhotoReview? {`
- L167: `val verdicts: Map<PhotoSlot, PhotoVerdict> get() = slots.keys.associateWith { reviewOf(it)!!.verdict }`
- L169: `fun photosGate() = photoGate(`
- L174: `fun reviewFor(analysis: PhotoAnalysis): PhotoReview =`
- L177: `fun removePhoto(slot: PhotoSlot) {`
- L183: `fun currentPhotoKey(): String = photoSetKey(slots.mapValues { it.value.key })`
- L186: `val photosNeedCheck: Boolean get() = scanId == null || checkedPhotos != currentPhotoKey()`
- L188: `val banner get() = checkBanner(checkPhase, scan, uploadError)`
- L193: `fun applySuggestion(s: ListingSuggestions) {`
- L220: `fun editTitle(value: TextFieldValue) {`
- L229: `fun editDescription(value: TextFieldValue) {`
- L238: `fun pickCategory(value: String) {`
- L244: `fun editStyles(value: List<String>) {`
- L249: `fun clear(f: SuggestField) {`
- L265: `fun refreshMeasurementTemplate() {`
- L272: `fun refreshFixedSize() {`
- L278: `val usedMeasurementRows: List<MeasurementRow> get() = measurementRows.filterNot { it.isUnused }`
- L280: `val measurementsOk: Boolean get() = validateMeasurements(usedMeasurementRows.map { it.toInput() }).all { it == null }`
- L282: `fun step2Input(hasLocation: Boolean) = Step2Input(`
- L296: `fun outcomeEvents(listingId: String): List<SuggestionEvent> = SuggestField.entries.mapNotNull { f ->`
- L311: `fun toDraft(listingCreated: Boolean, uploaded: Map<String, ListingPhoto>) = SavedDraft(`
- L348: `fun restore(draft: SavedDraft) {`
- L392: `fun forgetCheck() {`
- L402: `fun textValue(text: String) = TextFieldValue(text, TextRange(text.length))`
- L405: `fun formatNumber(value: Double): String =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ListingStepDetails.kt` (350 lines)

- L53: `fun SizePriceDatesStep(`
- L60: `val kind = state.kind`
- L66: `val mine by produceState<List<Listing>>(emptyList()) {`
- L154: `val retailError = accessoryValueError(state.isAccessory, state.retailValueText)`
- L155: `val noteRefused = state.textErrors["price_note"] != null || state.textErrors["deposit_note"] != null ||`
- L157: `var moreOpen by remember { mutableStateOf(retailError != null) }`
- L204: `fun SizePicker(kind: GarmentKind, sizeLabel: String, onSizeLabel: (String) -> Unit) {`
- L205: `val systems = Sizes.systemsFor(kind)`
- L210: `val parsed = remember(kind) { Sizes.parse(kind, sizeLabel) }`
- L211: `var systemIndex by remember(kind) { mutableIntStateOf(parsed?.let { systems.indexOf(it.first) }?.coerceAtLeast(0) ?: 0) }`
- L212: `val system = systems[systemIndex]`
- L213: `val picks = remember(kind, systemIndex) {`
- L278: `var showPicker by remember { mutableStateOf(false) }`
- L279: `var error by remember { mutableStateOf<String?>(null) }`
- L330: `fun ReadyList(photosDone: Boolean, detailsDone: Boolean, input: Step2Input) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ListingStepPhotos.kt` (529 lines)

- L65: `fun PhotosStep(`
- L71: `var targetKey by rememberSaveable { mutableStateOf<String?>(null) }`
- L72: `var choosingSourceFor by remember { mutableStateOf<PhotoSlot?>(null) }`
- L73: `val remaining = MAX_PHOTOS - state.slots.size`
- L75: `fun add(uris: List<String>) {`
- L86: `val start = rememberPhotoSources(photoStore = photoStore, maxPhotos = MAX_PHOTOS, onPhotos = { add(it) }, onMessage = onMessage)`
- L152: `fun DetailsStep(state: ListingEditorState, onOpenDeclaration: () -> Unit) {`
- L153: `val anySuggested = SuggestField.entries.any { state.field(it).origin == FieldOrigin.SUGGESTED }`
- L236: `val shape = RoundedCornerShape(8.dp)`
- L237: `val name = slot.label + if (slot.required) "" else " (optional)"`
- L334: `fun PhotoCheckBanner(banner: CheckBanner?, onRetry: () -> Unit, onReplacePhotos: () -> Unit) {`
- L336: `val error = banner is CheckBanner.Rejected || banner is CheckBanner.UploadFailed || banner is CheckBanner.Failed`
- L382: `val color = when (review.verdict) {`
- L462: `var expanded by remember { mutableStateOf(false) }`
- L501: `var expanded by remember { mutableStateOf(false) }`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/LocalAppSettings.kt` (11 lines)

- L10: `val LocalAppSettings = staticCompositionLocalOf { AppSettings() }`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/LocationSetup.kt` (191 lines)

- L30: `fun LocationSetupDialog(`
- L38: `val scope = rememberCoroutineScope()`
- L39: `val locationService = LocalDevice.current.locationService`
- L41: `var step by remember { mutableStateOf(LocationStep.Reason) }`
- L42: `var workingText by remember { mutableStateOf("") }`
- L43: `var message by remember { mutableStateOf<String?>(null) }`
- L44: `var found by remember { mutableStateOf<ApproxPlace?>(null) }`
- L45: `var pickedCity by remember { mutableStateOf<UsCity?>(null) }`
- L46: `var isSaving by remember { mutableStateOf(false) }`
- L48: `fun locate() {`
- L72: `fun save(lat: Double, lng: Double, city: String) {`
- L86: `val requestPermission = rememberLocationPermissionRequest { granted ->`
- L191: `expect fun rememberLocationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/MainAppScaffold.kt` (689 lines)

- L68: `fun MainAppScaffold(`
- L83: `val navController = rememberNavController()`
- L84: `val scope = rememberCoroutineScope()`
- L85: `val device = LocalDevice.current`
- L87: `var profile by remember { mutableStateOf(userProfile) }`
- L88: `val me = profile?.id.orEmpty()`
- L89: `var currentTab by rememberSaveable { mutableStateOf(TabHome.route) }`
- L90: `var showLocationSetup by remember { mutableStateOf(false) }`
- L91: `var inboxHasNews by remember { mutableStateOf(false) }`
- L92: `val backStackEntry by navController.currentBackStackEntryAsState()`
- L95: `var guestCity by rememberSaveable { mutableStateOf<String?>("Austin, TX") }`
- L96: `var guestLat by rememberSaveable { mutableStateOf<Double?>(30.27) }`
- L97: `var guestLng by rememberSaveable { mutableStateOf<Double?>(-97.74) }`
- L100: `val settings = LocalAppSettings.current`
- L101: `val session = remember(profile?.id, isGuest) {`
- L111: `val drawerState = rememberDrawerState(DrawerValue.Closed)`
- L112: `var showFilterSheet by remember { mutableStateOf(false) }`
- L113: `val onHome = backStackEntry?.destination?.route == TabHome.route`
- L116: `val onboarding = remember(profile?.id) { profile?.let { OnboardingStore(device.prefs, it.id) } }`
- L117: `var showWelcome by remember { mutableStateOf(false) }`
- L118: `var guideActive by rememberSaveable { mutableStateOf(false) }`
- L119: `val guideTargets = remember { GuideTargets() }`
- L120: `var setupCardDismissed by remember(profile?.id) { mutableStateOf(onboarding?.setupCardDismissed ?: true) }`
- L122: `var loadedSetup by remember(profile?.id) { mutableStateOf<SetupStatus?>(null) }`
- L123: `val setupStatus = profile?.let { p -> loadedSetup?.copy(location = p.hasLocation, studio = !p.studioHandle.isNullOrBlank()) }`
- L124: `val route = backStackEntry?.destination?.route`
- L135: `suspend fun refreshSetup() {`
- L148: `suspend fun refreshInboxDot() {`
- L184: `fun openTab(route: String) {`
- L212: `fun openChat(conversationId: String, draft: String? = null) =`
- L224: `fun startChat(listingId: String, lenderId: String, draft: String? = null) {`
- L240: `fun openStudio(lenderId: String) {`
- L257: `fun closeDrawer() {`
- L262: `fun openFromDrawer(route: String) {`
- L272: `fun startGuide() {`
- L280: `val signedIn = profile`
- L676: `expect fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit)`
- L683: `expect fun PlatformNavigationBackHandler(navController: NavHostController)`
- L689: `expect fun Modifier.consumeScaffoldInsets(padding: PaddingValues): Modifier`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/MainScreens.kt` (1155 lines)

- L61: `sealed class UiState<out T> {`
- L62: `object Loading : UiState<Nothing>()`
- L63: `data class Error(val message: String) : UiState<Nothing>()`
- L64: `data class Success<T>(val data: T) : UiState<T>()`
- L68: `fun cardSubtitle(listing: Listing, unit: DistanceUnit): String =`
- L80: `fun ListingCard(listing: Listing, onClick: () -> Unit, modifier: Modifier = Modifier) {`
- L81: `val subtitle = cardSubtitle(listing, LocalAppSettings.current.distanceUnit)`
- L119: `fun ListingDetailScreen(`
- L132: `val isGuest = onGuestAction != null`
- L133: `var uiState by remember { mutableStateOf<UiState<Listing>>(UiState.Loading) }`
- L134: `var menuOpen by remember { mutableStateOf(false) }`
- L135: `var reportTarget by remember { mutableStateOf<ReportTarget?>(null) }`
- L137: `var isSaved by remember { mutableStateOf<Boolean?>(null) }`
- L138: `var savingBookmark by remember { mutableStateOf(false) }`
- L139: `var viewRecorded by remember { mutableStateOf(false) }`
- L140: `val scope = rememberCoroutineScope()`
- L141: `val device = LocalDevice.current`
- L143: `fun loadDetail() {`
- L164: `fun toggleSaved(listing: Listing) {`
- L405: `val shape = RoundedCornerShape(12.dp)`
- L415: `val pagerState = rememberPagerState { photos.size }`
- L455: `val unit = LocalAppSettings.current.measureUnit`
- L482: `fun MyClosetScreen(`
- L492: `var selectedTab by rememberSaveable { mutableIntStateOf(0) }`
- L530: `fun ScreenTitle(text: String) {`
- L552: `var uiState by remember { mutableStateOf<UiState<ClosetData>>(UiState.Loading) }`
- L553: `var sort by rememberSaveable { mutableStateOf(ClosetSort.NEWEST) }`
- L554: `var sortMenuOpen by remember { mutableStateOf(false) }`
- L555: `var busyIds by remember { mutableStateOf(emptySet<String>()) }`
- L556: `var actionError by remember { mutableStateOf<String?>(null) }`
- L557: `var pendingDelete by remember { mutableStateOf<Listing?>(null) }`
- L558: `val scope = rememberCoroutineScope()`
- L560: `fun loadMyListings() {`
- L573: `fun updateListing(id: String, transform: (Listing) -> Listing?) {`
- L578: `fun setActive(listing: Listing, active: Boolean) {`
- L598: `fun delete(listing: Listing) {`
- L718: `val isActive = listing.status == "active"`
- L720: `val isDraft = listing.isDraft`
- L823: `fun MyRentalsScreen(`
- L830: `var uiState by remember { mutableStateOf<UiState<List<RentalView>>>(UiState.Loading) }`
- L831: `val scope = rememberCoroutineScope()`
- L833: `fun loadRentals() {`
- L946: `fun ListingThumbnail(listing: Listing?, size: androidx.compose.ui.unit.Dp) {`
- L959: `fun ProfileScreen(`
- L970: `val scope = rememberCoroutineScope()`
- L971: `var isRefreshing by remember { mutableStateOf(true) }`
- L972: `var refreshError by remember { mutableStateOf<String?>(null) }`
- L973: `var isSaving by remember { mutableStateOf(false) }`
- L974: `var actionError by remember { mutableStateOf<String?>(null) }`
- L976: `var pendingRenterSwitch by remember { mutableStateOf<List<Listing>?>(null) }`
- L978: `fun refresh() {`
- L991: `fun saveRole(role: String, pauseFirst: List<Listing> = emptyList()) {`
- L1005: `fun onRoleSelected(role: String) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Moderation.kt` (291 lines)

- L30: `data class ReportTarget(val targetType: String, val targetId: String, val title: String)`
- L38: `fun rememberSuspensionNotice(repository: DzirentRepository): String? {`
- L39: `val notice by produceState<String?>(null, repository) {`
- L47: `fun SuspensionNotice(text: String, modifier: Modifier = Modifier) {`
- L62: `fun ReportDialog(`
- L68: `val scope = rememberCoroutineScope()`
- L69: `var reason by remember { mutableStateOf<String?>(null) }`
- L70: `var details by remember { mutableStateOf("") }`
- L71: `var isSending by remember { mutableStateOf(false) }`
- L72: `var error by remember { mutableStateOf<String?>(null) }`
- L73: `var sent by remember { mutableStateOf(false) }`
- L74: `val suspended = rememberSuspensionNotice(repository)`
- L182: `fun BlockUserDialog(name: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {`
- L203: `fun BlockedUsersScreen(`
- L208: `var uiState by remember { mutableStateOf<UiState<List<Block>>>(UiState.Loading) }`
- L209: `var busyIds by remember { mutableStateOf(emptySet<String>()) }`
- L210: `var actionError by remember { mutableStateOf<String?>(null) }`
- L211: `val scope = rememberCoroutineScope()`
- L213: `fun load() {`
- L224: `fun unblock(block: Block) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/MyStudioScreen.kt` (249 lines)

- L39: `fun PayoutsSection(repository: DzirentRepository) {`
- L40: `val scope = rememberCoroutineScope()`
- L41: `val uriHandler = LocalUriHandler.current`
- L42: `var paymentsOn by remember { mutableStateOf(false) }`
- L43: `var account by remember { mutableStateOf<PayoutAccount?>(null) }`
- L44: `var loaded by remember { mutableStateOf(false) }`
- L45: `var busy by remember { mutableStateOf(false) }`
- L46: `var openedSetup by remember { mutableStateOf(false) }`
- L47: `var message by remember { mutableStateOf<String?>(null) }`
- L72: `val state = payoutState(account != null, account?.chargesEnabled == true, account?.payoutsEnabled == true)`
- L111: `fun MyStudioScreen(`
- L117: `val scope = rememberCoroutineScope()`
- L118: `var name by rememberSaveable { mutableStateOf(profile.studioName.orEmpty()) }`
- L119: `var handle by rememberSaveable {`
- L122: `var bio by rememberSaveable { mutableStateOf(profile.studioBio.orEmpty()) }`
- L123: `var tags by rememberSaveable { mutableStateOf(profile.styleTags) }`
- L124: `var pickup by rememberSaveable { mutableStateOf(profile.pickupArea.orEmpty()) }`
- L125: `var isSaving by remember { mutableStateOf(false) }`
- L126: `var error by remember { mutableStateOf<String?>(null) }`
- L128: `var fieldErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }`
- L129: `val handleError = handle.takeIf { it.isNotEmpty() && !isValidHandle(it) }?.let {`
- L133: `fun save() {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Notifications.kt` (94 lines)

- L21: `class NotificationPromptStore(private val prefs: KeyValueStore) {`
- L22: `val asked: Boolean get() = prefs.getBoolean(PROMPT_KEY, false)`
- L24: `fun markAsked() = prefs.putBoolean(PROMPT_KEY, true)`
- L27: `var systemAsked: Boolean`
- L39: `fun NotificationPromptDialog(onTurnOn: () -> Unit, onDismiss: () -> Unit) {`
- L61: `fun rememberTurnOnNotifications(onResult: (Boolean) -> Unit): () -> Unit {`
- L62: `val device = LocalDevice.current`
- L63: `val store = remember { NotificationPromptStore(device.prefs) }`
- L64: `val ask = rememberNotificationPermissionRequest(onResult)`
- L80: `expect fun rememberNotificationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit`
- L83: `suspend fun registerPush(repository: DzirentRepository, push: PushService, userId: String) {`
- L85: `val token = push.token() ?: return`
- L90: `suspend fun stopPush(repository: DzirentRepository, push: PushService) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/PaymentSheet.kt` (29 lines)

- L11: `sealed interface PaymentSheetOutcome {`
- L13: `data object Completed : PaymentSheetOutcome`
- L15: `data object Canceled : PaymentSheetOutcome`
- L17: `data class Failed(val code: String) : PaymentSheetOutcome`
- L20: `interface PaymentSheetLauncher {`
- L22: `val available: Boolean`
- L25: `fun present(publishableKey: String, clientSecret: String)`
- L29: `expect fun rememberPaymentSheetLauncher(onOutcome: (PaymentSheetOutcome) -> Unit): PaymentSheetLauncher`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/PhotoPermissions.kt` (66 lines)

- L16: `enum class PhotoSource { Camera, Gallery }`
- L22: `class PhotoConsentStore(private val prefs: KeyValueStore) {`
- L23: `fun hasConsent(source: PhotoSource): Boolean = prefs.getBoolean(key(source), false)`
- L25: `fun giveConsent(source: PhotoSource) {`
- L37: `fun PhotoConsentDialog(source: PhotoSource, onContinue: () -> Unit, onDismiss: () -> Unit) {`
- L38: `val camera = source == PhotoSource.Camera`
- L61: `expect fun rememberPhotoSources(`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Policy.kt` (241 lines)

- L24: `object DzirentPolicy {`
- L25: `const val TITLE = "How Dzirent works"`
- L27: `const val FULL_TEXT =`
- L33: `const val COMMUNITY_TITLE = "Community policy"`
- L36: `const val COMMUNITY_RULES =`
- L41: `const val PROHIBITED_TITLE = "What can't be listed"`
- L47: `val ITEM_RULES: String = ItemLabels.SCOPE + "\n" + ItemLabels.notAllowedText + "\n" + ItemLabels.notOfferedText`
- L49: `const val WHAT_CAN_I_LIST_TITLE = "What can I list?"`
- L52: `val CAN_LIST: String = "You can list clothing in " +`
- L57: `val JEWELRY_NOTE: String =`
- L62: `const val PHOTO_CHECK_NOTE =`
- L66: `val PROHIBITED_ITEMS: String =`
- L70: `const val LISTING_NOTICE =`
- L74: `const val CHAT_SAFETY_TIP =`
- L80: `const val DEPOSIT_SUGGESTION_USD = 150.0`
- L82: `const val DEPOSIT_TIP = "This is a valuable piece. Consider asking renters for a refundable deposit."`
- L107: `fun HowDzirentWorksScreen(onBack: () -> Unit) {`
- L114: `fun CommunityPolicyScreen(onBack: () -> Unit) {`
- L151: `fun HowDzirentWorksDialog(onDismiss: () -> Unit) {`
- L166: `fun WhatCanIListSheet(onDismiss: () -> Unit) {`
- L197: `fun PolicyNotice(`
- L234: `class SafetyTipStore(private val prefs: KeyValueStore) {`
- L235: `fun isDismissed(conversationId: String): Boolean =`
- L238: `fun dismiss(conversationId: String) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/RentalViews.kt` (475 lines)

- L53: `fun rentalSummaryLine(rental: RentalView): String = listOfNotNull(`
- L59: `fun RentalView.paymentFacts(now: Instant = nowInstant()): PaymentFacts = PaymentFacts(`
- L69: `fun RentalView.actions(now: Instant = nowInstant()): List<RentalAction> = rentalActions(status, iAmLender, paymentFacts(now))`
- L76: `fun rentalPaymentLines(rental: RentalView, now: Instant = nowInstant()): List<String> = buildList {`
- L77: `val lender = rental.iAmLender`
- L112: `fun RentalCard(`
- L120: `val otherName = rental.otherName?.ifBlank { null } ?: "the other person"`
- L121: `var showAllSteps by remember(rental.id) { mutableStateOf(false) }`
- L219: `fun RentalRequestDialog(`
- L227: `val todayDate = remember { today() }`
- L228: `val start = initial?.takeIf { rentalDatesProblem(it, windows, booked, todayDate) == null }`
- L229: `val state = rememberDateRangePickerState(`
- L238: `val picked = state.selectedStartDateMillis?.let { s ->`
- L242: `val problem = picked?.let { rentalDatesProblem(it, windows, booked, todayDate) }`
- L276: `fun CancelRentalDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {`
- L277: `var reason by remember { mutableStateOf("") }`
- L302: `fun PayDialog(rental: RentalView, onDismiss: () -> Unit, onContinue: () -> Unit) {`
- L331: `fun ClaimDialog(`
- L337: `var amount by remember { mutableStateOf("") }`
- L338: `var reason by remember { mutableStateOf("") }`
- L339: `val returnPhotos = rental.photos.filter { it.stage == "return" }`
- L340: `var chosen by remember { mutableStateOf(returnPhotos.map { it.storagePath }.toSet()) }`
- L341: `val deposit = rental.depositAmount`
- L342: `val amountProblem = amount.takeIf { it.isNotBlank() }?.let { claimAmountProblem(it, deposit) }`
- L343: `val problem = claimAmountProblem(amount, deposit) ?: claimReasonProblem(reason) ?: claimPhotosProblem(chosen.size)`
- L405: `fun ClaimAnswerDialog(accept: Boolean, amount: Double, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {`
- L406: `var note by remember { mutableStateOf("") }`
- L431: `fun ReceiptDialog(rental: RentalView, onDismiss: () -> Unit) {`
- L432: `val lines = rentalReceipt(`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/SavedScreen.kt` (253 lines)

- L37: `fun SavedScreen(`
- L46: `val scope = rememberCoroutineScope()`
- L47: `val device = LocalDevice.current`
- L48: `var uiState by remember { mutableStateOf<UiState<SavedData>>(UiState.Loading) }`
- L49: `var studiosTab by rememberSaveable { mutableStateOf(false) }`
- L51: `fun load() {`
- L63: `fun update(transform: (SavedData) -> SavedData, undo: (SavedData) -> SavedData, call: suspend () -> Unit) {`
- L76: `fun removePiece(saved: SavedListing) = update(`
- L82: `fun removeStudio(saved: SavedStudio) = update(`
- L156: `val state = rememberSwipeToDismissBoxState(`
- L184: `val listing = saved.listing`
- L228: `val lender = saved.lender`
- L229: `val title = lender?.studioTitle ?: "Studio"`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/SearchScreen.kt` (340 lines)

- L33: `class RecentSearchStore(private val storage: SettingsStorage?, private val userId: String) {`
- L36: `fun load(): List<String> = storage?.getRecentSearches(userId) ?: inMemory.toList()`
- L38: `fun add(query: String): List<String> {`
- L49: `fun clear() {`
- L65: `fun SearchScreen(`
- L77: `val effectiveUserId = if (isGuest) "guest" else profile?.id.orEmpty()`
- L78: `val store = remember(effectiveUserId, settingsStorage) { RecentSearchStore(settingsStorage, effectiveUserId) }`
- L79: `var query by rememberSaveable { mutableStateOf("") }`
- L80: `var recent by remember { mutableStateOf(store.load()) }`
- L81: `var sort by rememberSaveable { mutableStateOf(SearchSort.NEAREST) }`
- L82: `var sortMenuOpen by remember { mutableStateOf(false) }`
- L83: `var showDatePicker by remember { mutableStateOf(false) }`
- L84: `var showFilters by remember { mutableStateOf(false) }`
- L86: `var anyDates by rememberSaveable { mutableStateOf(false) }`
- L87: `val focusRequester = remember { FocusRequester() }`
- L88: `val focusManager = LocalFocusManager.current`
- L89: `val scope = rememberCoroutineScope()`
- L90: `val lat = if (isGuest) guestLat else profile?.approxLat`
- L91: `val lng = if (isGuest) guestLng else profile?.approxLng`
- L94: `val settings = LocalAppSettings.current`
- L95: `val radiusKm = settings.distanceUnit.radiusKm(session.filters.distanceStep)`
- L100: `fun saveRecent(q: String) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/SettingsScreen.kt` (559 lines)

- L47: `fun SettingsScreen(`
- L62: `val scope = rememberCoroutineScope()`
- L63: `val device = LocalDevice.current`
- L64: `val settings = LocalAppSettings.current`
- L65: `val email = remember { repository.currentEmail() }`
- L66: `var isSigningOut by remember { mutableStateOf(false) }`
- L67: `var error by remember { mutableStateOf<String?>(null) }`
- L68: `var showChangePassword by remember { mutableStateOf(false) }`
- L69: `var showDeleteAccount by remember { mutableStateOf(false) }`
- L226: `fun SettingsGroup(title: String) {`
- L238: `fun SettingsRow(`
- L297: `val scope = rememberCoroutineScope()`
- L298: `val device = LocalDevice.current`
- L299: `var saved by remember { mutableStateOf<NotificationSettings?>(null) }`
- L300: `var loadFailed by remember { mutableStateOf(false) }`
- L301: `var phoneAllows by remember { mutableStateOf(device.push.canNotify()) }`
- L302: `val turnOn = rememberTurnOnNotifications { phoneAllows = it }`
- L315: `fun save(updated: NotificationSettings) {`
- L328: `val current = saved`
- L398: `val scope = rememberCoroutineScope()`
- L399: `var current by remember { mutableStateOf("") }`
- L400: `var new by remember { mutableStateOf("") }`
- L401: `var isSaving by remember { mutableStateOf(false) }`
- L402: `var error by remember { mutableStateOf<String?>(null) }`
- L404: `fun save() {`
- L470: `val scope = rememberCoroutineScope()`
- L471: `val device = LocalDevice.current`
- L472: `var typed by remember { mutableStateOf("") }`
- L473: `var isDeleting by remember { mutableStateOf(false) }`
- L474: `var error by remember { mutableStateOf<String?>(null) }`
- L476: `var activeRental by remember { mutableStateOf<Boolean?>(null) }`
- L482: `fun delete() {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Sidebar.kt` (157 lines)

- L27: `fun SidebarContent(`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/StudioScreen.kt` (288 lines)

- L43: `fun StudioScreen(`
- L52: `val scope = rememberCoroutineScope()`
- L53: `val device = LocalDevice.current`
- L54: `var uiState by remember { mutableStateOf<UiState<StudioPage>>(UiState.Loading) }`
- L55: `var savingBookmark by remember { mutableStateOf(false) }`
- L56: `var showPiecePicker by remember { mutableStateOf(false) }`
- L58: `fun load() {`
- L69: `fun toggleSaved(page: StudioPage) {`
- L87: `val page = (uiState as? UiState.Success)?.data`
- L88: `val isMine = page?.isOwn == true || lenderId == currentUserId`
- L159: `val lender = page.lender`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Suggestions.kt` (136 lines)

- L28: `fun rememberSuggestions(`
- L38: `val device = LocalDevice.current`
- L39: `val unit = LocalAppSettings.current.distanceUnit`
- L40: `var groups by remember { mutableStateOf<List<SuggestionGroup>?>(null) }`
- L41: `val loaded = session.loadedListings()`
- L70: `fun LazyGridScope.suggestionItems(`
- L121: `fun SuggestionsGrid(`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Welcome.kt` (170 lines)

- L32: `class OnboardingStore(private val prefs: KeyValueStore, private val userId: String) {`
- L34: `val welcomeSeen: Boolean get() = prefs.getBoolean("welcome_seen_$userId", false)`
- L36: `fun markWelcomeSeen() {`
- L40: `val setupCardDismissed: Boolean get() = prefs.getBoolean("setup_card_dismissed_$userId", false)`
- L42: `fun dismissSetupCard() {`
- L53: `fun WelcomeDialog(`
- L146: `fun FinishSetupCard(onOpen: () -> Unit, onDismiss: () -> Unit) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/theme/Theme.kt` (163 lines)

- L30: `val DzirentAccent: Color`
- L40: `val DzirentLogoMark: Color`
- L44: `val DzirentPass: Color`
- L48: `val DzirentWarn: Color`
- L52: `val OnDzirentAccent: Color`
- L139: `fun DzirentTheme(`
- L143: `val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme`
- L163: `expect fun SystemBarIcons(darkTheme: Boolean)`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/AccessoryDeclaration.kt` (64 lines)

- L10: `object AccessoryDeclaration {`
- L11: `const val VERSION = 1`
- L13: `const val TITLE = "Accessory declaration"`
- L15: `const val INTRO = "Before you list jewelry or accessories, please confirm:"`
- L18: `val STATEMENTS = listOf(`
- L25: `const val NAME_LABEL = "Full legal name"`
- L27: `const val SIGN_BUTTON = "I agree and sign"`
- L30: `const val SIGNATURE_NOTE =`
- L34: `val TEXT: String = "$TITLE (v$VERSION)\n" + STATEMENTS.joinToString("\n") { "- $it" }`
- L37: `val LISTING_CHECKBOX = "This item isn't fine jewelry or precious metal and is worth under \$${ItemLabels.ACCESSORY_MAX_VALUE_USD}."`
- L42: `const val NAME_MAX = 120`
- L45: `fun nameError(name: String): String? {`
- L55: `fun canSign(checked: List<Boolean>, name: String): Boolean =`
- L63: `fun declarationNeeded(category: String?, jewelryFound: Boolean, signed: Boolean): Boolean =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Activity.kt` (94 lines)

- L8: `enum class ActivityKind { REQUESTED, ACCEPTED, DECLINED, EXPIRED, PICKED_UP, RETURNED, COMPLETED, CANCELLED, OTHER }`
- L11: `data class ActivityItem(`
- L23: `val text: String`
- L54: `fun buildActivity(`
- L62: `val kind = when (rental.status) {`
- L73: `val time = parse(rental.updatedAt) ?: parse(rental.createdAt) ?: return@mapNotNull null`
- L74: `val other = if (me == rental.renterId) rental.lender else rental.renter`
- L75: `val byMe = rental.updatedBy == me`
- L89: `fun hasUnread(conversation: Conversation, me: String, lastReadAt: String?): Boolean {`
- L90: `val last = conversation.lastMessage ?: return false`
- L92: `val sent = parse(last.createdAt) ?: return false`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/AgeGate.kt` (48 lines)

- L8: `const val AGE_GATE_MESSAGE = "Dzirent is only for people 18 and older."`
- L15: `object AgeGate {`
- L17: `fun recordFor(signal: AgeSignal): Pair<String, String> = when (signal) {`
- L24: `fun checkedToday(lastCheckedDay: String?, today: Int): Boolean = lastCheckedDay == today.toString()`
- L32: `suspend fun check(repository: DzirentRepository, device: DeviceServices, userId: String, onSignIn: Boolean): Boolean {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/AppSettings.kt` (29 lines)

- L4: `enum class ThemeMode(val key: String, val label: String) {`
- L9: `fun isDark(systemDark: Boolean): Boolean = when (this) {`
- L21: `data class AppSettings(`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/BodyMeasurements.kt` (52 lines)

- L4: `const val CM_PER_INCH = 2.54`
- L10: `enum class FitProfile(val dbValue: String, val label: String) {`
- L20: `enum class BodyMeasurement(val label: String, val column: String, val howTo: String) {`
- L29: `fun labelFor(profile: FitProfile?): String =`
- L33: `fun howToFor(profile: FitProfile?): String =`
- L38: `fun isValidBodyCm(cm: Double): Boolean = cm > 0.0 && cm < 300.0`
- L41: `fun bodyInputToCm(text: String, unit: String): Double? {`
- L42: `val value = text.trim().toDoubleOrNull() ?: return null`
- L43: `val cm = if (unit == "in") value * CM_PER_INCH else value`
- L48: `fun cmToBodyInput(cm: Double?, unit: String): String {`
- L50: `val value = if (unit == "in") cm / CM_PER_INCH else cm`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Browse.kt` (59 lines)

- L10: `data class BrowseFilters(`
- L22: `fun withCategory(newCategory: String?): BrowseFilters =`
- L32: `fun sizeMatches(sizeLabel: String, wanted: String): Boolean {`
- L33: `val target = normalizeSize(wanted)`
- L43: `fun Listing.matchesFilters(filters: BrowseFilters): Boolean {`
- L56: `fun Listing.matchesQuery(query: String): Boolean {`
- L57: `val q = query.trim()`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/DataExport.kt` (40 lines)

- L11: `object DataExport {`
- L13: `const val ONCE_A_DAY = "You can download your data once a day."`
- L18: `fun fileName(day: LocalDate): String = "dzirent-data-$day.json"`
- L21: `fun refusal(text: String?): String? {`
- L30: `fun kept(userId: String, fileName: String): ByteArray? =`
- L33: `fun keep(userId: String, fileName: String, bytes: ByteArray) {`
- L37: `fun forget() {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Dates.kt` (119 lines)

- L8: `data class DateRange(val start: LocalDate, val end: LocalDate) {`
- L14: `fun overlaps(other: DateRange): Boolean = !start.isAfter(other.end) && !other.start.isAfter(end)`
- L16: `fun format(): String = "${start.shortDate()} - ${end.shortDate()}"`
- L20: `val RENTAL_LENGTH_OPTIONS = listOf(3, 4, 5, 7)`
- L21: `const val DEFAULT_RENTAL_DAYS = 5`
- L24: `fun defaultBrowseRange(today: LocalDate, days: Int = DEFAULT_RENTAL_DAYS): DateRange =`
- L31: `fun formatDateChip(range: DateRange): String {`
- L32: `val start = range.start.shortDate()`
- L45: `fun datesQuestion(dates: DateRange): String = "Is this available ${formatDateChip(dates)}?"`
- L51: `fun datesAsked(body: String, dates: DateRange): DateRange? = dates.takeIf { formatDateChip(dates) in body }`
- L57: `fun chatDatesLine(dates: DateRange?, iAmRenter: Boolean): String? =`
- L66: `fun isAvailableFor(windows: List<DateRange>, wanted: DateRange): Boolean {`
- L68: `val merged = mutableListOf<DateRange>()`
- L81: `fun firstOverlap(candidate: DateRange, existing: List<DateRange>): DateRange? =`
- L85: `fun parseDateRange(start: String?, end: String?): DateRange? {`
- L86: `val s = start?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null`
- L87: `val e = end?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null`
- L92: `fun formatDateRange(start: String?, end: String?): String? = parseDateRange(start, end)?.format()`
- L95: `fun formatMessageTime(iso: String?, now: Instant = nowInstant()): String {`
- L96: `val local = parseTimestamp(iso)?.local() ?: return ""`
- L97: `val today = now.local().date`
- L98: `val time = local.timeOfDay()`
- L103: `fun formatInboxTime(iso: String?, now: Instant = nowInstant()): String {`
- L104: `val local = parseTimestamp(iso)?.local() ?: return ""`
- L105: `val today = now.local().date`
- L106: `val days = local.date.daysUntil(today)`
- L115: `fun timestampMillis(iso: String?): Long = parseTimestamp(iso)?.toEpochMilliseconds() ?: 0L`
- L118: `fun daysSince(iso: String?, now: Instant = nowInstant()): Long? =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Decimal.kt` (75 lines)

- L12: `fun plainString(value: Double): String {`
- L13: `val s = value.toString()`
- L15: `val negative = value < 0`
- L16: `val (mantissa, exponentText) = s.removePrefix("-").lowercase().split('e')`
- L17: `val exponent = exponentText.toInt()`
- L18: `val digits = mantissa.replace(".", "")`
- L19: `val point = mantissa.indexOf('.').let { if (it < 0) mantissa.length else it } + exponent`
- L20: `val out = when {`
- L29: `fun roundHalfUp(value: Double, scale: Int): String {`
- L30: `val plain = plainString(abs(value))`
- L31: `val negative = value < 0`
- L32: `val intPart = plain.substringBefore('.')`
- L33: `val fraction = plain.substringAfter('.', "")`
- L39: `val digits = (intPart + fraction.substring(0, scale)).toCharArray()`
- L53: `val all = digits.concatToString()`
- L54: `val whole = all.substring(0, all.length - scale)`
- L55: `val dec = all.substring(all.length - scale)`
- L56: `val isZero = all.all { it == '0' }`
- L61: `val all = "1" + digits.concatToString()`
- L62: `val whole = all.substring(0, all.length - scale)`
- L63: `val dec = all.substring(all.length - scale)`
- L68: `fun stripTrailingZeros(text: String): String =`
- L72: `fun roundTo(value: Double, scale: Int): Double {`
- L73: `val factor = 10.0.pow(scale)`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Drafts.kt` (83 lines)

- L9: `data class DraftMeasurement(val label: String, val value: String, val template: Boolean = false)`
- L13: `data class DraftRange(val start: String, val end: String)`
- L25: `data class SavedDraft(`
- L66: `val hasContent: Boolean`
- L70: `val dateRanges: List<DateRange>? get() = ranges?.mapNotNull { parseDateRange(it.start, it.end) }`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/ErrorCatalog.kt` (79 lines)

- L8: `data class ShownError(val code: String, val message: String, val field: String? = null) {`
- L10: `val text: String get() = "$message ($code)"`
- L20: `object ErrorCatalog {`
- L21: `const val FALLBACK = "DZ-E9999"`
- L29: `fun find(code: String?): ErrorCode? = code?.let { byCode[it] }`
- L32: `fun message(code: String): String = (byCode[code] ?: byCode.getValue(FALLBACK)).message`
- L35: `fun shown(code: String, field: String? = null): ShownError {`
- L40: `fun fallback(): ShownError = shown(FALLBACK)`
- L43: `fun parse(serverMessage: String?): Pair<String, String>? {`
- L52: `fun fromServer(serverMessage: String?, hint: String? = null): ShownError? {`
- L62: `fun fromBody(body: String?): ShownError? {`
- L71: `fun fromAny(texts: List<String?>, hint: String? = null): ShownError? =`
- L75: `fun warningCode(message: String): String? = warningByMessage[message.trim()]?.code`
- L78: `fun warningText(message: String): String = warningCode(message)?.let { "$message ($it)" } ?: message`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/FashionStyles.kt` (28 lines)

- L9: `object FashionStyles {`
- L10: `val ALL = listOf(`
- L23: `const val LISTING_MAX = 3`
- L27: `fun styleOverlap(listingStyles: List<String>, interests: Set<String>): Int =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Fit.kt` (130 lines)

- L9: `const val FIT_MIN_MATCHES = 2`
- L12: `val FIT_PARTS = listOf(BodyMeasurement.CHEST, BodyMeasurement.WAIST, BodyMeasurement.HIPS, BodyMeasurement.SHOULDER)`
- L15: `data class Ease(val min: Double, val max: Double)`
- L22: `val EASE_BY_CATEGORY: Map<String, Map<BodyMeasurement, Ease>> = mapOf(`
- L56: `typealias EaseTable = Map<String, Map<BodyMeasurement, Ease>>`
- L63: `val EASE_BY_PROFILE: Map<FitProfile, EaseTable> = mapOf(`
- L69: `fun easeTableFor(profile: FitProfile?, tables: Map<FitProfile, EaseTable> = EASE_BY_PROFILE): EaseTable =`
- L77: `fun bodyPartForLabel(label: String): BodyMeasurement? {`
- L78: `val l = label.lowercase()`
- L92: `fun garmentCm(measurement: ListingMeasurement, part: BodyMeasurement): Double {`
- L93: `val cm = if (measurement.unit == "in") measurement.value * CM_PER_INCH else measurement.value`
- L94: `val flat = "flat" in measurement.label.lowercase()`
- L99: `fun hasFitMeasurements(body: PrivateProfile): Boolean = FIT_PARTS.any { body.bodyCm(it) != null }`
- L105: `fun fitMatches(`
- L111: `val table = easeTableFor(body.fit, tables)`
- L112: `val ease = table[listing.category] ?: table["Everyday"] ?: return emptySet()`
- L123: `fun isLikelyFit(`
- L130: `fun Listing.availabilityWindows(): List<DateRange> = availability.mapNotNull { parseDateRange(it.startDate, it.endDate) }`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Geo.kt` (78 lines)

- L13: `const val KM_PER_MILE = 1.609344`
- L20: `enum class DistanceUnit(val key: String, val label: String, val short: String, private val kmPerUnit: Double, val options: List<Int>) {`
- L25: `fun radiusKm(step: Int): Double = options[clampStep(step)] * kmPerUnit`
- L28: `fun optionLabel(step: Int): String = "${options[clampStep(step)]} $short"`
- L31: `fun withinLabel(step: Int): String {`
- L36: `fun fromKm(km: Double): Double = km / kmPerUnit`
- L39: `val locationPrecision: String get() = if (this == MILES) "about half a mile" else "about 1 km"`
- L47: `val DISTANCE_STEPS = 0..3`
- L49: `const val DEFAULT_DISTANCE_STEP = 2`
- L51: `fun clampStep(step: Int): Int = step.coerceIn(DISTANCE_STEPS)`
- L54: `fun roundCoord(value: Double): Double = (value * 100.0).roundToLong() / 100.0`
- L59: `fun haversineKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {`
- L60: `val dLat = toRadians(lat2 - lat1)`
- L61: `val dLng = toRadians(lng2 - lng1)`
- L62: `val a = sin(dLat / 2).pow(2) +`
- L71: `fun formatDistance(km: Double, unit: DistanceUnit): String {`
- L72: `val value = unit.fromKm(km)`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Home.kt` (100 lines)

- L11: `const val HOME_ROW_MIN = 3`
- L14: `const val NEW_NEAR_YOU_DAYS = 7L`
- L17: `const val UNDER_PRICE_USD = 15.0`
- L20: `data class StudioSummary(`
- L28: `data class HomeSections(`
- L42: `enum class HomeRow(val title: String, val subtitle: String?) {`
- L49: `fun listings(sections: HomeSections): List<Listing> = when (this) {`
- L65: `fun buildHomeSections(`
- L74: `val visible = listings`
- L80: `val newSince = (now - 7.days).toEpochMilliseconds()`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/ItemLabels.kt` (66 lines)

- L8: `enum class GarmentKind(val key: String, val label: String) {`
- L27: `object ItemLabels {`
- L29: `const val ACCESSORY_MAX_VALUE_USD = 300`
- L32: `const val SCOPE = "Dzirent is for clothing, bags and fashion accessories only."`
- L35: `val NOT_ALLOWED_GROUPS = listOf(`
- L40: `const val FINE_JEWELRY = "real gold, silver, platinum, diamonds, pearls or gemstones"`
- L42: `val NOT_OFFERED_GROUPS = listOf(`
- L47: `val ACCESSORY_VALUE_RULE = "accessories worth more than \$$ACCESSORY_MAX_VALUE_USD"`
- L54: `val notAllowedText: String = "Not allowed: " +`
- L58: `val notOfferedText: String = "Not offered: everyday basics like " + joinWithAnd(NOT_OFFERED_GROUPS) + "."`
- L62: `fun joinWithAnd(items: List<String>): String = when (items.size) {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/ListingForm.kt` (200 lines)

- L12: `enum class SuggestField(val key: String) {`
- L20: `enum class FieldOrigin { UNTOUCHED, SUGGESTED, EDITED, CLEARED }`
- L24: `data class FieldState(val origin: FieldOrigin = FieldOrigin.UNTOUCHED, val suggested: String? = null, val label: String? = null)`
- L27: `const val STYLE_SEPARATOR = ", "`
- L30: `fun suggestedValues(s: ListingSuggestions): Map<SuggestField, String?> = mapOf(`
- L42: `fun fieldsToFill(states: Map<SuggestField, FieldState>, current: Map<SuggestField, String>, s: ListingSuggestions): Map<SuggestField, String> =`
- L49: `fun suggestedState(value: String, label: String) = FieldState(FieldOrigin.SUGGESTED, value, label)`
- L52: `fun editedState(state: FieldState, newValue: String) =`
- L56: `fun clearedState(state: FieldState) = state.copy(origin = FieldOrigin.CLEARED)`
- L59: `fun suggestionOutcome(state: FieldState, finalValue: String): String? {`
- L60: `val suggested = state.suggested ?: return null`
- L69: `const val CHOOSE_CATEGORY = "Choose a category"`
- L72: `const val DESCRIPTION_TIP = "Add the fabric, fit and any flaws."`
- L81: `fun detailsMissing(title: String, category: String?, itemType: String?, declarationPending: Boolean): Missing? = when {`
- L90: `data class Step2Input(`
- L103: `const val PRICE_NOTE_MAX = 60`
- L104: `const val DESCRIPTION_MAX = 1000`
- L107: `val ACCESSORY_VALUE_TOO_HIGH =`
- L111: `fun accessoryValueError(isAccessory: Boolean, retailValueText: String): String? {`
- L112: `val value = retailValueText.toDoubleOrNull() ?: return null`
- L117: `fun step2Missing(input: Step2Input): Missing? {`
- L118: `val retail = input.retailValueText`
- L137: `data class ReadyItem(val label: String, val done: Boolean)`
- L140: `fun readyList(photosDone: Boolean, detailsDone: Boolean, input: Step2Input): List<ReadyItem> = listOfNotNull(`
- L152: `const val DEFAULT_AVAILABLE_DAYS = 30`
- L154: `fun defaultAvailability(today: LocalDate): DateRange = DateRange(today, today.plusDays(DEFAULT_AVAILABLE_DAYS - 1L))`
- L157: `fun availabilityChipLabel(range: DateRange, today: LocalDate): String =`
- L166: `fun garmentKindFor(recognized: GarmentKind?, picked: GarmentKind?, category: String?): GarmentKind? = when {`
- L174: `fun measurementLabelsFor(kind: GarmentKind?, itemType: String?): List<String> = when (kind) {`
- L189: `fun sameAsCandidate(mine: List<Listing>, kind: GarmentKind?, excludeId: String?): Listing? {`
- L196: `fun sameAsQuestion(listing: Listing): String = "Same as your ${listing.title}?"`
- L199: `fun copiedMeasurements(listing: Listing): Pair<List<Pair<String, Double>>, String?> =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/ListingPhotos.kt` (104 lines)

- L8: `enum class PhotoSlot(val key: String, val label: String, val required: Boolean, val fullChecks: Boolean) {`
- L26: `const val MIN_PHOTOS = 3`
- L27: `const val MAX_PHOTOS = 6`
- L30: `const val PHOTO_TIP = "Lay it flat or hang it in daylight. Front, back, then a close-up of fabric or detail."`
- L36: `fun <T> assignSlots(current: Map<PhotoSlot, T>, incoming: List<T>, target: PhotoSlot? = null): Pair<Map<PhotoSlot, T>, Int> {`
- L37: `val result = current.toMutableMap()`
- L38: `val order = (listOfNotNull(target) + PhotoSlot.FILL_ORDER).distinct()`
- L39: `var left = 0`
- L51: `fun slotsForSaved(slotKeys: List<String?>): List<PhotoSlot> {`
- L52: `val taken = mutableSetOf<PhotoSlot>()`
- L53: `val fromKeys = slotKeys.map { key -> PhotoSlot.fromKey(key)?.takeIf { taken.add(it) } }`
- L58: `fun readyCount(verdicts: Map<PhotoSlot, PhotoVerdict>): Int =`
- L61: `fun readyLine(verdicts: Map<PhotoSlot, PhotoVerdict>): String = "${readyCount(verdicts)} of ${PhotoSlot.REQUIRED.size} ready"`
- L67: `fun photoMinimumApplies(isNew: Boolean, photosChanged: Boolean): Boolean = isNew || photosChanged`
- L76: `fun applyExifOrientation(raw: RgbImage, orientation: Int): RgbImage {`
- L77: `val w = raw.width`
- L78: `val h = raw.height`
- L79: `val swap = orientation in 5..8`
- L80: `val outW = if (swap) h else w`
- L81: `val outH = if (swap) w else h`
- L83: `val out = IntArray(outW * outH)`
- L104: `fun analyzeImage(image: RgbImage): PhotoChecks = checkPhoto(image)`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Measurements.kt` (65 lines)

- L5: `const val MEASUREMENT_LABEL_MAX = 40`
- L11: `enum class MeasureUnit(val key: String, val label: String) {`
- L21: `fun formatMeasurementNumber(value: Double): String {`
- L22: `val rounded = (value * 10).roundToLong() / 10.0`
- L30: `fun formatMeasurement(value: Double, storedUnit: String, unit: MeasureUnit): String {`
- L31: `val shown = when {`
- L40: `data class MeasurementInput(val label: String, val valueText: String) {`
- L41: `val isBlank: Boolean get() = label.isBlank() && valueText.isBlank()`
- L48: `fun validateMeasurements(rows: List<MeasurementInput>): List<String?> {`
- L49: `val seen = mutableSetOf<String>()`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Onboarding.kt` (54 lines)

- L6: `enum class SetupItem(val title: String) {`
- L14: `data class SetupStatus(`
- L21: `fun isDone(item: SetupItem): Boolean = when (item) {`
- L29: `val basicsDone: Boolean get() = location && measurements`
- L33: `fun setupItems(canLend: Boolean): List<SetupItem> =`
- L37: `fun hasAnyBodyMeasurement(body: PrivateProfile): Boolean = BodyMeasurement.entries.any { body.bodyCm(it) != null }`
- L40: `enum class GuideTarget { DATE_CHIP, AVATAR, SEARCH, CLOSET, SAVED }`
- L42: `data class GuideStep(val target: GuideTarget, val text: String)`
- L45: `fun guideSteps(canLend: Boolean): List<GuideStep> = listOf(`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/PhotoGate.kt` (91 lines)

- L4: `enum class ReviewState {`
- L14: `enum class PhotoVerdict { CHECKING, PASSED, WARNING, USED_ANYWAY, BLOCKED }`
- L16: `const val UNREADABLE_PHOTO = "Couldn't read this photo: remove it and pick another"`
- L23: `data class PhotoReview(`
- L29: `val issues: List<PhotoIssue>`
- L35: `val verdict: PhotoVerdict`
- L48: `val messages: List<String>`
- L62: `data class Missing(val button: String, val message: String)`
- L65: `fun morePhotos(n: Int): String = "Add $n more photo" + if (n == 1) "" else "s"`
- L73: `fun photoGate(reviews: Map<PhotoSlot, PhotoReview>, minimumApplies: Boolean = true): Missing? {`
- L74: `val verdicts = reviews.values.map { it.verdict }`
- L75: `val missingRequired = PhotoSlot.REQUIRED.firstOrNull { it !in reviews }`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/PhotoQuality.kt` (380 lines)

- L15: `class RgbImage(val width: Int, val height: Int, val pixels: IntArray) {`
- L20: `fun red(i: Int) = (pixels[i] shr 16) and 0xFF`
- L21: `fun green(i: Int) = (pixels[i] shr 8) and 0xFF`
- L22: `fun blue(i: Int) = pixels[i] and 0xFF`
- L25: `fun gray(): IntArray = IntArray(pixels.size) { i ->`
- L31: `enum class CheckStatus { PASS, UNSURE, FAIL }`
- L34: `enum class Severity { BLOCK, WARN }`
- L37: `enum class PhotoIssue(val message: String, val severity: Severity) {`
- L48: `val code: String? get() = ErrorCatalog.warningCode(message)`
- L52: `data class CheckResult(val status: CheckStatus, val note: String, val issue: PhotoIssue? = null)`
- L55: `data class PhotoChecks(val sharp: CheckResult, val lighting: CheckResult, val wholeItem: CheckResult) {`
- L56: `val issues: List<PhotoIssue> get() = listOfNotNull(sharp.issue, lighting.issue, wholeItem.issue)`
- L64: `fun checkPhoto(image: RgbImage): PhotoChecks {`
- L65: `val gray = image.gray()`
- L66: `val lighting = checkLighting(gray, image.width, image.height)`
- L67: `var sharp = checkSharpness(gray, image.width, image.height)`
- L80: `fun checkSharpness(gray: IntArray, width: Int, height: Int): CheckResult {`
- L81: `val laplacian = laplacian(gray, width, height)`
- L82: `val scores = mutableListOf<Double>()`
- L83: `val tiles = T.BLUR_TILES`
- L95: `val score = percentile(scores.toDoubleArray(), T.BLUR_PERCENTILE)`
- L104: `internal fun laplacian(gray: IntArray, width: Int, height: Int): DoubleArray {`
- L105: `fun at(x: Int, y: Int): Int = gray[reflect101(y, height) * width + reflect101(x, width)]`
- L121: `var sum = 0.0`
- L122: `var sumSq = 0.0`
- L123: `var n = 0`
- L130: `val mean = sum / n`
- L135: `var sum = 0.0`
- L136: `var sumSq = 0.0`
- L137: `var n = 0`
- L144: `val mean = sum / n`
- L149: `internal fun percentile(values: DoubleArray, p: Double): Double {`
- L151: `val sorted = values.sortedArray()`
- L152: `val rank = p / 100.0 * (sorted.size - 1)`
- L153: `val lo = rank.toInt()`
- L154: `val hi = min(lo + 1, sorted.size - 1)`
- L161: `fun checkLighting(gray: IntArray, width: Int, height: Int): CheckResult {`
- L162: `val n = gray.size.toDouble()`
- L163: `val mean = gray.sum() / n`
- L164: `val dark = gray.count { it <= T.DARK_PIXEL } / n`
- L165: `val bright = gray.count { it >= T.BRIGHT_PIXEL } / n`
- L171: `val center = centerValues(gray, width, height)`
- L172: `val clipped = center.count { it >= T.BRIGHT_PIXEL } / center.size.toDouble()`
- L177: `val sorted = gray.map { it.toDouble() }.toDoubleArray()`
- L178: `val p5 = percentile(sorted, 5.0)`
- L179: `val p95 = percentile(sorted, 95.0)`
- L186: `internal fun centerBox(width: Int, height: Int): IntArray {`
- L187: `val marginX = (width * (1 - T.CENTER_SHARE) / 2).toInt()`
- L188: `val marginY = (height * (1 - T.CENTER_SHARE) / 2).toInt()`
- L193: `val (x0, y0, x1, y1) = centerBox(width, height)`
- L194: `val out = IntArray((x1 - x0) * (y1 - y0))`
- L195: `var k = 0`
- L203: `fun checkWholeItem(image: RgbImage): CheckResult = findItem(image).result`
- L210: `class ItemFinding(val result: CheckResult, val region: BooleanArray? = null, val background: DoubleArray? = null)`
- L217: `fun findItem(image: RgbImage): ItemFinding {`
- L218: `val w = image.width`
- L219: `val h = image.height`
- L221: `val lab = toLab(image)`
- L222: `val band = max(4, (T.BORDER_SHARE * min(w, h)).roundToInt()).coerceAtMost(min(w, h) / 2)`
- L224: `val strip = ArrayList<Int>()`
- L230: `val background = DoubleArray(3) { c -> median(DoubleArray(strip.size) { lab[strip[it] * 3 + c] }) }`
- L231: `fun distance(i: Int): Double {`
- L237: `val stripDistance = DoubleArray(strip.size) { distance(strip[it]) }`
- L241: `val threshold = max(T.ITEM_MIN_DISTANCE, 3.0 * percentile(stripDistance, 75.0))`
- L242: `var mask = BooleanArray(w * h) { distance(it) > threshold }`
- L246: `val item = largestRegion(mask, w, h)`
- L251: `val inItem = BooleanArray(w * h).also { m -> item.forEach { m[it] = true } }`
- L252: `val m = T.EDGE_MARGIN_PX`
- L253: `var outline = 0`
- L254: `var onEdge = 0`
- L255: `val touching = IntArray(4) // top, bottom, left, right`
- L276: `val sorted = values.sortedArray()`
- L277: `val mid = sorted.size / 2`
- L282: `internal fun toLab(image: RgbImage): DoubleArray {`
- L283: `val out = DoubleArray(image.pixels.size * 3)`
- L294: `val c = v / 255.0`
- L298: `internal fun rgbToLab(r: Int, g: Int, b: Int): DoubleArray {`
- L299: `val rl = SRGB_TO_LINEAR[r]`
- L300: `val gl = SRGB_TO_LINEAR[g]`
- L301: `val bl = SRGB_TO_LINEAR[b]`
- L302: `val x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047`
- L303: `val y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl`
- L304: `val z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) / 1.08883`
- L305: `fun f(t: Double) = if (t > 216.0 / 24389.0) cbrt(t) else (24389.0 / 27.0 * t + 16) / 116`
- L306: `val fx = f(x)`
- L307: `val fy = f(y)`
- L308: `val fz = f(z)`
- L313: `internal fun erode(mask: BooleanArray, w: Int, h: Int, k: Int): BooleanArray = morph(mask, w, h, k, erode = true)`
- L315: `internal fun dilate(mask: BooleanArray, w: Int, h: Int, k: Int): BooleanArray = morph(mask, w, h, k, erode = false)`
- L319: `val r = k / 2`
- L320: `val rows = BooleanArray(mask.size)`
- L333: `val out = BooleanArray(mask.size)`
- L349: `internal fun largestRegion(mask: BooleanArray, w: Int, h: Int): IntArray? {`
- L350: `val seen = BooleanArray(mask.size)`
- L351: `var best: IntArray? = null`
- L352: `val stack = IntArray(mask.size)`
- L353: `val region = IntArray(mask.size)`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/PhotoScan.kt` (123 lines)

- L19: `const val DRAFT_TITLE = "New listing (draft)"`
- L22: `const val DRAFT_CATEGORY = "Everyday"`
- L25: `val Listing.isDraft: Boolean get() = status == "paused" && title == DRAFT_TITLE`
- L28: `data class ListingSuggestions(`
- L37: `val isJewelry: Boolean get() = itemType == AccessoryTypes.COSTUME_JEWELRY`
- L45: `fun suggestionsFrom(scan: ListingScan): ListingSuggestions? {`
- L47: `val s = scan.suggestions ?: return null`
- L48: `fun text(key: String) = (s[key] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }`
- L49: `val title = text("title")?.take(80)?.trim()?.takeIf { it.length >= 3 } ?: return null`
- L50: `val category = text("category")?.takeIf { it in Categories.ALL } ?: return null`
- L51: `val itemType = text("item_type")?.takeIf { category == Categories.ACCESSORIES && it in AccessoryTypes.ALL }`
- L53: `val styles = (s["styles"] as? JsonArray).orEmpty()`
- L70: `enum class CheckPhase { NONE, UPLOADING, UPLOAD_FAILED, CHECKING, FINISHED, TIMED_OUT }`
- L72: `const val UPLOADING_PHOTOS = "Uploading your photos…"`
- L73: `const val CHECKING_PHOTOS = "Checking your photos…"`
- L74: `const val PHOTOS_LOOK_GOOD = "Your photos look good."`
- L75: `const val REVIEW_LINE = "Someone at Dzirent will check these photos."`
- L76: `const val CHECK_FAILED_LINE = "We couldn't check the photos right now."`
- L77: `const val REPLACE_PHOTOS = "Replace photos"`
- L80: `sealed class CheckBanner {`
- L81: `object Uploading : CheckBanner()`
- L82: `data class UploadFailed(val message: String) : CheckBanner()`
- L83: `object Checking : CheckBanner()`
- L84: `object Allowed : CheckBanner()`
- L85: `data class Rejected(val reason: String) : CheckBanner()`
- L87: `data class Review(val reason: String?) : CheckBanner()`
- L89: `object Failed : CheckBanner()`
- L93: `fun checkBanner(phase: CheckPhase, scan: ListingScan?, uploadError: String? = null): CheckBanner? = when (phase) {`
- L112: `const val COPIED_PHOTO = "This photo matches another listing."`
- L115: `fun extraWarnings(phoneMessages: List<String>, server: List<String>): List<String> =`
- L122: `fun photoSetKey(slots: Map<PhotoSlot, String>): String =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/PhotoThresholds.kt` (63 lines)

- L9: `object PhotoThresholds {`
- L12: `const val WORKING_LONG_SIDE = 1280`
- L16: `const val BLUR_TILES = 8`
- L18: `const val BLUR_TEXTURE_STD = 8.0`
- L20: `const val BLUR_MIN_TILES = 4`
- L22: `const val BLUR_PERCENTILE = 90.0`
- L24: `const val SHARP_SCORE = 120.0`
- L26: `const val BLURRY_SCORE = 35.0`
- L30: `const val DARK_MEAN = 45.0`
- L32: `const val DARK_PIXEL = 8`
- L34: `const val DARK_SHARE = 0.40`
- L36: `const val BRIGHT_MEAN = 225.0`
- L38: `const val BRIGHT_PIXEL = 250`
- L40: `const val BRIGHT_SHARE = 0.35`
- L42: `const val GLARE_SHARE = 0.04`
- L44: `const val GLARE_MAX_CENTER_MEDIAN = 170.0`
- L46: `const val CENTER_SHARE = 0.5`
- L50: `const val BORDER_SHARE = 0.03`
- L52: `const val BORDER_NOISE_DISTANCE = 15.0`
- L54: `const val BORDER_MAX_NOISY_SHARE = 0.30`
- L56: `const val ITEM_MIN_DISTANCE = 12.0`
- L58: `const val ITEM_MIN_AREA = 0.03`
- L60: `const val EDGE_MARGIN_PX = 2`
- L62: `const val CUT_OFF_OUTLINE_SHARE = 0.02`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Price.kt` (44 lines)

- L7: `const val PRICE_MAX_USD = 10_000.0`
- L13: `fun parsePrice(text: String): Double? {`
- L14: `val cleaned = text.trim().removePrefix("$").trim()`
- L16: `val value = cleaned.toDoubleOrNull() ?: return null`
- L21: `fun formatPrice(usd: Double): String {`
- L22: `val cents = roundHalfUp(usd, 2)`
- L28: `fun formatPerDay(usd: Double): String = formatPrice(usd) + "/day"`
- L31: `fun rentalDays(range: DateRange): Int = range.start.daysUntil(range.end) + 1`
- L34: `fun rentalTotal(perDayUsd: Double, days: Int): Double = (perDayUsd * 100).roundToLong() * days / 100.0`
- L37: `fun daysAndTotal(perDayUsd: Double, range: DateRange): String {`
- L38: `val days = rentalDays(range)`
- L43: `fun priceInputText(usd: Double?): String =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/ReadRetry.kt` (39 lines)

- L9: `object ReadRetry {`
- L10: `const val MAX_RETRIES = 2`
- L14: `val READ_RPCS: Set<String> = setOf(`
- L25: `fun isRead(method: String, path: String): Boolean {`
- L35: `fun retryableStatus(status: Int): Boolean = status == 408 || (status in 500..599 && status != 501)`
- L38: `fun delayMs(retry: Int): Long = DELAYS_MS[(retry - 1).coerceIn(0, DELAYS_MS.size - 1)]`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Rentals.kt` (359 lines)

- L11: `object RentalStatus {`
- L12: `const val REQUESTED = "requested"`
- L13: `const val ACCEPTED = "accepted"`
- L14: `const val DECLINED = "declined"`
- L15: `const val EXPIRED = "expired"`
- L16: `const val AWAITING_PAYMENT = "awaiting_payment"`
- L17: `const val PAID = "paid"`
- L18: `const val PICKED_UP = "picked_up"`
- L19: `const val RETURNED = "returned"`
- L20: `const val COMPLETED = "completed"`
- L21: `const val CANCELLED = "cancelled"`
- L22: `const val CLAIMED = "claimed"`
- L23: `const val DISPUTED = "disputed"`
- L26: `val OPEN = setOf(REQUESTED, ACCEPTED, AWAITING_PAYMENT, PAID, PICKED_UP, RETURNED, CLAIMED, DISPUTED)`
- L29: `val BOOKED = setOf(ACCEPTED, AWAITING_PAYMENT, PAID, PICKED_UP)`
- L30: `val IN_PROGRESS = setOf(ACCEPTED, AWAITING_PAYMENT, PAID, PICKED_UP, RETURNED, CLAIMED, DISPUTED)`
- L34: `enum class RentalAction(val label: String) {`
- L53: `const val MIN_CONDITION_PHOTOS = 2`
- L56: `object PaymentStatus {`
- L57: `const val NONE = "none"`
- L58: `const val PAID = "paid"`
- L59: `const val PARTIALLY_REFUNDED = "partially_refunded"`
- L60: `const val REFUNDED = "refunded"`
- L61: `val WAS_PAID = setOf(PAID, PARTIALLY_REFUNDED, REFUNDED)`
- L64: `object DepositStatus {`
- L65: `const val NONE = "none"`
- L66: `const val PENDING = "pending"`
- L67: `const val HELD = "held"`
- L68: `const val RELEASED = "released"`
- L69: `const val CAPTURED = "captured"`
- L70: `const val FAILED = "failed"`
- L77: `data class PaymentFacts(`
- L85: `val hasDeposit: Boolean get() = (depositAmount ?: 0.0) > 0.0`
- L86: `val holdInPlace: Boolean get() = depositStatus == DepositStatus.HELD || depositStatus == DepositStatus.PENDING`
- L97: `fun rentalActions(status: String, iAmLender: Boolean, pay: PaymentFacts = PaymentFacts()): List<RentalAction> = when (status) {`
- L133: `fun payLabel(total: Double?): String = if (total == null) "Pay" else "Pay ${formatMoney(total)}"`
- L136: `fun formatMoney(amount: Double): String {`
- L137: `val cents = kotlin.math.round(amount * 100).toLong()`
- L138: `val whole = cents / 100`
- L139: `val rest = (cents % 100).toInt()`
- L140: `val grouped = whole.toString().reversed().chunked(3).joinToString(",").reversed()`
- L145: `fun formatMoneyCents(amount: Double): String {`
- L146: `val cents = kotlin.math.round(amount * 100).toLong()`
- L147: `val grouped = (cents / 100).toString().reversed().chunked(3).joinToString(",").reversed()`
- L152: `fun depositLine(amount: Double?, status: String, captured: Double?): String? {`
- L154: `val money = formatMoney(amount)`
- L166: `fun claimLine(status: String?, amount: Double?, decided: Double?, iAmLender: Boolean): String? {`
- L168: `val money = formatMoney(amount)`
- L182: `fun claimAmountProblem(amountText: String, deposit: Double?): String? {`
- L183: `val text = amountText.trim().removePrefix("$").replace(",", "")`
- L185: `val amount = text.toDoubleOrNull() ?: return "DZ-E4041"`
- L190: `fun claimReasonProblem(reason: String): String? = if (reason.trim().length !in 3..500) "DZ-E4042" else null`
- L193: `fun claimPhotosProblem(chosen: Int): String? = if (chosen !in 1..10) "DZ-E4043" else null`
- L199: `fun parseDepositAmount(text: String): Result<Double?> {`
- L200: `val t = text.trim().removePrefix("$").replace(",", "")`
- L202: `val ok = Regex("^\\d+(\\.\\d{1,2})?$").matches(t)`
- L203: `val value = t.toDoubleOrNull()`
- L209: `enum class PayoutState(val label: String, val button: String) {`
- L219: `fun payoutState(exists: Boolean, chargesEnabled: Boolean, payoutsEnabled: Boolean): PayoutState = when {`
- L226: `data class ReceiptLine(val label: String, val amount: String)`
- L232: `fun rentalReceipt(`
- L244: `val rental = total ?: 0.0`
- L245: `val taxes = tax ?: 0.0`
- L246: `val back = refund ?: 0.0`
- L247: `val captured = if (depositStatus == DepositStatus.CAPTURED) depositCaptured ?: 0.0 else 0.0`
- L248: `val lines = mutableListOf<ReceiptLine>()`
- L273: `fun conditionPhotoStage(status: String): String? = when (status) {`
- L280: `fun hoursText(hours: Int): String = if (hours == 1) "1 hour" else "$hours hours"`
- L286: `fun rentalStatusLabel(status: String, iAmLender: Boolean, requestHours: Int? = null): String = when (status) {`
- L305: `fun rentalEventLabel(to: String, by: String, otherName: String): String {`
- L306: `val step = when (to) {`
- L329: `enum class RentalGroup(val title: String) {`
- L337: `fun rentalGroup(status: String, iAmLender: Boolean): RentalGroup = when (status) {`
- L350: `fun rentalDatesProblem(wanted: DateRange, windows: List<DateRange>, booked: List<DateRange>, today: LocalDate): String? = when {`
- L358: `fun isRentableDay(day: LocalDate, windows: List<DateRange>, booked: List<DateRange>, today: LocalDate): Boolean =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/SearchRelated.kt` (85 lines)

- L10: `data class RelatedMatch(`
- L26: `class SearchRelated(`
- L31: `fun lookup(query: String): RelatedMatch? {`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/ShareLinks.kt` (43 lines)

- (no top-level declarations)

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Sizes.kt` (58 lines)

- L4: `data class SizeStep(val title: String, val options: List<String>)`
- L10: `class SizeSystem(val key: String, val label: String, val steps: List<SizeStep>, private val formatter: (List<String>) -> String) {`
- L11: `fun format(picks: List<String>): String {`
- L17: `fun parse(label: String): List<String>? {`
- L25: `object Sizes {`
- L26: `const val ONE_SIZE = "One size"`
- L30: `val LETTERS = SizeSystem("letter", "Letter", listOf(SizeStep("Size", listOf("XS", "S", "M", "L", "XL", "XXL", "XXXL")))) { it[0] }`
- L31: `val US = SizeSystem("us", "US", listOf(SizeStep("US size", range(0, 24, 2)))) { "US ${it[0]}" }`
- L32: `val WAIST_INSEAM = SizeSystem(`
- L36: `val CHEST_LENGTH = SizeSystem(`
- L40: `val BLOUSE = SizeSystem("blouse", "Blouse", listOf(SizeStep("Blouse", range(30, 46, 2)))) { "Blouse ${it[0]}" }`
- L43: `fun systemsFor(kind: GarmentKind): List<SizeSystem> = when (kind) {`
- L53: `fun parse(kind: GarmentKind, label: String): Pair<SizeSystem, List<String>>? =`
- L57: `fun fixedLabel(kind: GarmentKind): String? = if (kind == GarmentKind.ONE_SIZE) ONE_SIZE else null`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Sort.kt` (74 lines)

- L6: `enum class SearchSort(val label: String) {`
- L14: `enum class ClosetSort(val label: String) {`
- L21: `fun sortSearchResults(listings: List<Listing>, sort: SearchSort): List<Listing> = when (sort) {`
- L29: `fun sortCloset(listings: List<Listing>, sort: ClosetSort): List<Listing> = when (sort) {`
- L38: `data class FilterChipItem(val label: String, val remove: (BrowseFilters) -> BrowseFilters)`
- L44: `fun filterChips(`
- L54: `val min = filters.minPrice`
- L55: `val max = filters.maxPrice`
- L56: `val price = when {`
- L67: `const val RECENT_SEARCHES_MAX = 8`
- L70: `fun addRecentSearch(recent: List<String>, query: String, max: Int = RECENT_SEARCHES_MAX): List<String> {`
- L71: `val q = query.trim()`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Studio.kt` (49 lines)

- L5: `object StyleTags {`
- L6: `val ALL = listOf(`
- L12: `const val STYLE_TAGS_MAX = 5`
- L13: `const val STUDIO_NAME_MAX = 40`
- L14: `const val STUDIO_BIO_MAX = 200`
- L15: `const val PICKUP_AREA_MAX = 60`
- L16: `const val HANDLE_MIN = 3`
- L17: `const val HANDLE_MAX = 30`
- L22: `fun cleanHandleInput(input: String): String =`
- L27: `fun isValidHandle(handle: String): Boolean = handleRegex.matches(handle)`
- L30: `fun suggestHandle(name: String): String {`
- L31: `val ascii = stripAccents(name)`
- L32: `val base = cleanHandleInput(ascii.trim().replace(Regex("\\s+"), " "))`
- L39: `fun replyTimeText(minutes: Int?): String? = when {`
- L48: `fun sinceText(createdAt: String?): String? =`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Suggestions.kt` (149 lines)

- L8: `const val SUGGESTIONS_MAX = 12`
- L11: `const val OTHER_DATES_LOOKAHEAD_DAYS = 60`
- L14: `enum class SuggestionStep {`
- L32: `data class SuggestionGroup(val step: SuggestionStep, val reason: String, val listings: List<Listing>)`
- L35: `data class SuggestionInput(`
- L61: `fun buildSuggestions(input: SuggestionInput): List<SuggestionGroup> {`
- L62: `val groups = mutableListOf<SuggestionGroup>()`
- L63: `val taken = mutableSetOf<String>()`
- L64: `var count = 0`
- L66: `fun add(step: SuggestionStep, reason: String, candidates: List<Listing>) {`
- L78: `fun fits(l: Listing, query: String = input.query, filters: BrowseFilters = input.filters, dates: DateRange? = input.dates) =`
- L81: `val nearest = input.nearby.sortedBy { it.distanceKm ?: Double.MAX_VALUE }`
- L82: `val query = input.query.trim()`
- L83: `val radiusKm = input.distanceUnit.radiusKm(input.filters.distanceStep)`
- L149: `fun roundUpPrice(usd: Double): Double = ceil(usd / 5.0) * 5.0`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Suspension.kt` (22 lines)

- L12: `fun suspensionNotice(until: String?, reason: String?, now: Instant = nowInstant()): String? {`
- L13: `val raw = until?.trim()`
- L15: `val why = reason?.trim()?.trimEnd('.')?.ifBlank { null }?.let { " Reason: $it." } ?: ""`
- L16: `val contact = " Contact support if you think this is a mistake."`
- L18: `val end = parseTimestamp(raw) ?: return null`
- L20: `val date = end.toLocalDateTime(TimeZone.UTC).date`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Text.kt` (4 lines)

- L4: `expect fun stripAccents(text: String): String`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Time.kt` (70 lines)

- L19: `fun today(): LocalDate = Clock.System.todayIn(TimeZone.currentSystemDefault())`
- L21: `fun LocalDate.plusDays(days: Long): LocalDate = plus(days, DateTimeUnit.DAY)`
- L22: `fun LocalDate.plusDays(days: Int): LocalDate = plus(days, DateTimeUnit.DAY)`
- L23: `fun LocalDate.minusDays(days: Long): LocalDate = minus(days, DateTimeUnit.DAY)`
- L24: `fun LocalDate.isBefore(other: LocalDate): Boolean = this < other`
- L25: `fun LocalDate.isAfter(other: LocalDate): Boolean = this > other`
- L31: `fun LocalDate.monthShort(): String = MONTHS[monthNumber - 1]`
- L34: `fun LocalDate.shortDate(): String = "${monthShort()} $dayOfMonth"`
- L37: `fun LocalDate.monthYear(): String = "${monthShort()} $year"`
- L40: `fun LocalDate.weekdayShort(): String = WEEKDAYS[dayOfWeek.isoDayNumber - 1]`
- L43: `fun LocalDate.monthLong(): String = when (monthNumber) {`
- L49: `fun LocalDateTime.timeOfDay(): String {`
- L50: `val h12 = if (hour % 12 == 0) 12 else hour % 12`
- L58: `fun parseTimestamp(iso: String?): Instant? {`
- L60: `var s = iso.trim().replace(' ', 'T')`
- L65: `fun Instant.local(): LocalDateTime = toLocalDateTime(TimeZone.currentSystemDefault())`
- L67: `fun nowInstant(): Instant = Clock.System.now()`
- L70: `fun nowMillis(): Long = Clock.System.now().toEpochMilliseconds()`

### `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/UsStates.kt` (31 lines)

- L23: `fun usStateCode(stateOrCode: String?): String? {`
- L24: `val value = stateOrCode?.trim().orEmpty()`
- L30: `fun cityLabel(city: String, stateOrCode: String?): String =`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/AgeGateTest.kt` (42 lines)

- L10: `class AgeGateTest {`
- L12: `fun playAgeRanges() {`
- L21: `fun noApplicableSignal() {`
- L29: `fun whatIsRecorded() {`
- L37: `fun onceADay() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ChatPushTest.kt` (44 lines)

- L12: `class ChatPushTest {`
- L24: `fun testParsesSendPushData() {`
- L36: `fun testShownOnlyToTheSignedInRecipientAndNotWhileTheChatIsOpen() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/DataExportTest.kt` (42 lines)

- L11: `class DataExportTest {`
- L13: `fun clear() = DataExport.forget()`
- L16: `fun fileName() {`
- L22: `fun onceADayRefusal() {`
- L33: `fun keptFileIsForThatAccountAndDay() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ErrorCatalogTest.kt` (94 lines)

- L16: `class ErrorCatalogTest {`
- L18: `fun knownCodeShowsTheCatalogWordsAndTheHintAsField() {`
- L27: `fun catalogFieldIsUsedWithoutAHint() {`
- L33: `fun serverDetailCodesKeepTheServersWords() {`
- L41: `fun unknownCodeFallsBackToTheServersWords() {`
- L48: `fun noCodeIsNotAServerRefusalAndTheFallbackIsE9999() {`
- L58: `fun edgeFunctionBodiesAreRead() {`
- L69: `fun clientSideFailuresGetTheirCodes() {`
- L81: `fun photoWarningsHaveW2Codes() {`
- L89: `fun codesAreUniqueAndWellFormed() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/GuestGateTest.kt` (45 lines)

- L9: `class GuestGateTest {`
- L12: `fun testAllGatedActionsRequireSignIn() {`
- L22: `fun testGuestPermissions() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ListingValidationTest.kt` (126 lines)

- L13: `class ListingValidationTest {`
- L16: `fun testTitleLengthLimits() {`
- L45: `fun testPriceLimits() {`
- L71: `fun testMeasurementValuesLimits() {`
- L107: `fun testMeasurementLabelLimits() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ModelTest.kt` (53 lines)

- L14: `class ModelTest {`
- L17: `fun testDateRangeAndParsing() {`
- L33: `fun testGenerateUuidFormat() {`
- L40: `fun testRolesAndCategories() {`
- L48: `fun testDzirentException() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/PhotoScanTest.kt` (131 lines)

- L28: `class PhotoScanTest {`
- L40: `fun allowedSuggestionsKeepOnlyValuesTheFormAccepts() {`
- L51: `fun onlyAnAllowedFinishedCheckSuggests() {`
- L63: `fun suggestionsNeverOverwriteWhatTheLenderTyped() {`
- L73: `fun bannerFollowsTheCheck() {`
- L96: `fun suspensionNoticeMatchesTheDatabaseWording() {`
- L111: `fun draftRowsAreRecognized() {`
- L119: `fun photoSetKeyChangesOnlyWithThePhotos() {`
- L127: `fun serverWarningsAreNotShownTwice() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/PricePerDayTest.kt` (65 lines)

- L16: `class PricePerDayTest {`
- L20: `fun oneDay() {`
- L27: `fun fiveDays() {`
- L35: `fun acrossAMonthAndAYear() {`
- L42: `fun centsDoNotDrift() {`
- L49: `fun onlyReadsAreRetried() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/RentalRulesTest.kt` (262 lines)

- L39: `class RentalRulesTest {`
- L44: `fun totals() {`
- L51: `fun actionsPerStateAndRole() {`
- L72: `fun photoStagesMatchTheBucketRules() {`
- L81: `fun groupsPutIncomingRequestsFirst() {`
- L91: `fun requestDatesFollowTheDatabase() {`
- L106: `fun noWindowsMeansEveryFutureDayIsOpen() {`
- L117: `fun timelineWording() {`
- L125: `fun requestHoursComeFromTheServer() {`
- L136: `fun paymentStatesActionsAndLabels() {`
- L183: `fun paymentsOffShowsNoPaymentSteps() {`
- L194: `fun claimLimits() {`
- L218: `fun receiptTotals() {`
- L247: `fun payoutStates() {`
- L256: `fun rentalPushesOpenTheirChat() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/SecureSessionTest.kt` (64 lines)

- L15: `class SecureSessionTest {`
- L27: `fun savesAndLoadsFromSecureStore() = runTest {`
- L38: `fun movesPlainSessionOnceAndDeletesIt() = runTest {`
- L49: `fun unreadableValueSignsOut() = runTest {`
- L56: `fun storageRefusalsInPlainWords() {`

### `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ShareLinksTest.kt` (36 lines)

- L10: `class ShareLinksTest {`
- L14: `fun shareTextUsesCleanLinks() {`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/MainViewController.kt` (34 lines)

- L20: `fun MainViewController(): UIViewController {`
- L21: `val settingsStorage = IosSettingsStorage()`
- L22: `val device = IosDeviceServices()`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/data/IosPhotoAnalyzer.kt` (38 lines)

- L20: `class IosPhotoAnalyzer : PhotoAnalyzer {`
- L21: `override suspend fun analyze(uri: String): PhotoAnalysis = withContext(Dispatchers.Default) {`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosAgeSignals.kt` (62 lines)

- L18: `class IosAgeSignals : AgeSignalsService {`
- L19: `override val platform: String = PLATFORM`
- L21: `override suspend fun check(): AgeSignal {`
- L42: `object IosAgeRange {`
- L43: `var provider: IosAgeRangeProvider? = null`
- L47: `interface IosAgeRangeProvider {`
- L48: `fun requestAgeRange(ageGate: Int, reply: AgeRangeReply)`
- L52: `class AgeRangeReply internal constructor(private val onSignal: (AgeSignal) -> Unit) {`
- L54: `fun answer(lower: Int, upper: Int) {`
- L59: `fun noSignal() {`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosDataExport.kt` (17 lines)

- L13: `class IosDataExport : DataExportService {`
- L14: `override val savesFiles: Boolean = false`
- L16: `override suspend fun save(fileName: String, bytes: ByteArray): SaveResult = SaveResult.FAILED`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosDevice.kt` (227 lines)

- L40: `class IosDeviceServices : DeviceServices {`
- L41: `override val prefs: KeyValueStore = UserDefaultsStore(NSUserDefaults.standardUserDefaults)`
- L42: `override val photoAnalyzer: PhotoAnalyzer by lazy { IosPhotoAnalyzer() }`
- L43: `override val imageCompressor: ImageCompressor = IosImageCompressor()`
- L44: `override val locationService: LocationService by lazy { IosLocationService() }`
- L47: `override val searchRelated: SearchRelated by lazy {`
- L52: `override val push: PushService = IosPushService()`
- L53: `override val ageSignals: AgeSignalsService = IosAgeSignals()`
- L54: `override val dataExport: DataExportService = IosDataExport()`
- L57: `override val appVersion: String = info?.get("CFBundleShortVersionString") as? String ?: ""`
- L58: `override val appBuild: Long = (info?.get("CFBundleVersion") as? String)?.toLongOrNull() ?: 0L`
- L60: `override fun photoStore(userId: String): PhotoStore = IosPhotoStore(userId)`
- L61: `override fun draftStore(userId: String, listingId: String?): DraftStore = IosDraftStore(userId, listingId)`
- L63: `override suspend fun readPhoto(uri: String): ByteArray? = withContext(Dispatchers.Default) {`
- L68: `override fun clearCameraCache() {`
- L74: `override fun toast(message: String) {`
- L78: `override fun openUrl(url: String) {`
- L83: `override fun share(text: String) {`
- L92: `val window = UIApplication.sharedApplication.keyWindow ?: return`
- L93: `var top = window.rootViewController ?: return`
- L95: `val sheet = UIActivityViewController(activityItems = listOf(text), applicationActivities = null)`
- L106: `override fun getBoolean(key: String, default: Boolean): Boolean =`
- L109: `override fun putBoolean(key: String, value: Boolean) = defaults.setBool(value, forKey = key)`
- L110: `override fun getString(key: String): String? = defaults.stringForKey(key)`
- L111: `override fun putString(key: String, value: String?) {`
- L117: `val base = NSSearchPathForDirectoriesInDomains(kind, NSUserDomainMask, true).first() as String`
- L118: `val path = "$base/$sub"`
- L124: `internal fun cameraDir(): String = directory(NSCachesDirectory, "camera")`
- L135: `class IosPhotoStore(userId: String) : PhotoStore {`
- L140: `suspend fun copyIn(bytes: ByteArray): String? = withContext(Dispatchers.Default) {`
- L147: `suspend fun moveIn(capture: String): String? = withContext(Dispatchers.Default) {`
- L159: `override fun prune(keep: Set<String>) {`
- L163: `override fun delete(uris: Collection<String>) {`
- L167: `override fun clear() {`
- L183: `override suspend fun load(): SavedDraft? = withContext(Dispatchers.Default) {`
- L187: `override suspend fun save(draft: SavedDraft) {`
- L192: `override suspend fun clear() {`
- L201: `val window = UIApplication.sharedApplication.keyWindow ?: return`
- L202: `val (width, height) = window.bounds.useContents { size.width to size.height }`
- L203: `val bottomInset = window.safeAreaInsets.useContents { bottom }`
- L204: `val label = UILabel()`
- L213: `val maxWidth = width - 64.0`
- L214: `val fit = label.sizeThatFits(platform.CoreGraphics.CGSizeMake(maxWidth - 32.0, Double.MAX_VALUE))`
- L215: `val (textWidth, textHeight) = fit.useContents { this.width to this.height }`
- L216: `val boxWidth = minOf(maxWidth, textWidth + 32.0)`
- L217: `val boxHeight = textHeight + 20.0`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosImages.kt` (90 lines)

- L29: `internal fun ByteArray.toNSData(): NSData =`
- L33: `internal fun NSData.toByteArray(): ByteArray {`
- L34: `val count = length.toInt()`
- L35: `val out = ByteArray(count)`
- L45: `internal fun uprightImage(data: NSData, maxSide: Int): UIImage? {`
- L46: `val image = UIImage.imageWithData(data) ?: return null`
- L48: `val (width, height) = image.size.useContents { width to height }`
- L50: `val ratio = min(1.0, maxSide / max(width, height))`
- L51: `val targetWidth = max(1, (width * ratio).roundToInt()).toDouble()`
- L52: `val targetHeight = max(1, (height * ratio).roundToInt()).toDouble()`
- L53: `val format = UIGraphicsImageRendererFormat()`
- L62: `internal fun UIImage.toRgbImage(): RgbImage? {`
- L63: `val cgImage = CGImage ?: return null`
- L64: `val width = CGImageGetWidth(cgImage).toInt()`
- L65: `val height = CGImageGetHeight(cgImage).toInt()`
- L67: `val rgba = ByteArray(width * height * 4)`
- L68: `val drawn = rgba.usePinned { pinned ->`
- L85: `val pixels = IntArray(width * height) { i ->`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosPlatformServices.kt` (387 lines)

- L70: `class IosLocationService : LocationService {`
- L71: `override fun hasPermission(): Boolean = isAuthorized(CLLocationManager().authorizationStatus)`
- L74: `override suspend fun currentPlace(): ApproxPlace? {`
- L93: `override suspend fun cityFor(lat: Double, lng: Double): String? {`
- L132: `fun start(onResult: (CLLocation?) -> Unit) {`
- L139: `fun stop() {`
- L151: `override fun locationManager(manager: CLLocationManager, didUpdateLocations: List<*>) {`
- L155: `override fun locationManager(manager: CLLocationManager, didFailWithError: NSError) {`
- L162: `internal class LocationPermissionRequester : NSObject(), CLLocationManagerDelegateProtocol {`
- L166: `fun request(onResult: (Boolean) -> Unit) {`
- L177: `override fun locationManagerDidChangeAuthorization(manager: CLLocationManager) {`
- L187: `class IosSettingsStorage : SettingsStorage {`
- L191: `override val settings: StateFlow<AppSettings> get() = state`
- L209: `override suspend fun setTheme(mode: ThemeMode) = update { defaults.setObject(mode.key, forKey = THEME) }`
- L210: `override suspend fun setDistanceUnit(unit: DistanceUnit) = update { defaults.setObject(unit.key, forKey = DISTANCE_UNIT) }`
- L211: `override suspend fun setMeasureUnit(unit: MeasureUnit) = update { defaults.setObject(unit.key, forKey = MEASURE_UNIT) }`
- L212: `override suspend fun setRentalDays(days: Int) = update { defaults.setInteger(days.toLong(), forKey = RENTAL_DAYS) }`
- L213: `override suspend fun setDefaultDistanceStep(step: Int) = update { defaults.setInteger(step.toLong(), forKey = DEFAULT_DISTANCE) }`
- L215: `override fun getRecentSearches(userId: String): List<String> =`
- L218: `override fun addRecentSearch(userId: String, query: String): List<String> {`
- L224: `override fun clearRecentSearches(userId: String) {`
- L238: `internal fun UIViewController.topPresented(): UIViewController {`
- L239: `var top = this`
- L244: `class IosPhotoPicker(private val presenter: () -> UIViewController?) : PhotoPicker {`
- L247: `override suspend fun pickPhotos(maxItems: Int): List<ByteArray> = pickPhotoData(maxItems).filterNotNull()`
- L250: `internal suspend fun pickPhotoData(maxItems: Int): List<ByteArray?> {`
- L295: `class IosCameraService(private val presenter: () -> UIViewController?) : CameraService {`
- L299: `val isAvailable: Boolean`
- L304: `override fun hasCameraPermission(): Boolean =`
- L308: `val canAskPermission: Boolean`
- L312: `suspend fun requestPermission(): Boolean = suspendCancellableCoroutine { cont ->`
- L318: `override suspend fun capturePhoto(): ByteArray? = capture()?.bytes`
- L321: `internal suspend fun capture(): Capture? = withContext(Dispatchers.Main) {`
- L342: `internal class Capture(val bytes: ByteArray?)`
- L362: `class IosImageCompressor : ImageCompressor {`
- L363: `override suspend fun compressImage(imageBytes: ByteArray, maxDimension: Int, quality: Int): ByteArray? =`
- L371: `class IosPushService : PushService {`
- L372: `override val platform: String get() = "ios"`
- L373: `override val canAskPermission: Boolean get() = false`
- L374: `override suspend fun token(): String? = null`
- L375: `override suspend fun deleteToken() = Unit`
- L376: `override fun canNotify(): Boolean = false`
- L377: `override fun openNotificationSettings() = openAppSettings()`
- L378: `override fun setSignedInUser(userId: String?) = Unit`
- L379: `override fun chatShown(conversationId: String) = Unit`
- L380: `override fun chatHidden(conversationId: String) = Unit`
- L384: `internal fun openAppSettings() {`
- L385: `val url = NSURL.URLWithString(UIApplicationOpenSettingsURLString) ?: return`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosSecureStore.kt` (41 lines)

- L16: `override fun read(key: String): String? = keychain.getStringOrNull(key)`
- L17: `override fun write(key: String, value: String) = keychain.putString(key, value)`
- L18: `override fun delete(key: String) = keychain.remove(key)`
- L21: `fun clearAll() = keychain.clear()`
- L32: `val store = KeychainSecureStore()`
- L33: `val defaults = NSUserDefaults.standardUserDefaults`
- L41: `actual fun platformSecureStore(): SecureStore? = keychainStore`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/ui/BackHandler.ios.kt` (120 lines)

- L28: `internal object IosBackDispatcher {`
- L29: `class Callback {`
- L36: `fun add(callback: Callback) {`
- L40: `fun remove(callback: Callback) {`
- L45: `val canGoBack: Boolean get() = callbacks.any { it.enabled }`
- L47: `fun goBack() {`
- L53: `actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {`
- L54: `val currentOnBack by rememberUpdatedState(onBack)`
- L55: `val callback = remember { IosBackDispatcher.Callback() }`
- L68: `actual fun PlatformNavigationBackHandler(navController: NavHostController) {`
- L69: `val entry by navController.currentBackStackEntryAsState()`
- L70: `val canPop = entry != null && navController.previousBackStackEntry != null`
- L81: `internal fun Modifier.edgeSwipeBack(): Modifier = pointerInput(Unit) {`
- L82: `val edge = 24.dp.toPx()`
- L83: `val minDistance = 80.dp.toPx()`
- L84: `val flickDistance = 24.dp.toPx()`
- L85: `val flickSpeed = 500.dp.toPx()`
- L86: `val slop = viewConfiguration.touchSlop`
- L120: `actual fun Modifier.consumeScaffoldInsets(padding: PaddingValues): Modifier = consumeWindowInsets(padding)`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/ui/Licenses.ios.kt` (38 lines)

- L25: `actual fun LicensesList(modifier: Modifier) {`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/ui/LocationPermission.ios.kt` (15 lines)

- L11: `actual fun rememberLocationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit {`
- L12: `val currentOnResult by rememberUpdatedState(onResult)`
- L13: `val requester = remember { LocationPermissionRequester() }`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/ui/NotificationPermission.ios.kt` (8 lines)

- L7: `actual fun rememberNotificationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit =`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/ui/PaymentSheet.ios.kt` (23 lines)

- L12: `actual fun rememberPaymentSheetLauncher(onOutcome: (PaymentSheetOutcome) -> Unit): PaymentSheetLauncher {`
- L13: `val callback = rememberUpdatedState(onOutcome)`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/ui/PhotoPermissions.ios.kt` (140 lines)

- L38: `actual fun rememberPhotoSources(`
- L44: `val scope = rememberCoroutineScope()`
- L45: `val device = LocalDevice.current`
- L46: `val viewController = LocalUIViewController.current`
- L47: `val consent = remember { PhotoConsentStore(device.prefs) }`
- L48: `val store = photoStore as IosPhotoStore`
- L49: `val picker = remember(viewController) { IosPhotoPicker { viewController.topPresented() } }`
- L50: `val camera = remember(viewController) { IosCameraService { viewController.topPresented() } }`
- L51: `val currentOnPhotos by rememberUpdatedState(onPhotos)`
- L52: `val currentOnMessage by rememberUpdatedState(onMessage)`
- L53: `var askingConsent by remember { mutableStateOf<PhotoSource?>(null) }`
- L54: `var showCameraDenied by remember { mutableStateOf(false) }`
- L56: `fun openGallery() {`
- L65: `fun openCamera() {`
- L75: `fun start(source: PhotoSource) {`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/ui/theme/Theme.ios.kt` (37 lines)

- L12: `actual fun SystemBarIcons(darkTheme: Boolean) = Unit`
- L21: `fun StatusBarFollowsTheme(theme: ThemeMode, viewController: UIViewController) {`

### `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/util/Text.ios.kt` (8 lines)

- L7: `actual fun stripAccents(text: String): String =`

### `mobile/shared/src/iosSimulatorArm64Test/kotlin/com/dzirent/shared/IosSignInTest.kt` (50 lines)

- L21: `class IosSignInTest {`
- L26: `fun signsInWithTestUser1() = runBlocking {`

## Website, Edge Functions and scripts (TypeScript / TSX)


### `supabase/functions/_shared/email-templates.test.ts` (93 lines)

- (no top-level declarations)

### `supabase/functions/_shared/email-templates.ts` (263 lines)

- L9: `export type EmailTemplate =`
- L20: `export const TEMPLATES: EmailTemplate[] = [`
- L25: `export type EmailData = Record<string, unknown>;`
- L26: `export type RenderedEmail = { subject: string; html: string; text: string };`
- L42: `export function money(v: unknown): string {`
- L50: `export function dayLabel(v: unknown): string | null {`
- L57: `export function datesLabel(start: unknown, end: unknown): string | null {`
- L65: `export function timeLabel(v: unknown, timezone: unknown): string | null {`
- L80: `export function escapeHtml(v: string): string {`
- L150: `export function renderEmail(template: string, data: EmailData): RenderedEmail | null {`

### `supabase/functions/_shared/email.ts` (55 lines)

- L8: `export type EmailConfig = { provider: "resend" | "postmark"; key: string; from: string; url: string };`
- L9: `export type EmailMessage = { to: string; subject: string; html: string; text: string; tag: string };`
- L10: `export type EmailResult =`
- L17: `export function emailConfig(env: (name: string) => string | undefined = (n) => Deno.env.get(n)): EmailConfig | null {`
- L27: `export async function sendEmail(cfg: EmailConfig, msg: EmailMessage): Promise<EmailResult> {`

### `supabase/functions/_shared/errors.ts` (24 lines)

- L6: `export const FALLBACK_CODE = "DZ-E9999";`
- L9: `export function errorBody(code: string, message?: string): { code: string; message: string } {`
- L15: `export function errorStatus(code: string): number {`
- L20: `export function codeOf(message: unknown): string | null {`

### `supabase/functions/_shared/input.ts` (70 lines)

- L5: `export type InputRule = {`
- L16: `export type InputResult =`
- L27: `export async function readInput(req: Request, rule: InputRule): Promise<InputResult> {`
- L66: `export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`
- L68: `export function isUuid(value: unknown): value is string {`

### `supabase/functions/_shared/payments.ts` (114 lines)

- L8: `export const corsHeaders = {`
- L14: `export function json(status: number, body: Record<string, unknown>): Response {`
- L19: `export function refuse(code: string, message?: string): Response {`
- L24: `export function dbRefusal(error: { message?: string } | null | undefined): Response {`
- L31: `export const notAvailable = () => refuse("DZ-E4030");`
- L44: `export type Server = { url: string; key: string; db: SupabaseClient };`
- L47: `export function server(): Server | null {`
- L55: `export function bearer(req: Request): string | null {`
- L60: `export async function callerId(srv: Server, token: string | null): Promise<string | null> {`
- L67: `export async function rpcAsCaller(srv: Server, token: string, name: string, args: Record<string, unknown>) {`
- L87: `export async function paymentsReady(srv: Server): Promise<StripeConfig | null> {`
- L95: `export function fromOutbox(req: Request): boolean {`
- L105: `export function safeReturnUrl(value: unknown, fallback: string): string {`

### `supabase/functions/_shared/stripe.ts` (155 lines)

- L8: `export const STRIPE_API_VERSION = "2024-06-20";`
- L13: `export type StripeConfig = {`
- L22: `export function stripeConfig(): StripeConfig | null {`
- L35: `export function formEncode(params: Record<string, unknown>, prefix = "", out: string[] = []): string[] {`
- L50: `export type StripeError = { type?: string; code?: string; decline_code?: string; message?: string; payment_intent?: { id?: string; status?: string } };`
- L52: `export type StripeObject = Record<string, any>;`
- L53: `export type StripeResult =`
- L61: `export async function stripeCall(`
- L99: `export function stripeErrorText(result: { status: number; error: StripeError | null }): string {`
- L120: `export async function verifyStripeSignature(`
- L148: `export async function sha256Hex(bytes: Uint8Array): Promise<string> {`
- L153: `export function cents(amount: unknown): number {`

### `supabase/functions/admin-actions/index.ts` (178 lines)

- (no top-level declarations)

### `supabase/functions/admin-integrations/index.ts` (44 lines)

- (no top-level declarations)

### `supabase/functions/cleanup-files/index.ts` (157 lines)

- (no top-level declarations)

### `supabase/functions/delete-account/index.ts` (140 lines)

- (no top-level declarations)

### `supabase/functions/delete-listing/index.ts` (118 lines)

- (no top-level declarations)

### `supabase/functions/export-my-data/index.ts` (184 lines)

- (no top-level declarations)

### `supabase/functions/scan-listing/index.ts` (275 lines)

- (no top-level declarations)

### `supabase/functions/send-email/index.ts` (72 lines)

- (no top-level declarations)

### `supabase/functions/send-push/index.ts` (294 lines)

- (no top-level declarations)

### `supabase/functions/stripe-account-status/index.ts` (42 lines)

- (no top-level declarations)

### `supabase/functions/stripe-deposit/index.ts` (187 lines)

- (no top-level declarations)

### `supabase/functions/stripe-onboard/index.ts` (59 lines)

- (no top-level declarations)

### `supabase/functions/stripe-pay/index.ts` (95 lines)

- (no top-level declarations)

### `supabase/functions/stripe-refund/index.ts` (75 lines)

- (no top-level declarations)

### `supabase/functions/stripe-webhook/index.ts` (76 lines)

- (no top-level declarations)

### `apps/web/next.config.ts` (80 lines)

- (no top-level declarations)

### `apps/web/src/app/about/page.tsx` (116 lines)

- L6: `export const metadata: Metadata = { title: "A wardrobe worth sharing" };`
- L7: `export default function About() {`

### `apps/web/src/app/accessibility/page.tsx` (175 lines)

- L7: `export const metadata: Metadata = {`
- L21: `export default function AccessibilityPage() {`

### `apps/web/src/app/actions.ts` (205 lines)

- L11: `export async function authenticate(form: FormData) {`
- L129: `export async function acceptLegalAction() {`
- L136: `export async function signOut() {`
- L141: `export async function savePiece(form: FormData) {`
- L167: `export async function studioAction(form: FormData) {`

### `apps/web/src/app/admin/audit-log/page.tsx` (25 lines)

- L5: `export const metadata: Metadata = {`
- L13: `export const dynamic = "force-dynamic";`
- L15: `export default async function AdminAuditLogPage() {`

### `apps/web/src/app/admin/flags/page.tsx` (25 lines)

- L5: `export const metadata: Metadata = {`
- L13: `export const dynamic = "force-dynamic";`
- L15: `export default async function AdminFlagsPage() {`

### `apps/web/src/app/admin/id-verification/page.tsx` (42 lines)

- L3: `export const metadata: Metadata = {`
- L11: `export const dynamic = "force-dynamic";`
- L14: `export default function AdminIdVerificationPage() {`

### `apps/web/src/app/admin/integrations/page.tsx` (64 lines)

- L4: `export const metadata: Metadata = {`
- L12: `export const dynamic = "force-dynamic";`
- L18: `export default async function AdminIntegrationsPage() {`

### `apps/web/src/app/admin/jobs/page.tsx` (23 lines)

- L5: `export const metadata: Metadata = {`
- L13: `export const dynamic = "force-dynamic";`
- L16: `export default async function AdminJobsPage() {`

### `apps/web/src/app/admin/layout.tsx` (59 lines)

- L9: `export const metadata: Metadata = {`
- L17: `export const dynamic = "force-dynamic";`
- L20: `export default async function AdminLayout({`

### `apps/web/src/app/admin/listings/page.tsx` (76 lines)

- L7: `export const dynamic = "force-dynamic";`
- L10: `export default async function AdminListingsPage() {`

### `apps/web/src/app/admin/page.tsx` (246 lines)

- L5: `export const dynamic = "force-dynamic";`
- L58: `export default async function AdminOverviewPage() {`

### `apps/web/src/app/admin/payments/page.tsx` (21 lines)

- L5: `export const metadata: Metadata = {`
- L13: `export const dynamic = "force-dynamic";`
- L16: `export default async function AdminPaymentsPage() {`

### `apps/web/src/app/admin/photo-reviews/page.tsx` (20 lines)

- L7: `export const dynamic = "force-dynamic";`
- L10: `export default async function AdminPhotoReviewsPage() {`

### `apps/web/src/app/admin/reports/page.tsx` (28 lines)

- L5: `export const dynamic = "force-dynamic";`
- L8: `export default async function AdminReportsPage() {`

### `apps/web/src/app/admin/settings/page.tsx` (22 lines)

- L6: `export const metadata: Metadata = {`
- L14: `export const dynamic = "force-dynamic";`
- L17: `export default async function AdminSettingsPage() {`

### `apps/web/src/app/admin/takedowns/page.tsx` (26 lines)

- L5: `export const metadata: Metadata = {`
- L13: `export const dynamic = "force-dynamic";`
- L15: `export default async function AdminTakedownsPage() {`

### `apps/web/src/app/admin/users/page.tsx` (35 lines)

- L5: `export const metadata: Metadata = {`
- L13: `export const dynamic = "force-dynamic";`
- L15: `export default async function AdminUsersPage({`

### `apps/web/src/app/api/cities/route.ts` (8 lines)

- L3: `export async function GET(request:NextRequest) {`

### `apps/web/src/app/api/preferences/route.ts` (85 lines)

- L4: `export async function POST(request: NextRequest) {`

### `apps/web/src/app/api/workflows/[...path]/route.ts` (210 lines)

- L73: `export async function GET(_request: NextRequest, { params }: Params) {`
- L99: `export async function POST(request: NextRequest, { params }: Params) {`

### `apps/web/src/app/app/[feature]/page.tsx` (51 lines)

- L15: `export const metadata: Metadata = {`
- L19: `export default async function Feature({`

### `apps/web/src/app/app/error.tsx` (22 lines)

- L4: `export default function WorkflowFailure({ reset }: { reset: () => void }) {`

### `apps/web/src/app/app/list-a-piece/[id]/page.tsx` (34 lines)

- L6: `export const metadata: Metadata = {`
- L10: `export default async function EditPage({`

### `apps/web/src/app/app/messages/[id]/page.tsx` (28 lines)

- L8: `export const metadata: Metadata = {`
- L12: `export default async function ChatPage({`

### `apps/web/src/app/app/pay/[id]/page.tsx` (48 lines)

- L12: `export const metadata: Metadata = {`
- L17: `export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {`

### `apps/web/src/app/app/settings/[section]/page.tsx` (24 lines)

- L7: `export const metadata: Metadata = {`
- L11: `export default async function SettingsPage({`

### `apps/web/src/app/auth/callback/route.ts` (18 lines)

- L5: `export async function GET(request:NextRequest) {`

### `apps/web/src/app/auth/page.tsx` (206 lines)

- L11: `export const metadata: Metadata = {`
- L15: `export default async function Auth({`

### `apps/web/src/app/community-guidelines/page.tsx` (391 lines)

- L7: `export const metadata: Metadata = {`
- L24: `export default function CommunityGuidelinesPage() {`

### `apps/web/src/app/copyright/page.tsx` (244 lines)

- L7: `export const metadata: Metadata = {`
- L23: `export default function CopyrightPage() {`

### `apps/web/src/app/delete-account/page.tsx` (227 lines)

- L7: `export const metadata: Metadata = {`
- L23: `export default function DeleteAccountPage() {`

### `apps/web/src/app/error.tsx` (17 lines)

- L3: `export default function ErrorPage({ reset }: { reset: () => void }) {`

### `apps/web/src/app/fit/page.tsx` (32 lines)

- L5: `export const metadata: Metadata = {`
- L9: `export default async function Fit() {`

### `apps/web/src/app/help/page.tsx` (452 lines)

- L6: `export const metadata: Metadata = {`
- L21: `export default function HelpPage() {`

### `apps/web/src/app/layout.tsx` (93 lines)

- L10: `export const metadata: Metadata = {`
- L20: `export const viewport: Viewport = {`
- L36: `export default async function RootLayout({`

### `apps/web/src/app/list-an-outfit/page.tsx` (2 lines)

- L2: `export default function Legacy(){redirect('/app/list-a-piece');}`

### `apps/web/src/app/listing/[id]/opengraph-image.tsx` (22 lines)

- L7: `export const alt = "A piece to rent on Dzirent";`
- L8: `export const size = OG_SIZE;`
- L9: `export const contentType = OG_TYPE;`
- L11: `export default async function Image({ params }: { params: Promise<{ id: string }> }) {`

### `apps/web/src/app/listing/[id]/page.tsx` (278 lines)

- L21: `export async function generateMetadata({`
- L78: `export default async function ListingPage({`

### `apps/web/src/app/listing/[id]/twitter-image.tsx` (8 lines)

- L5: `export const alt = "A piece to rent on Dzirent";`
- L6: `export const size = OG_SIZE;`
- L7: `export const contentType = OG_TYPE;`

### `apps/web/src/app/loading.tsx` (1 lines)

- L1: `export default function Loading(){return <div className="page-width loading-state" role="status" aria-label="Finding pieces"><div className="skeleton skeleton-title"/><di`

### `apps/web/src/app/not-found.tsx` (2 lines)

- L2: `export default function NotFound(){return <Empty title="This piece has stepped out." text="It may be paused or no longer available. There are more good finds nearby." hre`

### `apps/web/src/app/page.tsx` (308 lines)

- L48: `export default async function Home({`

### `apps/web/src/app/privacy/page.tsx` (841 lines)

- L7: `export const metadata: Metadata = {`
- L31: `export default function PrivacyPage() {`

### `apps/web/src/app/safety/page.tsx` (266 lines)

- L7: `export const metadata: Metadata = {`
- L24: `export default function SafetyPage() {`

### `apps/web/src/app/saved/page.tsx` (33 lines)

- L6: `export const metadata: Metadata = {`
- L10: `export default async function Saved() {`

### `apps/web/src/app/search/page.tsx` (16 lines)

- L4: `export default async function Search({`

### `apps/web/src/app/sitemap.ts` (29 lines)

- L4: `export default function sitemap(): MetadataRoute.Sitemap {`

### `apps/web/src/app/studio/[handle]/opengraph-image.tsx` (19 lines)

- L6: `export const alt = "A studio on Dzirent";`
- L7: `export const size = OG_SIZE;`
- L8: `export const contentType = OG_TYPE;`
- L10: `export default async function Image({ params }: { params: Promise<{ handle: string }> }) {`

### `apps/web/src/app/studio/[handle]/page.tsx` (188 lines)

- L17: `export async function generateMetadata({`
- L45: `export default async function StudioPage({`

### `apps/web/src/app/studio/[handle]/twitter-image.tsx` (8 lines)

- L5: `export const alt = "A studio on Dzirent";`
- L6: `export const size = OG_SIZE;`
- L7: `export const contentType = OG_TYPE;`

### `apps/web/src/app/studios/page.tsx` (2 lines)

- L2: `export default function Studios(){redirect('/?tab=studios');}`

### `apps/web/src/app/support/page.tsx` (206 lines)

- L7: `export const metadata: Metadata = {`
- L21: `export default function SupportPage() {`

### `apps/web/src/app/terms/page.tsx` (387 lines)

- L7: `export const metadata: Metadata = {`
- L30: `export default function TermsPage() {`

### `apps/web/src/components/admin/action-dialog.tsx` (138 lines)

- L6: `export function ActionDialog({`

### `apps/web/src/components/admin/admin-nav.tsx` (79 lines)

- L7: `export type AdminQueueCounts = {`
- L14: `export function AdminNav({ queues }: { queues: AdminQueueCounts | null }) {`

### `apps/web/src/components/admin/audit-log-view.tsx` (204 lines)

- L5: `export type AuditLogEntry = {`
- L19: `export function AuditLogView({ initialEntries }: { initialEntries: AuditLogEntry[] }) {`

### `apps/web/src/components/admin/flags-view.tsx` (158 lines)

- L7: `export type FeatureFlag = {`
- L37: `export function FlagsView({ initialFlags }: { initialFlags: FeatureFlag[] }) {`

### `apps/web/src/components/admin/jobs-view.tsx` (162 lines)

- L7: `export type JobKindStatus = {`
- L18: `export type JobsStatus = {`
- L27: `export type DeadJob = {`
- L42: `export const JOB_KIND_NAMES: Record<string, string> = {`
- L57: `export function JobsView({ status, initialDead }: { status: JobsStatus | null; initialDead: DeadJob[] }) {`

### `apps/web/src/components/admin/listings-view.tsx` (200 lines)

- L8: `export type AdminListingItem = {`
- L23: `export function ListingsView({ initialListings }: { initialListings: AdminListingItem[] }) {`

### `apps/web/src/components/admin/mfa-gate.tsx` (195 lines)

- L14: `export function AdminMfaGate({ stale = false }: { stale?: boolean }) {`

### `apps/web/src/components/admin/payments-view.tsx` (349 lines)

- L8: `export type PaymentsOverview = {`
- L75: `export function PaymentsView({ overview }: { overview: PaymentsOverview }) {`

### `apps/web/src/components/admin/photo-reviews-view.tsx` (181 lines)

- L8: `export type PhotoReviewItem = {`
- L31: `export function PhotoReviewsView({ initialItems }: { initialItems: PhotoReviewItem[] }) {`

### `apps/web/src/components/admin/rental-evidence.tsx` (66 lines)

- L7: `export function RentalEvidence({ snapshot, links }: { snapshot: Snapshot; links: Record<string, string> }) {`
- L64: `export function rentalPhotoPaths(snapshots: Snapshot[]): string[] {`

### `apps/web/src/components/admin/reports-view.tsx` (601 lines)

- L17: `export type ReportRow = {`
- L39: `export function ReportsView({`

### `apps/web/src/components/admin/settings-view.tsx` (187 lines)

- L16: `export function SettingsView({ initial }: { initial: AdminSetting[] }) {`

### `apps/web/src/components/admin/takedowns-view.tsx` (600 lines)

- L12: `export type AdminTakedownItem = {`
- L27: `export function TakedownsView({ initialTakedowns }: { initialTakedowns: AdminTakedownItem[] }) {`

### `apps/web/src/components/admin/users-view.tsx` (651 lines)

- L138: `export type AdminUserData = {`
- L178: `export function UsersView({ initialUsers, initialQuery }: { initialUsers: AdminUserData[]; initialQuery?: string }) {`

### `apps/web/src/components/age-blocked.tsx` (85 lines)

- L15: `export function AgeBlockedPage() {`

### `apps/web/src/components/cards.tsx` (161 lines)

- L12: `export function PieceCard({`
- L36: `export function PieceGrid({ cards }: { cards: Card[] }) {`
- L52: `export function StudioCards({`
- L95: `export function Empty({`
- L121: `export function Gate({`

### `apps/web/src/components/chat.tsx` (685 lines)

- L28: `export function Chat({`

### `apps/web/src/components/closet.tsx` (318 lines)

- L25: `export function Closet({ initial }: { initial: ClosetData }) {`

### `apps/web/src/components/distance.tsx` (22 lines)

- L4: `export function DistanceUnit({`
- L13: `export function Distance({ miles }: { miles: number | null }) {`

### `apps/web/src/components/guest-gate.tsx` (210 lines)

- L6: `export type GatedActionKey = "save" | "message" | "studio" | "list" | "fit";`
- L8: `export const GATED_ACTIONS: Record<`
- L34: `export function openGuestGate(action: GatedActionKey) {`
- L42: `export function GuestGateDialog({`
- L146: `export function GatedActionTrigger({`

### `apps/web/src/components/icon.tsx` (26 lines)

- L24: `export function Icon({name,className='',style}:{name:string;className?:string;style?:CSSProperties}) {`

### `apps/web/src/components/inbox.tsx` (238 lines)

- L12: `export function useInboxDot(enabled: boolean) {`
- L56: `export function UnreadDot() {`
- L59: `export function Inbox({ initial }: { initial: InboxData }) {`

### `apps/web/src/components/legal-layout.tsx` (121 lines)

- L7: `export function LegalPlaceholder({`
- L29: `export function LegalDraftBanner() {`
- L39: `export interface TocItem {`
- L44: `export interface LegalLayoutProps {`
- L54: `export function LegalLayout({`

### `apps/web/src/components/listing-editor.tsx` (1745 lines)

- L249: `export function ListingEditor({`

### `apps/web/src/components/listing-fields.tsx` (227 lines)

- L4: `export type MeasurementRow = {`
- L9: `export function measurementRows(kind: string, item: string): MeasurementRow[] {`
- L16: `export function usedMeasurements(rows: MeasurementRow[]): Measurement[] {`
- L36: `export function SizeFields({`
- L122: `export function MeasurementFields({`

### `apps/web/src/components/local-preferences.tsx` (235 lines)

- L6: `export type Preferences = {`
- L22: `export function readPreferences(): Preferences {`
- L38: `export function applyTheme(theme: string) {`
- L46: `export function saveTheme(theme: string) {`
- L69: `export function Appearance() {`
- L86: `export function ThemeToggle() {`
- L123: `export function LocalPreferences() {`

### `apps/web/src/components/measurements-editor.tsx` (338 lines)

- L14: `export function MeasurementsEditor({`

### `apps/web/src/components/onboarding.tsx` (518 lines)

- L15: `export type SetupItemId = "location" | "measurements" | "studio" | "first_piece";`
- L17: `export type SetupItem = {`
- L22: `export function setupItems(canLend: boolean): SetupItem[] {`
- L36: `export function hasAnyBodyMeasurement(p: PrivateProfile | null | undefined): boolean {`
- L48: `export type SetupStatus = {`
- L55: `export function WelcomeChecklistModal({`
- L293: `export function FinishSetupCard({`
- L379: `export function GuideOverlay({`

### `apps/web/src/components/pay-form.tsx` (134 lines)

- L15: `export function PaySummary({ rental }: { rental: RentalView }) {`
- L19: `export function PayForm({`

### `apps/web/src/components/payouts.tsx` (68 lines)

- L10: `export function Payouts({ initial }: { initial: PayoutAccount | null }) {`

### `apps/web/src/components/photo.tsx` (82 lines)

- L5: `export function Photo({`
- L37: `export function Gallery({`

### `apps/web/src/components/rental-card.tsx` (479 lines)

- L33: `export function rentalSummary(r: RentalView): string {`
- L53: `export function rentalPaymentLines(r: RentalView, now = Date.now()): string[] {`
- L82: `export function RentalCard({`
- L416: `export function RentalRequestForm({`

### `apps/web/src/components/settings.tsx` (693 lines)

- L67: `export function Settings({`

### `apps/web/src/components/share-button.tsx` (48 lines)

- L14: `export function ShareButton({ text, link, className = "button secondary" }: { text: string; link: string; className?: string }) {`

### `apps/web/src/components/shell.tsx` (1259 lines)

- L55: `export function UpdateLocation() {`
- L64: `export function FilterButton() {`
- L312: `export function Shell({`
- L1246: `export function BrowseGuest() {`

### `apps/web/src/components/sort-dropdown.tsx` (66 lines)

- L6: `export function SortDropdown({`

### `apps/web/src/components/start-chat.tsx` (85 lines)

- L7: `export function StartChat({`

### `apps/web/src/components/studio-editor.tsx` (221 lines)

- L19: `export function StudioEditor({ profile }: { profile: Profile }) {`

### `apps/web/src/components/submit.tsx` (128 lines)

- L52: `export function Submit({ label }: { label: string }) {`
- L77: `export function ConfirmSubmit({`

### `apps/web/src/components/tabs.tsx` (6 lines)

- L3: `export function Tabs({labels,children,initial=0}:{labels:string[];children:ReactNode[];initial?:number}) {`

### `apps/web/src/components/terms-update.tsx` (40 lines)

- L6: `export function TermsUpdateScreen() {`

### `apps/web/src/components/workflow-ui.tsx` (79 lines)

- L4: `export function WorkflowModal({`
- L60: `export function Notice({`
- L76: `export function Changed() {`

### `apps/web/src/content/legal/config.ts` (179 lines)

- L5: `export interface LegalConfig {`
- L93: `export const LEGAL_CONFIG: LegalConfig = {`

### `apps/web/src/lib/admin-actions.ts` (421 lines)

- L60: `export async function dismissReportAction(reportId: string, reason: string) {`
- L71: `export async function warnUserAction(`
- L88: `export async function removeReportedContentAction(`
- L102: `export async function suspendUserAction(`
- L121: `export async function unsuspendUserAction(userId: string, reason: string) {`
- L133: `export async function banUserAction(`
- L149: `export async function unbanUserAction(`
- L165: `export async function decideScanAction(`
- L181: `export async function hideListingAction(listingId: string, reason: string) {`
- L192: `export async function unhideListingAction(listingId: string, reason: string) {`
- L203: `export async function createTakedownAction(data: {`
- L227: `export async function takedownRemoveListingAction(`
- L243: `export async function removePhotosAction(`
- L260: `export async function recordCounterNoticeAction(`
- L276: `export async function setTakedownStatusAction(`
- L292: `export async function setFlagAction(key: string, enabled: boolean) {`
- L305: `export async function findUserAction(query: string) {`
- L331: `export async function userRentalsAction(userId: string) {`
- L341: `export async function claimEvidenceLinksAction(paths: string[]) {`
- L347: `export async function decideClaimAction(claimId: string, amount: number, reason: string) {`
- L356: `export async function refundRentalAction(rentalId: string, amount: number, reason: string) {`
- L365: `export async function endRentalAction(input: {`
- L389: `export async function setSettingAction(key: string, value: unknown, reason: string) {`
- L397: `export type IntegrationStatus = { key: string; name: string; configured: boolean; status: string };`
- L403: `export async function integrationsAction(): Promise<IntegrationStatus[]> {`
- L414: `export async function retryJobAction(jobId: number) {`

### `apps/web/src/lib/admin-code.ts` (14 lines)

- L6: `export const ADMIN_CODE_FIRST = "DZ-E5002";`
- L7: `export const ADMIN_CODE_STALE = "DZ-E5003";`
- L8: `export const ADMIN_CODE_NEEDED = [ADMIN_CODE_FIRST, ADMIN_CODE_STALE];`
- L11: `export function adminCodeNeeded(message: string | null | undefined): boolean {`

### `apps/web/src/lib/admin-settings.test.ts` (35 lines)

- (no top-level declarations)

### `apps/web/src/lib/admin-settings.ts` (88 lines)

- L5: `export type SettingType = "integer" | "number" | "boolean" | "timezone" | "choice" | "rate_limit";`
- L6: `export type AdminSetting = {`
- L22: `export const areaTitles: [AdminSetting["area"], string][] = [`
- L29: `export const decidedByLabels: Record<AdminSetting["decided_by"], string> = {`
- L36: `export function formatSettingValue(s: Pick<AdminSetting, "type" | "value" | "unit">, value: unknown = s.value): string {`
- L46: `export function settingInput(s: Pick<AdminSetting, "type" | "value">): string {`
- L52: `export type Parsed = { ok: true; value: unknown } | { ok: false; problem: string };`
- L58: `export function parseSettingInput(s: Pick<AdminSetting, "type" | "min" | "max" | "unit" | "choices">, input: string): Parsed {`
- L84: `export function groupSettings(settings: AdminSetting[]): [string, AdminSetting[]][] {`

### `apps/web/src/lib/data.ts` (221 lines)

- L15: `export const context = cache(async (): Promise<BrowseContext> => {`
- L96: `export async function browse(`
- L130: `export const getListing = cache(`
- L153: `export async function fit(ctx: BrowseContext): Promise<Card[]> {`
- L164: `export async function savedStudios(`
- L178: `export async function studio(`
- L192: `export async function isSaved(id: string) {`
- L204: `export function studioCards(cards: Card[]): StudioCardData[] {`

### `apps/web/src/lib/drafts.ts` (84 lines)

- L10: `export async function draftRead<T>(key: string): Promise<T | null> {`
- L25: `export async function draftWrite(key: string, value: unknown) {`
- L39: `export async function draftClear(key: string) {`
- L52: `export async function compressPhoto(file: File): Promise<Blob> {`

### `apps/web/src/lib/errors.test.ts` (58 lines)

- (no top-level declarations)

### `apps/web/src/lib/errors.ts` (77 lines)

- L9: `export const FALLBACK_CODE = "DZ-E9999";`
- L11: `export type ShownError = { code: string; message: string; field?: string };`
- L16: `export function parseCoded(message: string | null | undefined): { code: string; words: string } | null {`
- L22: `export function codeOf(message: string | null | undefined): string | null {`
- L27: `export function shown(code: string, field?: string): ShownError {`
- L34: `export function fromServer(message: string | null | undefined, hint?: string | null): ShownError | null {`
- L47: `export function describeError(error: unknown): ShownError {`
- L60: `export function errorText(error: ShownError): string {`
- L65: `export function warningCode(message: string): string | null {`
- L74: `export function warningText(message: string): string {`

### `apps/web/src/lib/listing-form.ts` (83 lines)

- L4: `export type ListingForm = {`
- L22: `export function validateListing(f: ListingForm) {`

### `apps/web/src/lib/listing-mutations.ts` (327 lines)

- L45: `export async function saveListing(body: Body) {`
- L117: `export async function finishListing(body: Body) {`
- L226: `export async function scanListing(body: Body) {`
- L245: `export async function uploadPhoto(request: Request, id: string) {`
- L289: `export async function removePhoto(id: string, photoId: string) {`
- L308: `export async function edgeDelete(`

### `apps/web/src/lib/og.tsx` (120 lines)

- L8: `export const OG_SIZE = { width: 1200, height: 630 };`
- L9: `export const OG_TYPE = "image/png";`
- L65: `export function listingImage(p: { photo: string | null; title: string; line: string; handle: string | null }) {`
- L81: `export function studioImage(p: { photos: (string | null)[]; name: string; handle: string }) {`
- L110: `export function genericImage(heading = "Your neighborhood wardrobe") {`

### `apps/web/src/lib/preview.ts` (106 lines)

- L20: `export function safeDecode(value: string): string {`
- L31: `export async function guestListing(id: string): Promise<Listing | null> {`
- L39: `export function priceAndCity(listing: Pick<Card, "price" | "city">): string {`
- L44: `export type StudioPreview = { name: string; handle: string; photos: string[] };`
- L51: `export async function studioPreview(handle: string): Promise<StudioPreview | null> {`
- L79: `export async function newestPieces(limit = 8): Promise<Card[]> {`
- L92: `export async function photoData(url: string | null): Promise<string | null> {`

### `apps/web/src/lib/refusals.ts` (24 lines)

- L5: `export const REFUSALS = {`
- L10: `export type RefusalNotice = keyof typeof REFUSALS;`
- L13: `export function refusalNotice(message: string | null | undefined): RefusalNotice | null {`
- L22: `export function refusalText(notice: string | null | undefined): string | null {`

### `apps/web/src/lib/rentals.test.ts` (198 lines)

- (no top-level declarations)

### `apps/web/src/lib/rentals.ts` (464 lines)

- L5: `export type RentalStatus =`
- L19: `export type RentalEvent = {`
- L27: `export type RentalPhoto = {`
- L35: `export type RentalView = {`
- L74: `export type RentalClaim = {`
- L87: `export type RentalSettings = {`
- L98: `export const OPEN: RentalStatus[] = [`
- L102: `export const IN_PROGRESS: RentalStatus[] = [`
- L105: `export const MIN_CONDITION_PHOTOS = 2;`
- L107: `export type RentalAction =`
- L124: `export const actionLabels: Record<RentalAction, string> = {`
- L142: `export type PaymentFacts = {`
- L153: `export function paymentFacts(r: RentalView, now = Date.now()): PaymentFacts {`
- L171: `export function rentalActions(status: string, iAmLender: boolean, pay: PaymentFacts = { paymentsOn: false }): RentalAction[] {`
- L202: `export function money(amount: number): string {`
- L210: `export function moneyCents(amount: number): string {`
- L215: `export function payLabel(total: number | null | undefined): string {`
- L220: `export function depositLine(amount: number | null | undefined, status: string | undefined, captured: number | null | undefined): string | null {`
- L240: `export function claimLine(status: string | null | undefined, amount: number | null | undefined, decided: number | null | undefined, iAmLender: boolean): string | null {`
- L259: `export function claimAmountProblem(text: string, deposit: number | null | undefined): string | null {`
- L266: `export function claimReasonProblem(reason: string): string | null {`
- L271: `export function claimPhotosProblem(chosen: number): string | null {`
- L275: `export function parseDepositAmount(text: string): number | null | "DZ-E4051" {`
- L283: `export type PayoutState = "not_set_up" | "finish_setup" | "ready";`
- L284: `export const payoutLabels: Record<PayoutState, { label: string; button: string }> = {`
- L289: `export function payoutState(account: { charges_enabled: boolean; payouts_enabled: boolean } | null): PayoutState {`
- L294: `export type ReceiptLine = { label: string; amount: string };`
- L299: `export function rentalReceipt(r: Pick<RentalView, "your_role" | "price_per_day" | "days" | "total" | "tax_amount" | "fee_amount" | "refund_amount" | "deposit_amount" | "d`
- L331: `export function conditionPhotoStage(status: string): "pickup" | "return" | null {`
- L338: `export function hoursText(hours: number): string {`
- L346: `export function rentalStatusLabel(status: string, iAmLender: boolean, requestHours?: number | null): string {`
- L394: `export function rentalEventLabel(to: string, by: string, otherName: string): string {`
- L401: `export type RentalGroup = "requests_for_you" | "waiting" | "upcoming" | "in_progress" | "past";`
- L403: `export const groupTitles: [RentalGroup, string][] = [`
- L410: `export function rentalGroup(status: string, iAmLender: boolean): RentalGroup {`
- L417: `export type Range = { start: string; end: string };`
- L422: `export function rentalDays(r: Range): number {`
- L427: `export function requestTotal(perDay: number, r: Range): string {`
- L458: `export function rentalDatesProblem(wanted: Range, windows: Range[], booked: Range[], today: string): string | null {`

### `apps/web/src/lib/request-origin.ts` (27 lines)

- L3: `export function sameOrigin(request: Request) {`

### `apps/web/src/lib/retry.ts` (60 lines)

- L5: `export const MAX_RETRIES = 2;`
- L9: `export const READ_RPCS = new Set([`
- L17: `export function isRead(method: string, url: string): boolean {`
- L33: `export function retryableStatus(status: number): boolean {`
- L37: `export function delayMs(retry: number): number {`
- L44: `export function retryingFetch(base: typeof fetch = fetch): typeof fetch {`

### `apps/web/src/lib/share.ts` (9 lines)

- L3: `export const SITE = "https://dzirent.com";`
- L5: `export const listingLink = (id: string) => `${SITE}/listing/${id}`;`
- L6: `export const studioLink = (handle: string) => `${SITE}/studio/${encodeURIComponent(handle)}`;`
- L8: `export const listingShareText = (title: string, id: string) => `${title} on Dzirent: ${listingLink(id)}`;`
- L9: `export const studioShareText = (name: string, handle: string) => `${name} on Dzirent: ${studioLink(handle)}`;`

### `apps/web/src/lib/supabase/client.ts` (8 lines)

- L4: `export function browserClient() {`

### `apps/web/src/lib/supabase/config.ts` (15 lines)

- L1: `export function config() {`
- L7: `export function photoUrl(path: string | null | undefined) {`

### `apps/web/src/lib/supabase/server.ts` (25 lines)

- L6: `export const serverClient = cache(async () => {`
- L21: `export const currentUser = cache(async () => {`

### `apps/web/src/lib/suspension.ts` (33 lines)

- L1: `export function suspensionNotice(`

### `apps/web/src/lib/types.ts` (126 lines)

- L1: `export type Card = {`
- L18: `export type Listing = Card & {`
- L32: `export type Studio = {`
- L44: `export type StudioCardData = {`
- L52: `export type City = {`
- L59: `export type BrowseContext = {`
- L69: `export type Query = Record<string, string | string[] | undefined>;`
- L70: `export const categories = [`
- L78: `export const styles = [`
- L89: `export const value = (q: Query, name: string) =>`
- L91: `export const price = (amount: number | null) =>`
- L101: `export const perDay = (amount: number | null) =>`
- L104: `export const daysAndTotal = (days: number | null | undefined, total: number | null | undefined) =>`
- L106: `export const distance = (miles: number | null) =>`
- L112: `export function cityLabel(city: string | null) {`
- L117: `export function safeNext(path: string | null | undefined) {`

### `apps/web/src/lib/workflow-mutations.ts` (430 lines)

- L7: `export function dates(body: Body, required = true) {`
- L21: `export async function chatMutation(id: string, action: string, body: Body) {`
- L215: `export async function paymentMutation(path: string[], body: Body, origin: string) {`
- L241: `export async function uploadRentalPhoto(request: Request, conversationId: string) {`
- L267: `export async function accountMutation(action: string, body: Body) {`

### `apps/web/src/lib/workflow-server.ts` (346 lines)

- L22: `export class WorkflowError extends Error {`
- L34: `export function codedError(error: unknown, status = 400): WorkflowError {`
- L42: `export function must<T>(`
- L50: `export async function session() {`
- L55: `export const uuid = (s: string) =>`
- L59: `export async function conversation(id: string) {`
- L87: `export async function readInbox(): Promise<InboxData> {`
- L140: `export async function readRentals(): Promise<RentalView[]> {`
- L144: `export async function readChat(id: string): Promise<ChatData> {`
- L205: `export async function readRentalSettings(): Promise<RentalSettings | null> {`
- L210: `export async function ownListing(id: string): Promise<OwnListing> {`
- L248: `export async function readCloset() {`
- L274: `export async function readSettings(): Promise<SettingsData> {`
- L320: `export async function editorData(id?: string) {`

### `apps/web/src/lib/workflows.ts` (353 lines)

- L2: `export type { RentalView } from "./rentals";`
- L3: `export type Profile = {`
- L18: `export type PrivateProfile = {`
- L31: `export type OwnPhoto = {`
- L37: `export type Measurement = { label: string; value: number; unit: "cm" | "in" };`
- L38: `export type OwnListing = {`
- L62: `export type Conversation = {`
- L71: `export type ConversationCard = {`
- L86: `export type Message = {`
- L94: `export type Rental = {`
- L107: `export type Outcome = {`
- L112: `export type InboxData = {`
- L121: `export type ChatData = {`
- L139: `export type NotificationChoicesData = {`
- L146: `export type PayoutAccount = { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean };`
- L147: `export type SettingsData = {`
- L159: `export const itemTypes = [`
- L167: `export const studioStyles = [`
- L181: `export const slots = [`
- L189: `export const slotNames = [`
- L197: `export const garmentKinds = {`
- L206: `export const templates: Record<string, string[]> = {`
- L232: `export const declarationTexts = [`
- L238: `export const listingNotice =`
- L240: `export const fullPolicy =`
- L242: `export const safetyTip =`
- L244: `export const reportReasons = [`
- L251: `export const bodyFields = [`
- L259: `export const bodyLabels = [`
- L267: `export const isoToday = () => new Date().toLocaleDateString("en-CA");`
- L268: `export function dateRange(start: string | null, end: string | null) {`
- L279: `export function activity(data: InboxData) {`
- L318: `export class WorkflowClientError extends Error {`
- L327: `export async function workflow<T>(path: string, body?: unknown): Promise<T> {`
- L341: `export function dateChip(start: string | null, end: string | null) {`

### `apps/web/src/proxy.ts` (45 lines)

- L5: `export async function proxy(request: NextRequest) {`
- L45: `export const config = {matcher:['/((?!_next/static|_next/image|favicon.ico|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)']};`

## Photo service (Python)


### `services/vision/app/__init__.py` (1 lines)

- (no top-level declarations)

### `services/vision/app/build_assets.py` (79 lines)

- L24: `def tokenizer_for(model_dir):`
- L32: `def download(model_dir) -> None:`
- L42: `def embed_prompts(model, tokenizer, prompts: list[str], batch: int = 64) -> np.ndarray:`
- L49: `def build(model_dir=config.MODEL_DIR, fetch: bool = True) -> None:`

### `services/vision/app/colors.py` (196 lines)

- L60: `def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:`
- L79: `def nearest_color_indices(rgb: np.ndarray) -> np.ndarray:`
- L91: `def nearest_color_name(r: int, g: int, b: int) -> str:`
- L95: `def looks_like_skin(rgb: np.ndarray) -> np.ndarray:`
- L105: `class ColorVotes:`
- L124: `def center_box(width: int, height: int) -> tuple[int, int, int, int]:`
- L131: `def color_votes(image: np.ndarray, region: np.ndarray | None, background: np.ndarray | None = None) -> ColorVotes:`
- L168: `def name_colors(votes: ColorVotes) -> tuple[str | None, str | None]:`

### `services/vision/app/config.py` (57 lines)

- (no top-level declarations)

### `services/vision/app/fetch.py` (78 lines)

- L18: `class PhotoError(Exception):`
- L26: `def _allowed_url(url: str) -> bool:`
- L34: `async def fetch_photo(client: httpx.AsyncClient, url: str) -> bytes:`
- L65: `def open_image(data: bytes) -> Image.Image:`

### `services/vision/app/main.py` (138 lines)

- L34: `async def lifespan(_: FastAPI):`
- L54: `class PhotoIn(BaseModel):`
- L67: `class ScanIn(BaseModel):`
- L72: `@app.get("/health")`
- L73: `async def health() -> dict:`
- L90: `def _run(listing_id: str, photos: list[PhotoIn], payloads: list) -> dict:`
- L113: `@app.post("/scan")`
- L114: `async def scan_endpoint(body: ScanIn) -> dict:`

### `services/vision/app/model.py` (78 lines)

- L23: `def _model_cfg(model_dir: Path) -> dict:`
- L28: `def create_open_clip(model_dir: Path) -> torch.nn.Module:`
- L38: `def create_vision_tower(model_dir: Path) -> torch.nn.Module:`
- L49: `def preprocess(image: Image.Image) -> torch.Tensor:`
- L56: `class Model:`

### `services/vision/app/quality.py` (239 lines)

- L56: `class Check:`
- L64: `class Quality:`
- L96: `def working_image(image: Image.Image) -> np.ndarray:`
- L105: `def gray(rgb: np.ndarray) -> np.ndarray:`
- L111: `def laplacian(g: np.ndarray) -> np.ndarray:`
- L117: `def check_sharpness(g: np.ndarray) -> tuple[Check, float | None]:`
- L140: `def _center(values: np.ndarray) -> np.ndarray:`
- L147: `def check_lighting(g: np.ndarray) -> Check:`
- L168: `def _erode(mask: np.ndarray, k: int) -> np.ndarray:`
- L173: `def _dilate(mask: np.ndarray, k: int) -> np.ndarray:`
- L177: `def find_item(rgb: np.ndarray) -> tuple[Check, float | None, np.ndarray | None, np.ndarray | None]:`
- L227: `def check_photo(rgb: np.ndarray) -> Quality:`

### `services/vision/app/safety.py` (49 lines)

- L17: `def preprocess(image: Image.Image, size: int = config.SAFETY_IMAGE_SIZE) -> torch.Tensor:`
- L30: `class SafetyModel:`

### `services/vision/app/scan.py` (214 lines)

- L29: `class TextBank:`
- L35: `def softmax(logits: np.ndarray) -> np.ndarray:`
- L40: `def zero_shot(embedding: np.ndarray, bank: TextBank) -> dict[str, float]:`
- L45: `def item_scores(embedding: np.ndarray, banks: dict[str, TextBank]) -> Scores:`
- L57: `def unit_mean(embeddings: list[np.ndarray]) -> np.ndarray | None:`
- L65: `def _r(x: float | None, digits: int = 4) -> float | None:`
- L69: `def _top(probs: dict[str, float], n: int) -> dict[str, float]:`
- L74: `class PhotoResult:`
- L120: `def analyze_photo(result: PhotoResult, embedding: np.ndarray, rgb: np.ndarray, banks: dict[str, TextBank],`
- L133: `def _suggestions(combined: np.ndarray, whole: list[PhotoResult], banks: dict[str, TextBank], vocab: Vocab,`
- L178: `def _quality_summary(results: list[PhotoResult]) -> dict:`
- L191: `def scan(listing_id: str, results: list[PhotoResult], banks: dict[str, TextBank], vocab: Vocab) -> dict:`

### `services/vision/app/text.py` (40 lines)

- L15: `def title_for(noun: str, color: str | None = None, detail: str | None = None) -> str:`
- L27: `def suggest_text(`

### `services/vision/app/verdict.py` (185 lines)

- L60: `class Scores:`
- L85: `class Decision:`
- L93: `def decide_photo(scores: Scores, vocab: Vocab) -> Decision:`
- L120: `class PhotoView:`
- L129: `class Verdict:`
- L135: `def decide_listing(photos: list[PhotoView], combined: Decision | None, vocab: Vocab) -> Verdict:`
- L154: `def _decide_item(photos: list[PhotoView], combined: Decision | None, vocab: Vocab) -> Verdict:`

### `services/vision/app/vocab.py` (152 lines)

- L35: `class Item:`
- L59: `class Entry:`
- L70: `class Vocab:`
- L88: `def _check_item(row: dict) -> Item:`
- L123: `def load() -> Vocab:`
- L149: `def policy_rows() -> list[dict]:`

### `services/vision/eval/run_eval.py` (190 lines)

- L37: `def load_env(path: str | None) -> None:`
- L46: `def identity_token() -> str:`
- L54: `def post_json(url: str, body: dict | None, headers: dict, timeout: float = 150) -> tuple[int, dict | None, float]:`
- L66: `def sample_listings() -> list[tuple[str, str]]:`
- L72: `def sample_photos(supabase_url: str, key: str) -> list[dict]:`
- L89: `def folder_photos(folder: Path) -> list[dict]:`
- L100: `def passes(expected: str, verdict: str | None) -> bool:`
- L106: `def main() -> int:`

### `services/vision/tests/conftest.py` (9 lines)

- L8: `def pytest_configure(config):`

### `services/vision/tests/test_colors.py` (67 lines)

- L6: `def solid(rgb, w=64, h=64):`
- L10: `def votes(image):`
- L14: `def test_typical_shades_get_their_names():`
- L24: `def test_one_color_garment():`
- L28: `def test_clear_second_color():`
- L34: `def test_two_colors_too_close_to_call():`
- L40: `def test_shadow_shades_are_not_a_second_color():`
- L46: `def test_too_few_pixels_names_nothing():`
- L50: `def test_dark_pixels_are_navy_only_when_blue():`
- L55: `def test_center_box_leaves_out_the_background():`
- L62: `def test_skin_is_left_out_unless_it_is_most_of_the_piece():`

### `services/vision/tests/test_policy_sync.py` (20 lines)

- L12: `def test_newest_policy_migration_matches_policy_json():`
- L19: `def test_policy_loads_and_every_row_is_valid():`

### `services/vision/tests/test_safety.py` (65 lines)

- L23: `def test_preprocess_is_the_models_384_center_crop_with_mean_and_std_half():`
- L31: `def test_preprocess_scales_small_images_up():`
- L35: `def test_quality_warnings_never_mention_a_person_or_wearing():`
- L45: `def test_the_pinned_model_loads_strictly_and_gives_probabilities():`
- L60: `def test_plain_synthetic_images_are_not_read_as_unsafe():`

### `services/vision/tests/test_text.py` (31 lines)

- L4: `def test_color_detail_and_noun():`
- L9: `def test_second_color_is_accents():`
- L14: `def test_saree_second_color_is_its_border():`
- L18: `def test_jewelry_gets_no_color():`
- L22: `def test_detail_already_in_the_noun_is_not_repeated():`
- L26: `def test_without_color_or_detail():`
- L30: `def test_title_fits_the_listing_limit():`

### `services/vision/tests/test_verdict.py` (170 lines)

- L13: `def scores(items: dict, not_fashion: float = 0.05, details: dict | None = None) -> Scores:`
- L19: `def photo(items: dict, slot: str | None = "front", **kw) -> PhotoView:`
- L36: `def test_photo_thresholds(items, kw, expected):`
- L40: `def test_rejection_names_the_item_with_the_most_probability_in_its_group():`
- L45: `def combined(items: dict = GOWN):`
- L49: `def test_all_whole_piece_photos_allowed():`
- L54: `def test_not_allowed_item_is_rejected_and_named():`
- L59: `def test_not_clothing_is_rejected():`
- L64: `def test_unsure_is_never_allowed():`
- L70: `def test_allowed_and_not_allowed_photos_conflict():`
- L75: `def test_unsure_photo_that_does_not_lean_allowed_sends_to_review():`
- L81: `def test_unsure_photo_that_leans_allowed_is_fine_when_the_photos_together_are_allowed():`
- L87: `def test_photos_together_must_be_allowed():`
- L92: `def test_a_bag_and_a_dress_are_different_things():`
- L98: `def test_size_tag_that_looks_like_a_document_is_ignored():`
- L104: `def test_not_allowed_close_up_still_raises_a_conflict():`
- L109: `def test_only_detail_photos_ask_for_the_whole_piece():`
- L114: `def test_a_photo_that_could_not_be_opened_sends_to_review():`
- L121: `def safe(view: PhotoView, nsfw: float = 0.0, hooded: float = 0.0) -> PhotoView:`
- L125: `def test_clear_nudity_is_rejected_even_when_the_item_is_allowed():`
- L130: `def test_nudity_in_a_size_tag_or_close_up_still_counts():`
- L135: `def test_uncertain_nudity_goes_to_review():`
- L140: `def test_uncertain_nudity_never_softens_a_rejection():`
- L145: `def test_low_nudity_scores_change_nothing():`
- L150: `def test_a_hooded_garment_goes_to_review_instead_of_allowed():`
- L155: `def test_a_hood_never_softens_a_rejection():`
- L161: `def test_a_photo_that_is_not_hooded_stays_allowed():`
- L166: `def test_being_worn_is_never_an_input_to_the_verdict():`

### `supabase/tests/guest_rest.py` (38 lines)

- L8: `def main():`

## Database migrations (SQL)


### `supabase/migrations/20261030232726_foundation_schema.sql` (337 lines)

- L2: `CREATE SCHEMA IF NOT EXISTS extensions;`
- L3: `CREATE SCHEMA IF NOT EXISTS app_private;`
- L4: `REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;`
- L5: `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;`
- L6: `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;`
- L10: `CREATE TABLE public."accessory_declarations" (`
- L24: `CREATE TABLE public."availability" (`
- L31: `CREATE TABLE public."blocks" (`
- L36: `CREATE TABLE public."conversation_reads" (`
- L42: `CREATE TABLE public."conversations" (`
- L52: `CREATE TABLE public."listing_declarations" (`
- L62: `CREATE TABLE public."listing_events" (`
- L70: `CREATE TABLE public."listing_measurements" (`
- L78: `CREATE TABLE public."listing_photos" (`
- L86: `CREATE TABLE public."listings" (`
- L108: `CREATE TABLE public."messages" (`
- L116: `CREATE TABLE public."private_profiles" (`
- L130: `CREATE TABLE public."profiles" (`
- L146: `CREATE TABLE public."rental_outcomes" (`
- L153: `CREATE TABLE public."rentals" (`
- L167: `CREATE TABLE public."reports" (`
- L177: `CREATE TABLE public."saved_listings" (`
- L183: `CREATE TABLE public."saved_studios" (`
- L189: `CREATE TABLE public."suggestion_events" (`
- L199: `CREATE TABLE public."us_cities" (`
- L207: `ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_name_check" CHECK (char_length(btrim(full_legal_name)) >= 2 AND char_length(btrim(full_`
- L208: `ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_pkey" PRIMARY KEY (id);`
- L209: `ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_version_check" CHECK (declaration_version > 0);`
- L210: `ALTER TABLE public."availability" ADD CONSTRAINT "availability_check" CHECK (end_date >= start_date);`
- L211: `ALTER TABLE public."availability" ADD CONSTRAINT "availability_pkey" PRIMARY KEY (id);`
- L212: `ALTER TABLE public."blocks" ADD CONSTRAINT "blocks_pkey" PRIMARY KEY (blocker_id, blocked_id);`
- L213: `ALTER TABLE public."conversation_reads" ADD CONSTRAINT "conversation_reads_pkey" PRIMARY KEY (user_id, conversation_id);`
- L214: `ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_listing_id_renter_id_key" UNIQUE (listing_id, renter_id);`
- L215: `ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_pkey" PRIMARY KEY (id);`
- L216: `ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_requested_dates_check" CHECK (requested_start IS NULL AND requested_end IS NULL OR requested_start IS NOT`
- L217: `ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_pkey" PRIMARY KEY (id);`
- L218: `ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_version_check" CHECK (declaration_version > 0);`
- L219: `ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_pkey" PRIMARY KEY (id);`
- L220: `ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_type_check" CHECK (type = ANY (ARRAY['view'::text, 'save'::text, 'message'::text]));`
- L221: `ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_label_check" CHECK (char_length(label) >= 1 AND char_length(label) <= 40);`
- L222: `ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_pkey" PRIMARY KEY (id);`
- L223: `ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_unit_check" CHECK (unit = ANY (ARRAY['cm'::text, 'in'::text]));`
- L224: `ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_value_check" CHECK (value > 0::numeric AND value < 1000::numeric);`
- L225: `ALTER TABLE public."listing_photos" ADD CONSTRAINT "listing_photos_pkey" PRIMARY KEY (id);`
- L226: `ALTER TABLE public."listing_photos" ADD CONSTRAINT "listing_photos_slot_check" CHECK (slot IS NULL OR (slot = ANY (ARRAY['front'::text, 'back'::text, 'close_up'::text, 's`
- L227: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_accessory_value_check" CHECK (category <> 'Accessories'::text OR retail_value IS NULL OR retail_value <= 300::numer`
- L228: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_category_check" CHECK (category = ANY (ARRAY['Career & Professional'::text, 'Occasion & Party'::text, 'Cultural & T`
- L229: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_deposit_note_length" CHECK (char_length(deposit_note) <= 120);`
- L230: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_description_check" CHECK (char_length(description) <= 1000);`
- L231: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_garment_type_check" CHECK (garment_type IS NULL OR (garment_type = ANY (ARRAY['top'::text, 'trousers'::text, 'suit'`
- L232: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_item_type_check" CHECK (item_type IS NULL OR category = 'Accessories'::text AND (item_type = ANY (ARRAY['Sunglasses`
- L233: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_listing_styles_check" CHECK (cardinality(listing_styles) <= 3 AND listing_styles <@ ARRAY['South Asian'::text, 'Eas`
- L234: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_pkey" PRIMARY KEY (id);`
- L235: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_price_note_check" CHECK (char_length(price_note) <= 60);`
- L236: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_price_usd_positive" CHECK (price_usd > 0::numeric);`
- L237: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_retail_value_positive" CHECK (retail_value > 0::numeric);`
- L238: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_status_check" CHECK (status = ANY (ARRAY['active'::text, 'paused'::text]));`
- L239: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_title_check" CHECK (char_length(title) >= 3 AND char_length(title) <= 80);`
- L240: `ALTER TABLE public."messages" ADD CONSTRAINT "messages_body_check" CHECK (char_length(body) >= 1 AND char_length(body) <= 2000);`
- L241: `ALTER TABLE public."messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY (id);`
- L242: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_chest_cm_range" CHECK (chest_cm > 0::numeric AND chest_cm < 300::numeric);`
- L243: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_fit_profile_check" CHECK (fit_profile = ANY (ARRAY['man'::text, 'woman'::text]));`
- L244: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_height_cm_range" CHECK (height_cm > 0::numeric AND height_cm < 300::numeric);`
- L245: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_hips_cm_range" CHECK (hips_cm > 0::numeric AND hips_cm < 300::numeric);`
- L246: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_inseam_cm_range" CHECK (inseam_cm > 0::numeric AND inseam_cm < 300::numeric);`
- L247: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_pkey" PRIMARY KEY (user_id);`
- L248: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_shoulder_cm_range" CHECK (shoulder_cm > 0::numeric AND shoulder_cm < 300::numeric);`
- L249: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_style_interests_check" CHECK (style_interests <@ ARRAY['South Asian'::text, 'East Asian'::text, 'So`
- L250: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_waist_cm_range" CHECK (waist_cm > 0::numeric AND waist_cm < 300::numeric);`
- L251: `ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pickup_area_length" CHECK (char_length(pickup_area) <= 60);`
- L252: `ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);`
- L253: `ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['renter'::text, 'lender'::text, 'both'::text]));`
- L254: `ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_studio_bio_length" CHECK (char_length(studio_bio) <= 200);`
- L255: `ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_studio_handle_format" CHECK (studio_handle ~ '^[a-z0-9._]{3,30}$'::text);`
- L256: `ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_studio_name_length" CHECK (char_length(studio_name) >= 1 AND char_length(studio_name) <= 40);`
- L257: `ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_style_tags_check" CHECK (cardinality(style_tags) <= 5 AND style_tags <@ ARRAY['Minimalist'::text, 'Classic'::text, `
- L258: `ALTER TABLE public."rental_outcomes" ADD CONSTRAINT "rental_outcomes_pkey" PRIMARY KEY (conversation_id, user_id);`
- L259: `ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_conversation_id_key" UNIQUE (conversation_id);`
- L260: `ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_dates_check" CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);`
- L261: `ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_pkey" PRIMARY KEY (id);`
- L262: `ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_status_check" CHECK (status = ANY (ARRAY['active'::text, 'returned'::text, 'cancelled'::text]));`
- L263: `ALTER TABLE public."reports" ADD CONSTRAINT "reports_details_length" CHECK (char_length(details) <= 500);`
- L264: `ALTER TABLE public."reports" ADD CONSTRAINT "reports_pkey" PRIMARY KEY (id);`
- L265: `ALTER TABLE public."reports" ADD CONSTRAINT "reports_reason_check" CHECK (char_length(reason) <= 500);`
- L266: `ALTER TABLE public."reports" ADD CONSTRAINT "reports_target_type_check" CHECK (target_type = ANY (ARRAY['listing'::text, 'user'::text, 'message'::text]));`
- L267: `ALTER TABLE public."saved_listings" ADD CONSTRAINT "saved_listings_pkey" PRIMARY KEY (user_id, listing_id);`
- L268: `ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_not_self" CHECK (user_id <> lender_id);`
- L269: `ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_pkey" PRIMARY KEY (user_id, lender_id);`
- L270: `ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_action_check" CHECK (action = ANY (ARRAY['kept'::text, 'cleared'::text, 'edited'::text, 'picked':`
- L271: `ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_field_check" CHECK (field = ANY (ARRAY['title'::text, 'category'::text, 'description'::text, 'sty`
- L272: `ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_label_check" CHECK (char_length(label) <= 80);`
- L273: `ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_pkey" PRIMARY KEY (id);`
- L274: `ALTER TABLE public."us_cities" ADD CONSTRAINT "us_cities_pkey" PRIMARY KEY (id);`
- L275: `ALTER TABLE public."us_cities" ADD CONSTRAINT "us_cities_state_check" CHECK (state ~ '^[A-Z]{2}$'::text);`
- L276: `ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;`
- L277: `ALTER TABLE public."availability" ADD CONSTRAINT "availability_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;`
- L278: `ALTER TABLE public."blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L279: `ALTER TABLE public."blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L280: `ALTER TABLE public."conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELE`
- L281: `ALTER TABLE public."conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L282: `ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L283: `ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;`
- L284: `ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_renter_id_fkey" FOREIGN KEY (renter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L285: `ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL`
- L286: `ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;`
- L287: `ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;`
- L288: `ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L289: `ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;`
- L290: `ALTER TABLE public."listing_photos" ADD CONSTRAINT "listing_photos_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;`
- L291: `ALTER TABLE public."listings" ADD CONSTRAINT "listings_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L292: `ALTER TABLE public."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;`
- L293: `ALTER TABLE public."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L294: `ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L295: `ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;`
- L296: `ALTER TABLE public."rental_outcomes" ADD CONSTRAINT "rental_outcomes_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CAS`
- L297: `ALTER TABLE public."rental_outcomes" ADD CONSTRAINT "rental_outcomes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L298: `ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;`
- L299: `ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L300: `ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;`
- L301: `ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_renter_id_fkey" FOREIGN KEY (renter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L302: `ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;`
- L303: `ALTER TABLE public."reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L304: `ALTER TABLE public."saved_listings" ADD CONSTRAINT "saved_listings_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;`
- L305: `ALTER TABLE public."saved_listings" ADD CONSTRAINT "saved_listings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L306: `ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L307: `ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- L308: `ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;`
- L309: `ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;`
- L311: `CREATE INDEX rentals_renter_id_idx ON public.rentals USING btree (renter_id);`
- L312: `CREATE INDEX listing_measurements_listing_id_idx ON public.listing_measurements USING btree (listing_id);`
- L313: `CREATE INDEX listings_description_trgm_idx ON public.listings USING gin (description gin_trgm_ops);`
- L314: `CREATE INDEX accessory_declarations_user_idx ON public.accessory_declarations USING btree (user_id, declaration_version);`
- L315: `CREATE INDEX listing_photos_listing_id_idx ON public.listing_photos USING btree (listing_id);`
- L316: `CREATE INDEX listing_declarations_user_idx ON public.listing_declarations USING btree (user_id);`
- L317: `CREATE INDEX listings_ai_review_needed_idx ON public.listings USING btree (created_at) WHERE ai_review_needed;`
- L318: `CREATE INDEX us_cities_lower_name_idx ON public.us_cities USING btree (lower(name) text_pattern_ops);`
- L319: `CREATE INDEX listing_events_listing_id_idx ON public.listing_events USING btree (listing_id);`
- L320: `CREATE INDEX conversations_lender_id_idx ON public.conversations USING btree (lender_id);`
- L321: `CREATE UNIQUE INDEX profiles_studio_handle_key ON public.profiles USING btree (studio_handle);`
- L322: `CREATE INDEX suggestion_events_field_label_idx ON public.suggestion_events USING btree (field, label, action);`
- L323: `CREATE INDEX conversation_reads_conversation_id_idx ON public.conversation_reads USING btree (conversation_id);`
- L324: `CREATE INDEX rentals_lender_id_idx ON public.rentals USING btree (lender_id);`
- L325: `CREATE INDEX listing_events_user_created_idx ON public.listing_events USING btree (user_id, created_at);`
- L326: `CREATE INDEX saved_listings_listing_id_idx ON public.saved_listings USING btree (listing_id);`
- L327: `CREATE INDEX conversations_renter_id_idx ON public.conversations USING btree (renter_id);`
- L328: `CREATE INDEX listing_declarations_listing_idx ON public.listing_declarations USING btree (listing_id);`
- L329: `CREATE INDEX saved_studios_lender_id_idx ON public.saved_studios USING btree (lender_id);`
- L330: `CREATE INDEX messages_conversation_created_idx ON public.messages USING btree (conversation_id, created_at);`
- L331: `CREATE INDEX availability_listing_id_idx ON public.availability USING btree (listing_id);`
- L332: `CREATE INDEX suggestion_events_created_idx ON public.suggestion_events USING btree (created_at);`
- L333: `CREATE INDEX listings_title_trgm_idx ON public.listings USING gin (title gin_trgm_ops);`

### `supabase/migrations/20261030232727_foundation_functions.sql` (348 lines)

- L5: `create or replace function public.handle_new_user()`
- L43: `create or replace function public.set_updated_at()`
- L54: `create or replace function public.rentals_set_updated_at()`
- L65: `create or replace function public.keep_ai_review_needed()`
- L79: `create or replace function public.require_accessory_declaration()`
- L100: `create or replace function public.declaration_request_ip()`
- L113: `create or replace function app_private.is_blocked(a uuid, b uuid)`
- L134: `create or replace function public.my_block_peer_ids()`
- L154: `create or replace function public.record_accessory_declaration(`
- L193: `create or replace function public.record_listing_declaration(`
- L228: `create or replace function public.search_cities(p_query text, p_limit integer default 20)`
- L252: `create or replace function public.set_conversation_dates(`
- L278: `create or replace function public.mark_conversation_read(p_conversation_id uuid)`
- L295: `create or replace function public.mark_activity_seen()`
- L314: `create or replace function app_private.validate_conversation()`
- L337: `create trigger on_auth_user_created after insert on auth.users`
- L339: `create trigger rentals_set_updated_at before update on public.rentals`
- L341: `create trigger private_profiles_set_updated_at before update on public.private_profiles`
- L343: `create trigger listings_keep_ai_review_needed before update on public.listings`
- L345: `create trigger listings_require_accessory_declaration before insert or update on public.listings`
- L347: `create trigger conversations_validate before insert on public.conversations`

### `supabase/migrations/20261030232729_foundation_access.sql` (285 lines)

- L3: `revoke all on all tables in schema public from public, anon, authenticated;`
- L4: `revoke all on all sequences in schema public from public, anon, authenticated;`
- L5: `revoke all on schema app_private from public, anon, authenticated;`
- L6: `grant usage on schema public to anon, authenticated, service_role;`
- L23: `grant select, update on public.profiles to authenticated;`
- L24: `create policy profiles_owner_read on public.profiles`
- L26: `create policy profiles_owner_update on public.profiles`
- L30: `grant select, insert, update, delete on public.private_profiles to authenticated;`
- L31: `create policy private_profiles_owner on public.private_profiles`
- L35: `grant select, insert, delete on public.listings to authenticated;`
- L37: `grant update (`
- L42: `create policy listings_owner_read on public.listings`
- L44: `create policy listings_owner_insert on public.listings`
- L51: `create policy listings_owner_update on public.listings`
- L55: `create policy listings_owner_delete on public.listings`
- L58: `grant select, insert, update, delete on`
- L60: `create policy listing_photos_owner on public.listing_photos`
- L69: `create policy listing_measurements_owner on public.listing_measurements`
- L78: `create policy availability_owner on public.availability`
- L88: `grant select, insert on public.conversations to authenticated;`
- L89: `create policy conversations_participant_read on public.conversations`
- L94: `create policy conversations_renter_insert on public.conversations`
- L100: `grant select, insert on public.messages to authenticated;`
- L101: `create policy messages_participant_read on public.messages`
- L107: `create policy messages_sender_insert on public.messages`
- L117: `grant select, insert, update, delete on public.blocks to authenticated;`
- L118: `create policy blocks_owner on public.blocks`
- L122: `grant select, insert, update, delete on public.rental_outcomes to authenticated;`
- L123: `create policy rental_outcomes_owner on public.rental_outcomes`
- L133: `grant select, insert on public.reports to authenticated;`
- L134: `create policy reports_owner_read on public.reports`
- L136: `create policy reports_owner_insert on public.reports`
- L139: `grant select, insert, update, delete on public.saved_listings, public.saved_studios to authenticated;`
- L140: `create policy saved_listings_owner on public.saved_listings`
- L143: `create policy saved_studios_owner on public.saved_studios`
- L147: `grant select, insert on public.listing_events to authenticated;`
- L148: `create policy listing_events_owner_read on public.listing_events`
- L150: `create policy listing_events_owner_insert on public.listing_events`
- L153: `grant select, insert on public.rentals to authenticated;`
- L155: `grant update (status, start_date, end_date, updated_by) on public.rentals to authenticated;`
- L156: `create policy rentals_participant_read on public.rentals`
- L158: `create policy rentals_participant_insert on public.rentals`
- L167: `create policy rentals_participant_update on public.rentals`
- L178: `grant select, insert, update, delete on public.conversation_reads to authenticated;`
- L179: `create policy conversation_reads_owner on public.conversation_reads`
- L190: `grant select on public.accessory_declarations, public.listing_declarations to authenticated;`
- L191: `create policy accessory_declarations_owner_read on public.accessory_declarations`
- L193: `create policy listing_declarations_owner_read on public.listing_declarations`
- L196: `grant select, insert on public.suggestion_events to authenticated;`
- L197: `create policy suggestion_events_owner_read on public.suggestion_events`
- L199: `create policy suggestion_events_owner_insert on public.suggestion_events`
- L209: `grant select, insert, update, delete on all tables in schema public to service_role;`
- L217: `create policy listing_photos_storage_owner_read on storage.objects`
- L225: `create policy listing_photos_storage_owner_insert on storage.objects`
- L235: `create policy listing_photos_storage_owner_update on storage.objects`
- L251: `create policy listing_photos_storage_owner_delete on storage.objects`
- L261: `revoke execute on all functions in schema public from public, anon, authenticated;`
- L262: `revoke execute on all functions in schema app_private from public, anon, authenticated;`
- L266: `grant execute on function public.search_cities(text, integer) to anon, authenticated;`
- L268: `grant usage on schema app_private to authenticated;`
- L269: `grant execute on function app_private.is_blocked(uuid, uuid) to authenticated;`
- L270: `grant execute on function public.my_block_peer_ids() to authenticated;`
- L271: `grant execute on function public.record_accessory_declaration(text, integer, text) to authenticated;`
- L272: `grant execute on function public.record_listing_declaration(uuid, integer) to authenticated;`
- L273: `grant execute on function public.set_conversation_dates(uuid, date, date) to authenticated;`
- L274: `grant execute on function public.mark_conversation_read(uuid) to authenticated;`
- L275: `grant execute on function public.mark_activity_seen() to authenticated;`

### `supabase/migrations/20261030232953_photo_cleanup.sql` (79 lines)

- L3: `create or replace function app_private.require_empty_listing_folder()`
- L33: `create trigger listings_require_empty_photo_folder before delete on public.listings`
- L40: `create or replace function app_private.lock_photo_listing()`
- L75: `create trigger listing_photos_lock_parent before insert or update on storage.objects`
- L78: `revoke execute on function app_private.require_empty_listing_folder() from public, anon, authenticated;`
- L79: `revoke execute on function app_private.lock_photo_listing() from public, anon, authenticated;`

### `supabase/migrations/20261031010000_shop_window.sql` (957 lines)

- L4: `create or replace function app_private.validate_conversation()`
- L36: `create or replace function public.browse_listings(`
- L218: `create or replace function public.get_listing(`
- L326: `create or replace function public.get_studio(`
- L458: `create or replace function public.fit_listings(`
- L645: `create or replace function public.my_conversations(`
- L742: `create or replace function public.my_saved_studios(`
- L813: `create or replace function public.save_studio(p_handle text)`
- L850: `create or replace function public.unsave_studio(p_handle text)`
- L878: `create or replace function public.start_conversation(`
- L934: `grant execute on function public.browse_listings to anon, authenticated, service_role;`
- L935: `grant execute on function public.get_listing to anon, authenticated, service_role;`
- L938: `grant execute on function public.get_studio to authenticated, service_role;`
- L939: `revoke execute on function public.get_studio from anon, public;`
- L941: `grant execute on function public.fit_listings to authenticated, service_role;`
- L942: `revoke execute on function public.fit_listings from anon, public;`
- L944: `grant execute on function public.my_conversations to authenticated, service_role;`
- L945: `revoke execute on function public.my_conversations from anon, public;`
- L947: `grant execute on function public.my_saved_studios to authenticated, service_role;`
- L948: `revoke execute on function public.my_saved_studios from anon, public;`
- L950: `grant execute on function public.save_studio to authenticated, service_role;`
- L951: `revoke execute on function public.save_studio from anon, public;`
- L953: `grant execute on function public.unsave_studio to authenticated, service_role;`
- L954: `revoke execute on function public.unsave_studio from anon, public;`
- L956: `grant execute on function public.start_conversation to authenticated, service_role;`
- L957: `revoke execute on function public.start_conversation from anon, public;`

### `supabase/migrations/20261031010001_shop_window_fix.sql` (539 lines)

- L3: `create or replace function public.browse_listings(`
- L185: `create or replace function public.fit_listings(`
- L372: `create or replace function public.my_conversations(`
- L469: `create or replace function public.my_saved_studios(`

### `supabase/migrations/20261031020000_handle_moderation.sql` (106 lines)

- L4: `create or replace function public.block_user(p_handle text)`
- L33: `create or replace function public.unblock_user(p_handle text)`
- L61: `create or replace function public.report_user(`
- L98: `grant execute on function public.block_user to authenticated, service_role;`
- L99: `revoke execute on function public.block_user from anon, public;`
- L101: `grant execute on function public.unblock_user to authenticated, service_role;`
- L102: `revoke execute on function public.unblock_user from anon, public;`
- L104: `grant execute on function public.report_user to authenticated, service_role;`
- L105: `revoke execute on function public.report_user from anon, public;`

### `supabase/migrations/20261031030000_parity_shop_window_gaps.sql` (303 lines)

- L8: `create or replace function public.my_blocked_users()`
- L40: `revoke all on function public.my_blocked_users() from public;`
- L41: `grant execute on function public.my_blocked_users() to authenticated;`
- L44: `create or replace function public.my_saved_listings(`
- L151: `revoke all on function public.my_saved_listings(double precision, double precision, integer, integer) from public;`
- L152: `grant execute on function public.my_saved_listings(double precision, double precision, integer, integer) to authenticated;`
- L155: `drop function if exists public.get_studio(text, double precision, double precision);`
- L157: `create or replace function public.get_studio(`
- L301: `revoke all on function public.get_studio(text, double precision, double precision) from public;`
- L302: `grant execute on function public.get_studio(text, double precision, double precision) to authenticated;`

### `supabase/migrations/20261104035948_step7a_push_notifications.sql` (346 lines)

- L6: `create extension if not exists pg_net with schema extensions;`
- L10: `create table public.device_tokens (`
- L22: `create index device_tokens_user_id_idx on public.device_tokens using btree (user_id);`
- L25: `create table public.notification_settings (`
- L34: `create trigger notification_settings_set_updated_at before update on public.notification_settings`
- L38: `alter table public.device_tokens enable row level security;`
- L39: `alter table public.notification_settings enable row level security;`
- L40: `revoke all on public.device_tokens, public.notification_settings from public, anon, authenticated;`
- L42: `grant select, delete on public.device_tokens to authenticated;`
- L43: `grant select, insert, update on public.notification_settings to authenticated;`
- L45: `grant select, insert, update, delete on public.device_tokens, public.notification_settings to service_role;`
- L47: `create policy device_tokens_owner on public.device_tokens`
- L50: `create policy notification_settings_owner on public.notification_settings`
- L55: `create or replace function public.register_push_token(p_token text, p_platform text)`
- L85: `create or replace function public.unregister_push_token(p_token text)`
- L100: `create or replace function app_private.push_safe_text(p_text text, p_max integer)`
- L128: `create or replace function app_private.push_dates_label(p_start date, p_end date)`
- L146: `create or replace function app_private.queue_push(`
- L239: `create or replace function app_private.push_new_message()`
- L263: `create or replace function app_private.push_new_conversation()`
- L280: `create or replace function app_private.push_dates_changed()`
- L303: `create trigger messages_push after insert on public.messages`
- L305: `create trigger conversations_push_new after insert on public.conversations`
- L307: `create trigger conversations_push_dates after update of requested_start, requested_end on public.conversations`
- L314: `revoke execute on function public.register_push_token(text, text) from public, anon, authenticated;`
- L315: `grant execute on function public.register_push_token(text, text) to authenticated, service_role;`
- L316: `revoke execute on function public.unregister_push_token(text) from public, anon, authenticated;`
- L317: `grant execute on function public.unregister_push_token(text) to authenticated, service_role;`
- L318: `revoke execute on function app_private.push_safe_text(text, integer) from public, anon, authenticated;`
- L319: `revoke execute on function app_private.push_dates_label(date, date) from public, anon, authenticated;`
- L320: `revoke execute on function app_private.queue_push(text, uuid, uuid, uuid, text) from public, anon, authenticated;`
- L321: `revoke execute on function app_private.push_new_message() from public, anon, authenticated;`
- L322: `revoke execute on function app_private.push_new_conversation() from public, anon, authenticated;`
- L323: `revoke execute on function app_private.push_dates_changed() from public, anon, authenticated;`

### `supabase/migrations/20261104140000_step5b_dates_block.sql` (38 lines)

- L3: `create or replace function public.set_conversation_dates(`

### `supabase/migrations/20261105200000_step8a_photo_scanning.sql` (552 lines)

- L8: `create extension if not exists vector with schema extensions;`
- L11: `create table public.app_settings (`
- L28: `create table public.policy_item_types (`
- L191: `create table public.listing_scans (`
- L214: `create index listing_scans_listing_created_idx on public.listing_scans using btree (listing_id, created_at desc);`
- L216: `create unique index listing_scans_one_in_progress on public.listing_scans using btree (listing_id)`
- L219: `create table public.photo_scans (`
- L241: `create index photo_scans_scan_id_idx on public.photo_scans using btree (scan_id);`
- L242: `create index photo_scans_listing_id_idx on public.photo_scans using btree (listing_id);`
- L243: `create index photo_scans_photo_id_idx on public.photo_scans using btree (photo_id);`
- L246: `alter table public.app_settings enable row level security;`
- L247: `alter table public.policy_item_types enable row level security;`
- L248: `alter table public.listing_scans enable row level security;`
- L249: `alter table public.photo_scans enable row level security;`
- L250: `revoke all on public.app_settings, public.policy_item_types, public.listing_scans, public.photo_scans`
- L253: `grant select on public.app_settings, public.policy_item_types to anon, authenticated, service_role;`
- L254: `create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);`
- L255: `create policy policy_item_types_read on public.policy_item_types for select to anon, authenticated using (true);`
- L257: `grant select on public.listing_scans, public.photo_scans to authenticated;`
- L258: `grant select, insert, update, delete on public.listing_scans, public.photo_scans to service_role;`
- L259: `create policy listing_scans_owner_read on public.listing_scans`
- L265: `create policy photo_scans_owner_read on public.photo_scans`
- L274: `create or replace function app_private.photo_set_hash(p_listing_id uuid)`
- L288: `create or replace function public.request_scan(p_listing_id uuid)`
- L357: `create or replace function public.vision_start_scan(p_scan_id uuid)`
- L389: `create or replace function public.vision_finish_scan(p_scan_id uuid, p_photo_set_hash text, p_result jsonb)`
- L464: `create or replace function public.vision_fail_scan(p_scan_id uuid, p_error text)`
- L479: `create or replace function app_private.vision_publish_gate()`
- L514: `create trigger listings_vision_publish_gate before insert or update of status on public.listings`
- L518: `revoke execute on function public.request_scan(uuid) from public, anon, authenticated;`
- L519: `grant execute on function public.request_scan(uuid) to authenticated, service_role;`
- L520: `revoke execute on function public.vision_start_scan(uuid) from public, anon, authenticated;`
- L521: `grant execute on function public.vision_start_scan(uuid) to service_role;`
- L522: `revoke execute on function public.vision_finish_scan(uuid, text, jsonb) from public, anon, authenticated;`
- L523: `grant execute on function public.vision_finish_scan(uuid, text, jsonb) to service_role;`
- L524: `revoke execute on function public.vision_fail_scan(uuid, text) from public, anon, authenticated;`
- L525: `grant execute on function public.vision_fail_scan(uuid, text) to service_role;`
- L527: `revoke execute on function app_private.photo_set_hash(uuid) from public, anon;`
- L528: `grant execute on function app_private.photo_set_hash(uuid) to authenticated, service_role;`
- L529: `revoke execute on function app_private.vision_publish_gate() from public, anon, authenticated;`

### `supabase/migrations/20261106040000_step8b_photo_policy.sql` (516 lines)

- L161: `alter table public.listings add column auto_paused_reason text;`
- L162: `alter table public.listings add constraint listings_auto_paused_reason_length`
- L169: `create or replace function app_private.vision_required()`
- L182: `create or replace function app_private.queue_scan(p_listing_id uuid, p_lender uuid)`
- L249: `create or replace function app_private.vision_pause(p_listing_id uuid, p_reason text)`
- L266: `create or replace function app_private.recheck_active_listing(p_listing_id uuid)`
- L287: `create or replace function public.request_scan(p_listing_id uuid)`
- L316: `create or replace function app_private.rescan_on_photo_change()`
- L340: `create trigger listing_photos_rescan_insert_delete after insert or delete on public.listing_photos`
- L342: `create trigger listing_photos_rescan_update after update of storage_path, slot, listing_id on public.listing_photos`
- L352: `create or replace function public.vision_finish_scan(p_scan_id uuid, p_photo_set_hash text, p_result jsonb)`
- L442: `create or replace function public.vision_fail_scan(p_scan_id uuid, p_error text)`
- L465: `create or replace function app_private.vision_publish_gate()`
- L508: `revoke execute on function app_private.vision_required() from public, anon, authenticated;`
- L509: `revoke execute on function app_private.queue_scan(uuid, uuid) from public, anon, authenticated;`
- L510: `revoke execute on function app_private.vision_pause(uuid, text) from public, anon, authenticated;`
- L511: `revoke execute on function app_private.recheck_active_listing(uuid) from public, anon, authenticated;`
- L512: `revoke execute on function app_private.rescan_on_photo_change() from public, anon, authenticated;`
- L513: `revoke execute on function public.vision_fail_scan(uuid, text) from public, anon, authenticated;`
- L514: `grant execute on function public.vision_fail_scan(uuid, text) to service_role;`

### `supabase/migrations/20261106050000_step8b_sweater_prompts.sql` (144 lines)

- (no top-level declarations)

### `supabase/migrations/20261106070000_step8b_server_role_helpers.sql` (8 lines)

- L6: `grant usage on schema app_private to service_role;`
- L7: `grant execute on function app_private.vision_pause(uuid, text) to service_role;`
- L8: `grant execute on function app_private.recheck_active_listing(uuid) to service_role;`

### `supabase/migrations/20261106080000_step8b_test_vision_on.sql` (6 lines)

- (no top-level declarations)

### `supabase/migrations/20261106081000_step8b_test_vision_off.sql` (4 lines)

- (no top-level declarations)

### `supabase/migrations/20261106120000_p1b_legal_and_consent.sql` (209 lines)

- L10: `create table public.legal_documents (`
- L24: `create table public.legal_acceptances (`
- L42: `alter table public.legal_documents enable row level security;`
- L43: `alter table public.legal_acceptances enable row level security;`
- L44: `revoke all on public.legal_documents, public.legal_acceptances`
- L46: `grant select on public.legal_documents to anon, authenticated, service_role;`
- L47: `create policy legal_documents_read on public.legal_documents`
- L49: `grant select on public.legal_acceptances to authenticated, service_role;`
- L50: `create policy legal_acceptances_owner_read on public.legal_acceptances`
- L54: `create or replace function public.accept_legal(p_platform text)`
- L78: `create or replace function public.needs_legal_acceptance()`
- L101: `alter table public.private_profiles add column measurements_consent_at timestamp with time zone;`
- L111: `create or replace function app_private.require_measurements_consent()`
- L150: `create trigger private_profiles_measurements_consent before insert or update on public.private_profiles`
- L154: `create or replace function public.give_measurements_consent()`
- L178: `create or replace function public.withdraw_measurements_consent()`
- L199: `revoke execute on function public.accept_legal(text) from public, anon, authenticated;`
- L200: `grant execute on function public.accept_legal(text) to authenticated, service_role;`
- L201: `revoke execute on function public.needs_legal_acceptance() from public, anon, authenticated;`
- L202: `grant execute on function public.needs_legal_acceptance() to authenticated, service_role;`
- L203: `revoke execute on function public.give_measurements_consent() from public, anon, authenticated;`
- L204: `grant execute on function public.give_measurements_consent() to authenticated, service_role;`
- L205: `revoke execute on function public.withdraw_measurements_consent() from public, anon, authenticated;`
- L206: `grant execute on function public.withdraw_measurements_consent() to authenticated, service_role;`
- L207: `revoke execute on function app_private.require_measurements_consent() from public, anon, authenticated;`

### `supabase/migrations/20261107010000_p2a_text_filter.sql` (683 lines)

- L12: `create extension if not exists unaccent with schema extensions;`
- L16: `create or replace function app_private.filter_normalize(p_text text)`
- L31: `create or replace function app_private.filter_pattern(p_term text)`
- L41: `create table app_private.text_filter_terms (`
- L49: `create table app_private.text_filter_allowed (`
- L55: `alter table app_private.text_filter_terms enable row level security;`
- L56: `alter table app_private.text_filter_allowed enable row level security;`
- L57: `revoke all on app_private.text_filter_terms, app_private.text_filter_allowed`
- L496: `create or replace function app_private.text_has_contact(p_text text)`
- L513: `create or replace function app_private.text_refusal(p_text text, p_where text)`
- L545: `create or replace function app_private.check_text_field(p_text text, p_where text, p_field text)`
- L563: `create or replace function app_private.filter_listing_text()`
- L585: `create or replace function app_private.filter_profile_text()`
- L610: `create or replace function app_private.filter_message_text()`
- L623: `create or replace function app_private.filter_report_text()`
- L639: `create trigger listings_filter_text before insert or update on public.listings`
- L641: `create trigger profiles_filter_text before insert or update on public.profiles`
- L643: `create trigger messages_filter_text before insert or update on public.messages`
- L645: `create trigger reports_filter_text before insert or update on public.reports`
- L650: `create or replace function public.check_text(p_text text, p_where text)`
- L670: `revoke execute on function app_private.filter_normalize(text) from public, anon, authenticated;`
- L671: `revoke execute on function app_private.filter_pattern(text) from public, anon, authenticated;`
- L672: `revoke execute on function app_private.text_has_contact(text) from public, anon, authenticated;`
- L673: `revoke execute on function app_private.text_refusal(text, text) from public, anon, authenticated;`
- L674: `revoke execute on function app_private.check_text_field(text, text, text) from public, anon;`
- L675: `grant execute on function app_private.check_text_field(text, text, text) to authenticated, service_role;`
- L676: `revoke execute on function app_private.filter_listing_text() from public, anon, authenticated;`
- L677: `revoke execute on function app_private.filter_profile_text() from public, anon, authenticated;`
- L678: `revoke execute on function app_private.filter_message_text() from public, anon, authenticated;`
- L679: `revoke execute on function app_private.filter_report_text() from public, anon, authenticated;`
- L680: `revoke execute on function public.check_text(text, text) from public;`
- L681: `grant execute on function public.check_text(text, text) to anon, authenticated, service_role;`

### `supabase/migrations/20261107012000_p2a_text_filter_one_as_l.sql` (41 lines)

- L3: `create or replace function app_private.text_refusal(p_text text, p_where text)`
- L41: `revoke execute on function app_private.text_refusal(text, text) from public, anon, authenticated;`

### `supabase/migrations/20261107100000_p2b_admin_core.sql` (582 lines)

- L6: `create table app_private.admin_users (`
- L13: `alter table app_private.admin_users enable row level security;`
- L14: `revoke all on app_private.admin_users from public, anon, authenticated, service_role;`
- L17: `create or replace function public.is_admin()`
- L29: `create or replace function app_private.require_admin()`
- L50: `create table app_private.admin_actions (`
- L62: `create index admin_actions_created_idx on app_private.admin_actions using btree (created_at desc);`
- L63: `create index admin_actions_target_idx on app_private.admin_actions using btree (target_type, target_id);`
- L64: `alter table app_private.admin_actions enable row level security;`
- L65: `revoke all on app_private.admin_actions from public, anon, authenticated, service_role;`
- L67: `create or replace function app_private.admin_actions_append_only()`
- L76: `create trigger admin_actions_no_update_delete before update or delete on app_private.admin_actions`
- L78: `create trigger admin_actions_no_truncate before truncate on app_private.admin_actions`
- L81: `create or replace function app_private.log_admin_action(`
- L95: `create table app_private.settings (`
- L102: `alter table app_private.settings enable row level security;`
- L103: `revoke all on app_private.settings from public, anon, authenticated, service_role;`
- L110: `alter table public.profiles`
- L116: `create or replace function app_private.suspension_message(p_user uuid)`
- L134: `create or replace function app_private.keep_suspension()`
- L147: `create trigger profiles_keep_suspension before update on public.profiles`
- L150: `create or replace function app_private.refuse_suspended_sender()`
- L164: `create trigger messages_refuse_suspended before insert on public.messages`
- L167: `create or replace function app_private.refuse_suspended_renter()`
- L181: `create trigger conversations_refuse_suspended before insert on public.conversations`
- L187: `alter table public.listings`
- L196: `create or replace function app_private.listing_hold_guard()`
- L230: `create trigger listings_admin_hold before insert or update on public.listings`
- L234: `create or replace function app_private.hold_listing(p_listing uuid, p_hold text, p_reason text)`
- L260: `create or replace function app_private.release_listing(p_listing uuid, p_hold text)`
- L288: `alter table public.reports alter column reporter_id drop not null;`
- L289: `alter table public.reports drop constraint reports_reporter_id_fkey;`
- L290: `alter table public.reports add constraint reports_reporter_id_fkey foreign key (reporter_id)`
- L292: `alter table public.reports`
- L303: `create index reports_status_created_idx on public.reports using btree (status, created_at);`
- L304: `create index reports_target_user_idx on public.reports using btree (target_user_id);`
- L306: `create table app_private.report_evidence (`
- L314: `alter table app_private.report_evidence enable row level security;`
- L315: `revoke all on app_private.report_evidence from public, anon, authenticated, service_role;`
- L317: `create or replace function app_private.report_evidence_frozen()`
- L326: `create trigger report_evidence_no_update before update on app_private.report_evidence`
- L330: `create or replace function app_private.report_target_user(p_reporter uuid, p_type text, p_target uuid)`
- L361: `create or replace function app_private.report_snapshot(p_type text, p_target uuid)`
- L428: `create or replace function app_private.capture_report_evidence(p_report uuid)`
- L444: `create or replace function app_private.report_prepare()`
- L462: `create or replace function app_private.report_capture()`
- L473: `create trigger reports_prepare before insert on public.reports`
- L475: `create trigger reports_capture_evidence after insert on public.reports`
- L479: `create or replace function app_private.filter_report_text()`
- L493: `create or replace function app_private.purge_expired_reports()`
- L511: `create table public.user_warnings (`
- L523: `create index user_warnings_user_idx on public.user_warnings using btree (user_id);`
- L524: `alter table public.user_warnings enable row level security;`
- L525: `revoke all on public.user_warnings from public, anon, authenticated, service_role;`
- L526: `grant select on public.user_warnings to authenticated;`
- L527: `create policy user_warnings_owner_read on public.user_warnings`
- L531: `create table app_private.takedown_requests (`
- L549: `alter table app_private.takedown_requests enable row level security;`
- L550: `revoke all on app_private.takedown_requests from public, anon, authenticated, service_role;`
- L553: `alter table public.listing_scans`
- L559: `revoke execute on function app_private.require_admin() from public, anon, authenticated;`
- L560: `revoke execute on function app_private.log_admin_action(uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;`
- L561: `revoke execute on function app_private.admin_actions_append_only() from public, anon, authenticated;`
- L562: `revoke execute on function app_private.keep_suspension() from public, anon, authenticated;`
- L563: `revoke execute on function app_private.refuse_suspended_sender() from public, anon, authenticated;`
- L564: `revoke execute on function app_private.refuse_suspended_renter() from public, anon, authenticated;`
- L565: `revoke execute on function app_private.listing_hold_guard() from public, anon, authenticated;`
- L566: `revoke execute on function app_private.hold_listing(uuid, text, text) from public, anon, authenticated;`
- L567: `revoke execute on function app_private.release_listing(uuid, text) from public, anon, authenticated;`
- L568: `revoke execute on function app_private.report_evidence_frozen() from public, anon, authenticated;`
- L569: `revoke execute on function app_private.report_snapshot(text, uuid) from public, anon, authenticated;`
- L570: `revoke execute on function app_private.report_prepare() from public, anon, authenticated;`
- L571: `revoke execute on function app_private.report_capture() from public, anon, authenticated;`
- L572: `revoke execute on function app_private.purge_expired_reports() from public, anon, authenticated;`
- L573: `revoke execute on function app_private.suspension_message(uuid) from public, anon;`
- L574: `grant execute on function app_private.suspension_message(uuid) to authenticated, service_role;`
- L575: `revoke execute on function app_private.report_target_user(uuid, text, uuid) from public, anon;`
- L576: `grant execute on function app_private.report_target_user(uuid, text, uuid) to authenticated, service_role;`
- L577: `revoke execute on function app_private.capture_report_evidence(uuid) from public, anon;`
- L578: `grant execute on function app_private.capture_report_evidence(uuid) to authenticated, service_role;`
- L579: `revoke execute on function public.is_admin() from public, anon;`
- L580: `grant execute on function public.is_admin() to authenticated, service_role;`

### `supabase/migrations/20261107101000_p2b_admin_functions.sql` (791 lines)

- L7: `create or replace function app_private.close_report(p_report uuid, p_outcome text, p_note text, p_admin uuid)`
- L33: `create or replace function app_private.require_reason(p_reason text)`
- L47: `create or replace function app_private.profile_state(p_user uuid)`
- L61: `create or replace function public.admin_queues()`
- L86: `create or replace function public.admin_list_reports(p_status text default 'open', p_limit integer default 30, p_offset integer default 0)`
- L117: `create or replace function public.admin_list_scan_reviews(p_limit integer default 30, p_offset integer default 0)`
- L151: `create or replace function public.admin_list_takedowns(p_status text default null, p_limit integer default 30, p_offset integer default 0)`
- L175: `create or replace function public.admin_list_id_reviews()`
- L191: `create or replace function public.admin_dismiss_report(p_report_id uuid, p_reason text)`
- L212: `create or replace function public.admin_warn_user(p_user_id uuid, p_note text, p_report_id uuid default null)`
- L239: `create or replace function public.admin_remove_reported_content(p_report_id uuid, p_reason text)`
- L285: `create or replace function app_private.set_suspension(p_user uuid, p_until timestamp with time zone, p_reason text)`
- L307: `create or replace function public.admin_suspend_user(p_user_id uuid, p_days integer, p_reason text, p_report_id uuid default null)`
- L337: `create or replace function public.admin_unsuspend_user(p_user_id uuid, p_reason text)`
- L362: `create or replace function public.admin_record_ban(p_user_id uuid, p_banned boolean, p_reason text, p_report_id uuid default null)`
- L396: `create or replace function public.admin_decide_scan(p_scan_id uuid, p_decision text, p_reason text)`
- L431: `create or replace function public.admin_hide_listing(p_listing_id uuid, p_reason text)`
- L456: `create or replace function public.admin_unhide_listing(p_listing_id uuid, p_reason text)`
- L483: `create or replace function public.admin_create_takedown(`
- L510: `create or replace function public.admin_takedown_remove_listing(p_takedown_id uuid, p_listing_id uuid, p_reason text)`
- L544: `create or replace function public.admin_remove_photos(p_listing_id uuid, p_photo_ids uuid[], p_reason text, p_takedown_id uuid default null)`
- L574: `create or replace function public.admin_record_counter_notice(p_takedown_id uuid, p_notice text, p_received_at timestamp with time zone default null)`
- L601: `create or replace function public.admin_set_takedown_status(p_takedown_id uuid, p_status text, p_note text)`
- L631: `create or replace function public.set_flag(p_key text, p_enabled boolean)`
- L657: `create or replace function public.admin_metrics()`
- L685: `create or replace function public.admin_find_user(p_query text)`
- L727: `create or replace function public.admin_audit_log(p_limit integer default 50, p_offset integer default 0)`
- L751: `revoke execute on function app_private.close_report(uuid, text, text, uuid) from public, anon, authenticated;`
- L752: `revoke execute on function app_private.require_reason(text) from public, anon, authenticated;`
- L753: `revoke execute on function app_private.profile_state(uuid) from public, anon, authenticated;`
- L754: `revoke execute on function app_private.set_suspension(uuid, timestamp with time zone, text) from public, anon, authenticated;`

### `supabase/migrations/20261107120000_p2c_age_gate.sql` (222 lines)

- L8: `create table public.age_checks (`
- L21: `create index age_checks_user_idx on public.age_checks using btree (user_id, id desc);`
- L22: `alter table public.age_checks enable row level security;`
- L23: `revoke all on public.age_checks from public, anon, authenticated, service_role;`
- L24: `grant select on public.age_checks to authenticated;`
- L25: `create policy age_checks_owner_read on public.age_checks`
- L31: `create or replace function app_private.age_blocked(p_user uuid)`
- L48: `create or replace function public.record_age_check(p_source text, p_result text, p_platform text)`
- L111: `create or replace function app_private.refuse_minor_account()`
- L150: `create or replace function public.mark_activity_seen()`
- L170: `create or replace function public.admin_find_user(p_query text)`
- L217: `revoke execute on function app_private.age_blocked(uuid) from public, anon, authenticated;`
- L218: `revoke execute on function app_private.refuse_minor_account() from public, anon, authenticated;`
- L219: `revoke execute on function public.record_age_check(text, text, text) from public, anon;`
- L220: `grant execute on function public.record_age_check(text, text, text) to authenticated;`
- L221: `revoke execute on function public.mark_activity_seen() from public, anon;`
- L222: `grant execute on function public.mark_activity_seen() to authenticated;`

### `supabase/migrations/20261107121000_p2c_preview_label.sql` (5 lines)

- (no top-level declarations)

### `supabase/migrations/20261107130000_p3a_data_export.sql` (243 lines)

- L14: `create table public.data_exports (`
- L21: `create index data_exports_user_idx on public.data_exports using btree (user_id, exported_at desc);`
- L22: `alter table public.data_exports enable row level security;`
- L23: `revoke all on public.data_exports from public, anon, authenticated, service_role;`
- L24: `grant select on public.data_exports to authenticated;`
- L25: `create policy data_exports_owner_read on public.data_exports`
- L29: `create or replace function app_private.export_person(p_user uuid)`
- L43: `create or replace function public.export_my_data()`
- L228: `create or replace function public.age_blocked()`
- L239: `revoke execute on function app_private.export_person(uuid) from public, anon, authenticated;`
- L240: `revoke execute on function public.export_my_data() from public, anon;`
- L241: `grant execute on function public.export_my_data() to authenticated;`
- L242: `revoke execute on function public.age_blocked() from public, anon;`
- L243: `grant execute on function public.age_blocked() to authenticated;`

### `supabase/migrations/20261107140000_p3b_cleanup_jobs.sql` (496 lines)

- L15: `create extension if not exists pg_cron with schema pg_catalog;`
- L40: `create or replace function app_private.setting_number(p_key text)`
- L52: `alter table public.listings`
- L58: `alter table public.listings alter column updated_at set default pg_catalog.now();`
- L59: `alter table public.listings alter column updated_at set not null;`
- L61: `create or replace function app_private.listing_track_changes()`
- L76: `create trigger listings_track_changes before insert or update on public.listings`
- L80: `create or replace function app_private.listing_touch()`
- L94: `create trigger listing_photos_touch after insert or update on public.listing_photos`
- L96: `create trigger listing_measurements_touch after insert or update on public.listing_measurements`
- L98: `create trigger availability_touch after insert or update on public.availability`
- L102: `create table app_private.job_runs (`
- L116: `create index job_runs_job_idx on app_private.job_runs using btree (job, id desc);`
- L117: `alter table app_private.job_runs enable row level security;`
- L118: `revoke all on app_private.job_runs from public, anon, authenticated, service_role;`
- L120: `create or replace function app_private.record_job_run(`
- L144: `create or replace function app_private.cleanup_deletes(p_job text)`
- L155: `create or replace function app_private.cleanup_old_photo_checks(p_delete boolean)`
- L180: `create or replace function app_private.cleanup_expired_reports(p_delete boolean)`
- L202: `create or replace function app_private.cleanup_old_data_exports(p_delete boolean)`
- L223: `create or replace function app_private.cleanup_old_age_checks(p_delete boolean)`
- L249: `create or replace function app_private.cleanup_old_suggestion_choices(p_delete boolean)`
- L269: `create or replace function app_private.cleanup_old_declarations(p_delete boolean)`
- L291: `create or replace function app_private.cleanup_stale_device_tokens(p_delete boolean)`
- L312: `create or replace function app_private.run_cleanup_jobs()`
- L346: `create or replace function public.cleanup_file_plan()`
- L379: `create or replace function public.cleanup_record_run(`
- L395: `create or replace function app_private.request_file_cleanup()`
- L445: `create or replace function public.admin_cleanup_status()`
- L475: `revoke execute on function app_private.setting_number(text) from public, anon, authenticated;`
- L476: `revoke execute on function app_private.listing_track_changes() from public, anon, authenticated;`
- L477: `revoke execute on function app_private.listing_touch() from public, anon, authenticated;`
- L478: `revoke execute on function app_private.record_job_run(text, text, jsonb, text, timestamp with time zone) from public, anon, authenticated;`
- L479: `revoke execute on function app_private.cleanup_deletes(text) from public, anon, authenticated;`
- L480: `revoke execute on function app_private.cleanup_old_photo_checks(boolean) from public, anon, authenticated;`
- L481: `revoke execute on function app_private.cleanup_expired_reports(boolean) from public, anon, authenticated;`
- L482: `revoke execute on function app_private.cleanup_old_data_exports(boolean) from public, anon, authenticated;`
- L483: `revoke execute on function app_private.cleanup_old_age_checks(boolean) from public, anon, authenticated;`
- L484: `revoke execute on function app_private.cleanup_old_suggestion_choices(boolean) from public, anon, authenticated;`
- L485: `revoke execute on function app_private.cleanup_old_declarations(boolean) from public, anon, authenticated;`
- L486: `revoke execute on function app_private.cleanup_stale_device_tokens(boolean) from public, anon, authenticated;`
- L487: `revoke execute on function app_private.run_cleanup_jobs() from public, anon, authenticated;`
- L488: `revoke execute on function app_private.request_file_cleanup() from public, anon, authenticated;`
- L489: `revoke execute on function public.cleanup_file_plan() from public, anon, authenticated;`
- L490: `grant execute on function public.cleanup_file_plan() to service_role;`
- L491: `revoke execute on function public.cleanup_record_run(text, text, jsonb, text, timestamp with time zone) from public, anon, authenticated;`
- L492: `grant execute on function public.cleanup_record_run(text, text, jsonb, text, timestamp with time zone) to service_role;`
- L493: `revoke execute on function public.admin_cleanup_status() from public, anon;`
- L494: `grant execute on function public.admin_cleanup_status() to authenticated;`

### `supabase/migrations/20261110230000_p5a_security_hardening.sql` (369 lines)

- L15: `create or replace function app_private.require_current_terms(p_user uuid)`
- L39: `create table app_private.rate_counters (`
- L50: `alter table app_private.rate_counters enable row level security;`
- L51: `revoke all on app_private.rate_counters from public, anon, authenticated, service_role;`
- L69: `create or replace function app_private.rate_limit_take(p_user uuid, p_action text)`
- L106: `create or replace function app_private.enforce_rate_limit(p_user uuid, p_action text)`
- L122: `create or replace function app_private.terms_and_limits()`
- L177: `create trigger terms_and_limits before insert on public.messages`
- L179: `create trigger terms_and_limits before insert on public.conversations`
- L181: `create trigger terms_and_limits before insert on public.reports`
- L183: `create trigger terms_and_limits before insert on public.saved_listings`
- L185: `create trigger terms_and_limits before insert on public.saved_studios`
- L187: `create trigger terms_and_limits before insert or update of status on public.listings`
- L192: `create or replace function app_private.queue_scan(p_listing_id uuid, p_lender uuid)`
- L256: `create or replace function public.request_scan(p_listing_id uuid)`
- L284: `drop trigger if exists messages_filter_text on public.messages;`
- L285: `drop function if exists app_private.filter_message_text();`
- L288: `create or replace function public.check_text(p_text text, p_where text)`
- L316: `drop policy if exists listing_photos_storage_owner_insert on storage.objects;`
- L317: `create policy listing_photos_storage_owner_insert on storage.objects`
- L328: `drop policy if exists listing_photos_storage_owner_update on storage.objects;`
- L329: `create policy listing_photos_storage_owner_update on storage.objects`
- L347: `create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);`
- L348: `create index if not exists legal_acceptances_document_idx on public.legal_acceptances (document);`
- L349: `create index if not exists listings_lender_id_idx on public.listings (lender_id);`
- L350: `create index if not exists messages_sender_id_idx on public.messages (sender_id);`
- L351: `create index if not exists rental_outcomes_user_id_idx on public.rental_outcomes (user_id);`
- L352: `create index if not exists rentals_listing_id_idx on public.rentals (listing_id);`
- L353: `create index if not exists rentals_updated_by_idx on public.rentals (updated_by);`
- L354: `create index if not exists reports_reporter_id_idx on public.reports (reporter_id);`
- L355: `create index if not exists suggestion_events_listing_id_idx on public.suggestion_events (listing_id);`
- L356: `create index if not exists suggestion_events_user_id_idx on public.suggestion_events (user_id);`
- L357: `create index if not exists user_warnings_report_id_idx on public.user_warnings (report_id);`
- L360: `revoke execute on function app_private.require_current_terms(uuid) from public, anon, authenticated;`
- L361: `revoke execute on function app_private.rate_limit_take(uuid, text) from public, anon, authenticated;`
- L362: `revoke execute on function app_private.enforce_rate_limit(uuid, text) from public, anon, authenticated;`
- L363: `revoke execute on function app_private.terms_and_limits() from public, anon, authenticated;`
- L364: `revoke execute on function public.request_scan(uuid) from public, anon;`
- L365: `grant execute on function public.request_scan(uuid) to authenticated;`
- L366: `revoke execute on function public.check_text(text, text) from public;`
- L367: `grant execute on function public.check_text(text, text) to anon, authenticated, service_role;`

### `supabase/migrations/20261110231000_p5a_admin_code_24h.sql` (59 lines)

- L8: `create or replace function app_private.admin_code_fresh()`
- L24: `create or replace function public.is_admin()`
- L36: `create or replace function app_private.require_admin()`
- L59: `revoke execute on function app_private.admin_code_fresh() from public, anon, authenticated;`

### `supabase/migrations/20261111100000_c1_error_codes.sql` (2530 lines)

- L10: `CREATE OR REPLACE FUNCTION app_private.admin_actions_append_only()`
- L21: `CREATE OR REPLACE FUNCTION app_private.close_report(p_report uuid, p_outcome text, p_note text, p_admin uuid)`
- L48: `CREATE OR REPLACE FUNCTION app_private.enforce_rate_limit(p_user uuid, p_action text)`
- L62: `CREATE OR REPLACE FUNCTION app_private.is_blocked(a uuid, b uuid)`
- L83: `CREATE OR REPLACE FUNCTION app_private.listing_hold_guard()`
- L119: `CREATE OR REPLACE FUNCTION app_private.lock_photo_listing()`
- L155: `CREATE OR REPLACE FUNCTION app_private.queue_scan(p_listing_id uuid, p_lender uuid)`
- L220: `CREATE OR REPLACE FUNCTION app_private.refuse_minor_account()`
- L239: `CREATE OR REPLACE FUNCTION app_private.report_evidence_frozen()`
- L250: `CREATE OR REPLACE FUNCTION app_private.report_target_user(p_reporter uuid, p_type text, p_target uuid)`
- L280: `CREATE OR REPLACE FUNCTION app_private.require_admin()`
- L303: `CREATE OR REPLACE FUNCTION app_private.require_current_terms(p_user uuid)`
- L324: `CREATE OR REPLACE FUNCTION app_private.require_empty_listing_folder()`
- L355: `CREATE OR REPLACE FUNCTION app_private.require_measurements_consent()`
- L395: `CREATE OR REPLACE FUNCTION app_private.require_reason(p_reason text)`
- L410: `CREATE OR REPLACE FUNCTION app_private.validate_conversation()`
- L443: `CREATE OR REPLACE FUNCTION app_private.vision_publish_gate()`
- L486: `CREATE OR REPLACE FUNCTION public.accept_legal(p_platform text)`
- L509: `CREATE OR REPLACE FUNCTION public.admin_create_takedown(p_claimant_name text, p_claimant_contact text, p_work text, p_urls text[] DEFAULT '{}'::text[], p_listing_ids uuid`
- L534: `CREATE OR REPLACE FUNCTION public.admin_decide_scan(p_scan_id uuid, p_decision text, p_reason text)`
- L568: `CREATE OR REPLACE FUNCTION public.admin_dismiss_report(p_report_id uuid, p_reason text)`
- L590: `CREATE OR REPLACE FUNCTION public.admin_find_user(p_query text)`
- L637: `CREATE OR REPLACE FUNCTION public.admin_hide_listing(p_listing_id uuid, p_reason text)`
- L663: `CREATE OR REPLACE FUNCTION public.admin_record_ban(p_user_id uuid, p_banned boolean, p_reason text, p_report_id uuid DEFAULT NULL::uuid)`
- L696: `CREATE OR REPLACE FUNCTION public.admin_record_counter_notice(p_takedown_id uuid, p_notice text, p_received_at timestamp with time zone DEFAULT NULL::timestamp with time `
- L724: `CREATE OR REPLACE FUNCTION public.admin_remove_photos(p_listing_id uuid, p_photo_ids uuid[], p_reason text, p_takedown_id uuid DEFAULT NULL::uuid)`
- L755: `CREATE OR REPLACE FUNCTION public.admin_remove_reported_content(p_report_id uuid, p_reason text)`
- L800: `CREATE OR REPLACE FUNCTION public.admin_set_takedown_status(p_takedown_id uuid, p_status text, p_note text)`
- L829: `CREATE OR REPLACE FUNCTION public.admin_suspend_user(p_user_id uuid, p_days integer, p_reason text, p_report_id uuid DEFAULT NULL::uuid)`
- L860: `CREATE OR REPLACE FUNCTION public.admin_takedown_remove_listing(p_takedown_id uuid, p_listing_id uuid, p_reason text)`
- L893: `CREATE OR REPLACE FUNCTION public.admin_unhide_listing(p_listing_id uuid, p_reason text)`
- L919: `CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_user_id uuid, p_reason text)`
- L943: `CREATE OR REPLACE FUNCTION public.admin_warn_user(p_user_id uuid, p_note text, p_report_id uuid DEFAULT NULL::uuid)`
- L969: `CREATE OR REPLACE FUNCTION public.block_user(p_handle text)`
- L999: `CREATE OR REPLACE FUNCTION public.check_text(p_text text, p_where text)`
- L1020: `CREATE OR REPLACE FUNCTION public.cleanup_record_run(p_job text, p_mode text, p_counts jsonb, p_error text, p_started_at timestamp with time zone)`
- L1035: `CREATE OR REPLACE FUNCTION public.export_my_data()`
- L1220: `CREATE OR REPLACE FUNCTION public.fit_listings(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_mile`
- L1391: `CREATE OR REPLACE FUNCTION public.get_studio(p_handle text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)`
- L1518: `CREATE OR REPLACE FUNCTION public.give_measurements_consent()`
- L1541: `CREATE OR REPLACE FUNCTION public.handle_new_user()`
- L1580: `CREATE OR REPLACE FUNCTION public.mark_activity_seen()`
- L1600: `CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)`
- L1618: `CREATE OR REPLACE FUNCTION public.my_block_peer_ids()`
- L1638: `CREATE OR REPLACE FUNCTION public.my_blocked_users()`
- L1665: `CREATE OR REPLACE FUNCTION public.my_conversations(p_conversation_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)`
- L1745: `CREATE OR REPLACE FUNCTION public.my_saved_listings(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_limit `
- L1836: `CREATE OR REPLACE FUNCTION public.my_saved_studios(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_limit i`
- L1895: `CREATE OR REPLACE FUNCTION public.needs_legal_acceptance()`
- L1918: `CREATE OR REPLACE FUNCTION public.record_accessory_declaration(p_full_legal_name text, p_declaration_version integer, p_app_version text DEFAULT NULL::text)`
- L1955: `CREATE OR REPLACE FUNCTION public.record_age_check(p_source text, p_result text, p_platform text)`
- L2013: `CREATE OR REPLACE FUNCTION public.record_listing_declaration(p_listing_id uuid, p_declaration_version integer)`
- L2045: `CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text)`
- L2075: `CREATE OR REPLACE FUNCTION public.report_user(p_handle text, p_reason text, p_details text DEFAULT NULL::text)`
- L2109: `CREATE OR REPLACE FUNCTION public.request_scan(p_listing_id uuid)`
- L2137: `CREATE OR REPLACE FUNCTION public.require_accessory_declaration()`
- L2159: `CREATE OR REPLACE FUNCTION public.save_studio(p_handle text)`
- L2197: `CREATE OR REPLACE FUNCTION public.set_conversation_dates(p_conversation_id uuid, p_start date, p_end date)`
- L2233: `CREATE OR REPLACE FUNCTION public.set_flag(p_key text, p_enabled boolean)`
- L2258: `CREATE OR REPLACE FUNCTION public.start_conversation(p_listing_id uuid, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)`
- L2309: `CREATE OR REPLACE FUNCTION public.unblock_user(p_handle text)`
- L2338: `CREATE OR REPLACE FUNCTION public.unsave_studio(p_handle text)`
- L2367: `CREATE OR REPLACE FUNCTION public.vision_finish_scan(p_scan_id uuid, p_photo_set_hash text, p_result jsonb)`
- L2456: `CREATE OR REPLACE FUNCTION public.withdraw_measurements_consent()`
- L2477: `CREATE OR REPLACE FUNCTION app_private.text_refusal(p_text text, p_where text)`
- L2515: `CREATE OR REPLACE FUNCTION app_private.suspension_message(p_user uuid)`

### `supabase/migrations/20261111101000_c1_price_per_day.sql` (277 lines)

- L7: `alter table public.listings`
- L10: `comment on column public.listings.price_usd is 'Price per day in USD (C1); the unit is price_unit.';`
- L11: `comment on column public.listings.price_unit is 'What price_usd is for: per_day (the only unit for now).';`
- L14: `create function app_private.rental_days(p_start date, p_end date)`
- L23: `revoke execute on function app_private.rental_days(date, date) from public, anon, authenticated;`
- L25: `drop function public.browse_listings(double precision, double precision, double precision, text, text, text, text,`
- L28: `create function public.browse_listings(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_miles double`
- L185: `grant execute on function public.browse_listings(double precision, double precision, double precision, text, text, text, text,`
- L188: `drop function public.get_listing(uuid, double precision, double precision);`
- L190: `create function public.get_listing(p_listing_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_star`
- L277: `grant execute on function public.get_listing(uuid, double precision, double precision, date, date) to anon, authenticated, service_role;`

### `supabase/migrations/20261111102000_c1_async_jobs.sql` (466 lines)

- L11: `create table app_private.async_jobs (`
- L26: `comment on table app_private.async_jobs is`
- L28: `create index async_jobs_due_idx on app_private.async_jobs using btree (next_attempt_at) where status = 'pending';`
- L29: `create index async_jobs_running_idx on app_private.async_jobs using btree (id) where status = 'running';`
- L30: `create index async_jobs_status_idx on app_private.async_jobs using btree (status, finished_at);`
- L31: `alter table app_private.async_jobs enable row level security;`
- L32: `revoke all on app_private.async_jobs from public, anon, authenticated, service_role;`
- L35: `create function app_private.job_backoff(p_attempts integer)`
- L44: `create function app_private.job_max_attempts()`
- L52: `create function app_private.job_failed(p_id bigint, p_error text)`
- L85: `create function app_private.dispatch_job(p_id bigint)`
- L145: `create function app_private.enqueue_job(p_kind text, p_payload jsonb)`
- L161: `create function app_private.run_async_jobs()`
- L221: `create or replace function app_private.queue_push(p_kind text, p_conversation_id uuid, p_sender uuid, p_recipient uuid, p_text text DEFAULT NULL::text)`
- L299: `create or replace function app_private.queue_scan(p_listing_id uuid, p_lender uuid)`
- L353: `create function public.admin_jobs_status()`
- L387: `create function public.admin_list_dead_jobs(p_limit integer default 30, p_offset integer default 0)`
- L421: `create function public.admin_retry_job(p_job_id bigint, p_reason text default null)`
- L453: `revoke execute on function app_private.job_backoff(integer) from public, anon, authenticated;`
- L454: `revoke execute on function app_private.job_max_attempts() from public, anon, authenticated;`
- L455: `revoke execute on function app_private.job_failed(bigint, text) from public, anon, authenticated;`
- L456: `revoke execute on function app_private.dispatch_job(bigint) from public, anon, authenticated;`
- L457: `revoke execute on function app_private.enqueue_job(text, jsonb) from public, anon, authenticated;`
- L458: `revoke execute on function app_private.run_async_jobs() from public, anon, authenticated;`
- L459: `revoke execute on function public.admin_jobs_status() from public, anon;`
- L460: `revoke execute on function public.admin_list_dead_jobs(integer, integer) from public, anon;`
- L461: `revoke execute on function public.admin_retry_job(bigint, text) from public, anon;`
- L462: `grant execute on function public.admin_jobs_status() to authenticated;`
- L463: `grant execute on function public.admin_list_dead_jobs(integer, integer) to authenticated;`
- L464: `grant execute on function public.admin_retry_job(bigint, text) to authenticated;`

### `supabase/migrations/20261113100000_c3_rental_lifecycle.sql` (1807 lines)

- L16: `create extension if not exists btree_gist with schema extensions;`
- L19: `alter table public.rentals drop constraint rentals_status_check;`
- L22: `alter table public.rentals alter column status set default 'requested';`
- L23: `alter table public.rentals add constraint rentals_status_check check (status = any (array[`
- L27: `alter table public.rentals`
- L38: `alter table public.rentals add constraint rentals_currency_check check (currency = 'USD');`
- L39: `alter table public.rentals add constraint rentals_snapshot_check`
- L45: `comment on column public.rentals.status is 'C3 state machine (pranalika/architecture.md Appendix A.3); written only by the rental functions.';`
- L46: `comment on column public.rentals.price_per_day is 'Snapshot of listings.price_usd when the rental was requested (C3).';`
- L47: `comment on column public.rentals.days is 'Days in the rental, both ends counted (app_private.rental_days), at request time.';`
- L48: `comment on column public.rentals.total is 'price_per_day x days at request time, in currency.';`
- L49: `comment on column public.rentals.expires_at is 'A request with no answer by then becomes expired (48 hours, C3).';`
- L52: `alter table public.rentals drop constraint rentals_conversation_id_key;`
- L53: `create index if not exists rentals_conversation_id_idx on public.rentals (conversation_id);`
- L54: `create unique index rentals_one_open_per_chat on public.rentals (conversation_id)`
- L56: `create index rentals_requested_expiry_idx on public.rentals (expires_at) where status = 'requested';`
- L61: `alter table public.rentals add constraint rentals_no_double_booking`
- L66: `drop policy if exists rentals_participant_insert on public.rentals;`
- L67: `drop policy if exists rentals_participant_update on public.rentals;`
- L68: `revoke insert, update, delete on public.rentals from anon, authenticated;`
- L69: `revoke update (status, start_date, end_date, updated_by) on public.rentals from authenticated;`
- L73: `create table public.rental_events (`
- L83: `create index rental_events_rental_idx on public.rental_events (rental_id, id);`
- L84: `create index rental_events_actor_idx on public.rental_events (actor_id);`
- L85: `alter table public.rental_events enable row level security;`
- L86: `revoke all on public.rental_events from anon, authenticated;`
- L87: `grant select on public.rental_events to authenticated;`
- L88: `create policy rental_events_participant_read on public.rental_events`
- L92: `comment on table public.rental_events is 'C3: one row per rental state change (from, to, who, when, note). Written only by the rental functions.';`
- L100: `alter table app_private.rate_counters drop constraint rate_counters_action_check;`
- L101: `alter table app_private.rate_counters add constraint rate_counters_action_check`
- L122: `alter table public.notification_settings add column rental_reminders boolean not null default true;`
- L123: `grant select (rental_reminders), insert (rental_reminders), update (rental_reminders) on public.notification_settings to authenticated;`
- L124: `comment on column public.notification_settings.rental_reminders is 'Pickup, return and overdue reminders (C3). Default on.';`
- L127: `create function app_private.rental_today()`
- L137: `create function app_private.payments_enabled()`
- L149: `create function app_private.rental_guard(p_uid uuid, p_other uuid, p_check_block boolean)`
- L181: `create function app_private.rental_for_actor(p_rental uuid, p_uid uuid)`
- L201: `create function app_private.rental_note(p_note text)`
- L218: `create function app_private.rental_move(p_rental public.rentals, p_to text, p_actor uuid, p_note text)`
- L246: `create function app_private.rental_photo_count(p_rental uuid, p_stage text, p_owner uuid)`
- L263: `create function app_private.queue_rental_push(p_kind text, p_rental public.rentals, p_recipient uuid, p_sender uuid default null)`
- L354: `create function public.request_rental(p_listing_id uuid, p_start date default null, p_end date default null)`
- L443: `create function public.respond_rental(p_rental_id uuid, p_answer text, p_note text default null)`
- L489: `create function public.cancel_rental(p_rental_id uuid, p_reason text default null)`
- L515: `create function public.mark_picked_up(p_rental_id uuid, p_note text default null)`
- L543: `create function public.mark_returned(p_rental_id uuid, p_note text default null)`
- L575: `create function public.complete_rental(p_rental_id uuid)`
- L614: `create function app_private.rental_json(p_rental public.rentals, p_uid uuid, p_full boolean)`
- L661: `create function public.get_rental(p_rental_id uuid default null, p_conversation_id uuid default null)`
- L689: `create function public.my_rentals(p_limit integer default 30, p_offset integer default 0)`
- L722: `create function app_private.expire_rental_requests()`
- L745: `create table app_private.rental_reminders (`
- L754: `revoke all on app_private.rental_reminders from public, anon, authenticated;`
- L758: `create function app_private.queue_rental_reminders()`
- L813: `create policy rental_photos_read on storage.objects`
- L824: `create policy rental_photos_insert on storage.objects`
- L836: `create or replace function public.get_studio(p_handle text, p_lat double precision default null, p_lng double precision default null)`
- L964: `create or replace function public.browse_listings(p_lat double precision default null, p_lng double precision default null, p_radius_miles double precision default null, `
- L1132: `drop function public.get_listing(uuid, double precision, double precision, date, date);`
- L1133: `create function public.get_listing(p_listing_id uuid, p_lat double precision default null, p_lng double precision default null, p_start_date date default null, p_end_date`
- L1228: `grant execute on function public.get_listing(uuid, double precision, double precision, date, date) to anon, authenticated, service_role;`
- L1231: `alter table public.reports drop constraint reports_target_type_check;`
- L1232: `alter table public.reports add constraint reports_target_type_check`
- L1235: `create or replace function app_private.report_target_user(p_reporter uuid, p_type text, p_target uuid)`
- L1272: `create or replace function app_private.report_snapshot(p_type text, p_target uuid)`
- L1365: `create or replace function public.admin_remove_reported_content(p_report_id uuid, p_reason text)`
- L1413: `create function public.admin_user_rentals(p_user_id uuid, p_limit integer default 20)`
- L1435: `create or replace function public.export_my_data()`
- L1642: `create function public.account_has_rental_in_progress(p_user uuid)`
- L1654: `revoke execute on function public.account_has_rental_in_progress(uuid) from public, anon, authenticated;`
- L1655: `grant execute on function public.account_has_rental_in_progress(uuid) to service_role;`
- L1658: `alter table app_private.job_runs drop constraint job_runs_job_check;`
- L1659: `alter table app_private.job_runs add constraint job_runs_job_check check (job = any (array[`
- L1663: `create or replace function public.cleanup_file_plan()`
- L1708: `create or replace function public.cleanup_record_run(p_job text, p_mode text, p_counts jsonb, p_error text, p_started_at timestamp with time zone)`
- L1722: `create or replace function app_private.request_file_cleanup()`
- L1748: `create or replace function public.admin_cleanup_status()`
- L1778: `revoke execute on function app_private.rental_today() from public, anon, authenticated;`
- L1779: `revoke execute on function app_private.payments_enabled() from public, anon, authenticated;`
- L1780: `revoke execute on function app_private.rental_guard(uuid, uuid, boolean) from public, anon, authenticated;`
- L1781: `revoke execute on function app_private.rental_for_actor(uuid, uuid) from public, anon, authenticated;`
- L1782: `revoke execute on function app_private.rental_note(text) from public, anon, authenticated;`
- L1783: `revoke execute on function app_private.rental_move(public.rentals, text, uuid, text) from public, anon, authenticated;`
- L1784: `revoke execute on function app_private.rental_photo_count(uuid, text, uuid) from public, anon, authenticated;`
- L1785: `revoke execute on function app_private.queue_rental_push(text, public.rentals, uuid, uuid) from public, anon, authenticated;`
- L1786: `revoke execute on function app_private.rental_json(public.rentals, uuid, boolean) from public, anon, authenticated;`
- L1787: `revoke execute on function app_private.expire_rental_requests() from public, anon, authenticated;`
- L1788: `revoke execute on function app_private.queue_rental_reminders() from public, anon, authenticated;`
- L1790: `revoke execute on function public.request_rental(uuid, date, date) from public, anon;`
- L1791: `revoke execute on function public.respond_rental(uuid, text, text) from public, anon;`
- L1792: `revoke execute on function public.cancel_rental(uuid, text) from public, anon;`
- L1793: `revoke execute on function public.mark_picked_up(uuid, text) from public, anon;`
- L1794: `revoke execute on function public.mark_returned(uuid, text) from public, anon;`
- L1795: `revoke execute on function public.complete_rental(uuid) from public, anon;`
- L1796: `revoke execute on function public.get_rental(uuid, uuid) from public, anon;`
- L1797: `revoke execute on function public.my_rentals(integer, integer) from public, anon;`
- L1798: `revoke execute on function public.admin_user_rentals(uuid, integer) from public, anon;`
- L1799: `grant execute on function public.request_rental(uuid, date, date) to authenticated;`
- L1800: `grant execute on function public.respond_rental(uuid, text, text) to authenticated;`
- L1801: `grant execute on function public.cancel_rental(uuid, text) to authenticated;`
- L1802: `grant execute on function public.mark_picked_up(uuid, text) to authenticated;`
- L1803: `grant execute on function public.mark_returned(uuid, text) to authenticated;`
- L1804: `grant execute on function public.complete_rental(uuid) to authenticated, service_role;`
- L1805: `grant execute on function public.get_rental(uuid, uuid) to authenticated;`
- L1806: `grant execute on function public.my_rentals(integer, integer) to authenticated;`
- L1807: `grant execute on function public.admin_user_rentals(uuid, integer) to authenticated;`

### `supabase/migrations/20261113200000_c4_settings.sql` (478 lines)

- L21: `alter table app_private.settings`
- L32: `comment on column app_private.settings.note is 'Plain description of the setting (shown on the admin Settings page).';`
- L33: `comment on column app_private.settings.decided_by is 'Who decides the value: owner, business_owner or attorney.';`
- L34: `comment on column app_private.settings.affects_terms is 'True when the legal pages state this value: changing it may need a legal page update.';`
- L114: `alter table app_private.settings`
- L125: `create function app_private.setting_value_problem(p_type text, p_value jsonb, p_min numeric, p_max numeric,`
- L184: `create function app_private.settings_check()`
- L202: `create trigger settings_check before insert or update on app_private.settings`
- L206: `create function app_private.setting_required(p_key text)`
- L224: `create function app_private.setting_int(p_key text)`
- L232: `create function app_private.setting_num(p_key text)`
- L240: `create function app_private.setting_bool(p_key text)`
- L248: `create function app_private.setting_text(p_key text)`
- L257: `create or replace function app_private.rental_today()`
- L270: `create function app_private.schedule_rental_reminders()`
- L295: `create or replace function app_private.queue_rental_reminders()`
- L342: `create or replace function public.cleanup_file_plan()`
- L387: `create function public.admin_list_settings()`
- L413: `create function public.admin_set_setting(p_key text, p_value jsonb, p_reason text)`
- L461: `revoke execute on function app_private.setting_value_problem(text, jsonb, numeric, numeric, text[], text) from public, anon, authenticated;`
- L462: `revoke execute on function app_private.settings_check() from public, anon, authenticated;`
- L463: `revoke execute on function app_private.setting_required(text) from public, anon, authenticated;`
- L464: `revoke execute on function app_private.setting_int(text) from public, anon, authenticated;`
- L465: `revoke execute on function app_private.setting_num(text) from public, anon, authenticated;`
- L466: `revoke execute on function app_private.setting_bool(text) from public, anon, authenticated;`
- L467: `revoke execute on function app_private.setting_text(text) from public, anon, authenticated;`
- L468: `revoke execute on function app_private.schedule_rental_reminders() from public, anon, authenticated;`
- L469: `revoke execute on function app_private.rental_today() from public, anon, authenticated;`
- L470: `revoke execute on function app_private.queue_rental_reminders() from public, anon, authenticated;`
- L471: `revoke execute on function public.admin_list_settings() from public, anon;`
- L472: `revoke execute on function public.admin_set_setting(text, jsonb, text) from public, anon;`
- L473: `grant execute on function public.admin_list_settings() to authenticated;`
- L474: `grant execute on function public.admin_set_setting(text, jsonb, text) to authenticated;`

### `supabase/migrations/20261113210000_c4_payments.sql` (2173 lines)

- L26: `alter table public.listings`
- L29: `comment on column public.listings.deposit_amount is 'Refundable deposit in USD held on the renter''s card at pickup (C4); null = no deposit. deposit_note stays as free te`
- L30: `grant update (deposit_amount) on public.listings to authenticated;`
- L35: `create table public.stripe_customers (`
- L40: `alter table public.stripe_customers enable row level security;`
- L41: `revoke all on public.stripe_customers from anon, authenticated;`
- L42: `grant select (user_id, created_at) on public.stripe_customers to authenticated;`
- L43: `create policy stripe_customers_owner_read on public.stripe_customers`
- L45: `comment on table public.stripe_customers is 'C4: the renter''s Stripe customer id (server-written). Card details stay at Stripe.';`
- L48: `create table public.payout_accounts (`
- L57: `alter table public.payout_accounts enable row level security;`
- L58: `revoke all on public.payout_accounts from anon, authenticated;`
- L59: `grant select on public.payout_accounts to authenticated;`
- L60: `create policy payout_accounts_owner_read on public.payout_accounts`
- L62: `comment on table public.payout_accounts is 'C4: the lender''s Stripe Express account (server-written). Bank details stay at Stripe.';`
- L65: `alter table public.rentals`
- L82: `create unique index rentals_payment_intent_idx on public.rentals (payment_intent_id) where payment_intent_id is not null;`
- L83: `create unique index rentals_deposit_intent_idx on public.rentals (deposit_intent_id) where deposit_intent_id is not null;`
- L84: `create index rentals_claim_window_idx on public.rentals (claim_window_ends_at) where status = 'returned';`
- L85: `comment on column public.rentals.deposit_amount is 'Snapshot of listings.deposit_amount at request time (C4).';`
- L86: `comment on column public.rentals.payment_status is 'The rental payment at Stripe (C4): none, pending, paid, failed, canceled, partially_refunded, refunded.';`
- L87: `comment on column public.rentals.deposit_status is 'The deposit hold at Stripe (C4): none, pending, held, released, captured, failed.';`
- L88: `comment on column public.rentals.deposit_capture_before is 'When Stripe''s authorization ends (capture_before); the nightly job renews the hold before then.';`
- L92: `create table app_private.rental_payment_methods (`
- L97: `alter table app_private.rental_payment_methods enable row level security;`
- L98: `revoke all on app_private.rental_payment_methods from public, anon, authenticated, service_role;`
- L101: `create table public.rental_claims (`
- L119: `create index rental_claims_status_idx on public.rental_claims (status) where status in ('open', 'disputed');`
- L120: `create index rental_claims_lender_idx on public.rental_claims (lender_id);`
- L121: `create index rental_claims_renter_idx on public.rental_claims (renter_id);`
- L122: `alter table public.rental_claims enable row level security;`
- L123: `revoke all on public.rental_claims from anon, authenticated;`
- L124: `grant select on public.rental_claims to authenticated;`
- L125: `create policy rental_claims_participant_read on public.rental_claims`
- L127: `comment on table public.rental_claims is 'C4: a lender''s damage claim against the deposit (file_claim, respond_claim, admin_decide_claim). Written only by those function`
- L130: `create table app_private.payment_events (`
- L139: `alter table app_private.payment_events enable row level security;`
- L140: `revoke all on app_private.payment_events from public, anon, authenticated, service_role;`
- L141: `comment on table app_private.payment_events is 'C4: every Stripe webhook event once (id unique): type, a hash of the payload (not the payload), when it was received and p`
- L143: `create table app_private.card_disputes (`
- L154: `alter table app_private.card_disputes enable row level security;`
- L155: `revoke all on app_private.card_disputes from public, anon, authenticated, service_role;`
- L157: `create table app_private.payment_operations (`
- L174: `create index payment_operations_rental_idx on app_private.payment_operations (rental_id);`
- L175: `create index payment_operations_open_idx on app_private.payment_operations (status) where status in ('queued', 'running', 'failed');`
- L176: `alter table app_private.payment_operations enable row level security;`
- L177: `revoke all on app_private.payment_operations from public, anon, authenticated, service_role;`
- L178: `comment on table app_private.payment_operations is 'C4: each server-side money step (refund, cancel an unpaid payment, place / release / capture / renew a deposit hold) w`
- L181: `alter table app_private.async_jobs drop constraint async_jobs_kind_check;`
- L182: `alter table app_private.async_jobs add constraint async_jobs_kind_check`
- L185: `create or replace function app_private.dispatch_job(p_id bigint)`
- L258: `create or replace function app_private.job_failed(p_id bigint, p_error text)`
- L296: `create or replace function public.admin_jobs_status()`
- L329: `create or replace function public.admin_list_dead_jobs(p_limit integer default 30, p_offset integer default 0)`
- L383: `create function app_private.money_label(p_amount numeric)`
- L392: `create function app_private.refundable_amount(p_rental public.rentals)`
- L409: `create function app_private.cancellation_refund(p_rental public.rentals, p_by_lender boolean)`
- L438: `create function app_private.sales_tax_amount(p_rental public.rentals)`
- L448: `create function app_private.enqueue_payment_operation(p_rental uuid, p_kind text, p_amount numeric,`
- L468: `create function app_private.release_deposit(p_rental public.rentals, p_reason text)`
- L487: `create function app_private.after_cancel_payments(p_rental public.rentals, p_by_lender boolean, p_reason text)`
- L509: `drop function app_private.queue_rental_push(text, public.rentals, uuid, uuid);`
- L510: `create function app_private.queue_rental_push(p_kind text, p_rental public.rentals, p_recipient uuid,`
- L617: `create or replace function public.request_rental(p_listing_id uuid, p_start date default null, p_end date default null)`
- L707: `create or replace function public.cancel_rental(p_rental_id uuid, p_reason text default null)`
- L738: `create or replace function public.mark_picked_up(p_rental_id uuid, p_note text default null)`
- L769: `create or replace function public.mark_returned(p_rental_id uuid, p_note text default null)`
- L808: `create or replace function public.complete_rental(p_rental_id uuid)`
- L846: `create function public.file_claim(p_rental_id uuid, p_amount numeric, p_reason text, p_photo_paths text[])`
- L901: `create function public.respond_claim(p_claim_id uuid, p_answer text, p_note text default null)`
- L954: `create function app_private.close_claim_windows()`
- L981: `create or replace function app_private.expire_rental_requests()`
- L1025: `create function app_private.check_deposit_holds()`
- L1062: `create or replace function app_private.rental_json(p_rental public.rentals, p_uid uuid, p_full boolean)`
- L1121: `create function public.admin_end_rental(p_rental_id uuid, p_outcome text, p_reason text,`
- L1209: `create function public.admin_refund_rental(p_rental_id uuid, p_amount numeric, p_reason text)`
- L1243: `create function public.admin_decide_claim(p_claim_id uuid, p_amount numeric, p_reason text)`
- L1292: `create function app_private.admin_person(p_user uuid)`
- L1306: `create function public.admin_payments_overview()`
- L1362: `create function public.payments_available()`
- L1370: `create function app_private.require_payments()`
- L1385: `create function public.payment_onboard_prepare(p_user uuid)`
- L1403: `create function public.payment_save_account(p_user uuid, p_account text)`
- L1417: `create function public.payment_update_account(p_account text, p_charges boolean, p_payouts boolean, p_details boolean)`
- L1439: `create function public.payment_account_for(p_user uuid)`
- L1452: `create function public.payment_save_customer(p_user uuid, p_customer text)`
- L1467: `create function public.payment_pay_prepare(p_user uuid, p_rental uuid)`
- L1504: `create function public.payment_save_intent(p_rental uuid, p_intent text, p_fee numeric, p_tax numeric)`
- L1523: `create function public.payment_deposit_prepare(p_user uuid, p_rental uuid)`
- L1580: `create function public.payment_deposit_result(p_operation uuid, p_intent text, p_status text,`
- L1617: `create function public.payment_operation_start(p_operation uuid)`
- L1650: `create function public.payment_operation_finish(p_operation uuid, p_ok boolean, p_stripe_id text,`
- L1718: `create function public.payment_handle_event(p_event_id text, p_type text, p_payload_hash text, p_object jsonb,`
- L1852: `create function public.admin_record_integrations_check(p_status jsonb)`
- L1870: `revoke execute on function public.admin_record_integrations_check(jsonb) from public, anon;`
- L1871: `grant execute on function public.admin_record_integrations_check(jsonb) to authenticated;`
- L1872: `revoke execute on function app_private.money_label(numeric) from public, anon, authenticated;`
- L1873: `revoke execute on function app_private.refundable_amount(public.rentals) from public, anon, authenticated;`
- L1874: `revoke execute on function app_private.cancellation_refund(public.rentals, boolean) from public, anon, authenticated;`
- L1875: `revoke execute on function app_private.sales_tax_amount(public.rentals) from public, anon, authenticated;`
- L1876: `revoke execute on function app_private.enqueue_payment_operation(uuid, text, numeric, uuid, text, uuid) from public, anon, authenticated;`
- L1877: `revoke execute on function app_private.release_deposit(public.rentals, text) from public, anon, authenticated;`
- L1878: `revoke execute on function app_private.after_cancel_payments(public.rentals, boolean, text) from public, anon, authenticated;`
- L1879: `revoke execute on function app_private.queue_rental_push(text, public.rentals, uuid, uuid, text) from public, anon, authenticated;`
- L1880: `revoke execute on function app_private.close_claim_windows() from public, anon, authenticated;`
- L1881: `revoke execute on function app_private.expire_rental_requests() from public, anon, authenticated;`
- L1882: `revoke execute on function app_private.check_deposit_holds() from public, anon, authenticated;`
- L1883: `revoke execute on function app_private.rental_json(public.rentals, uuid, boolean) from public, anon, authenticated;`
- L1884: `revoke execute on function app_private.admin_person(uuid) from public, anon, authenticated;`
- L1885: `revoke execute on function app_private.require_payments() from public, anon, authenticated;`
- L1886: `revoke execute on function app_private.dispatch_job(bigint) from public, anon, authenticated;`
- L1887: `revoke execute on function app_private.job_failed(bigint, text) from public, anon, authenticated;`
- L1889: `revoke execute on function public.request_rental(uuid, date, date) from public, anon;`
- L1890: `revoke execute on function public.cancel_rental(uuid, text) from public, anon;`
- L1891: `revoke execute on function public.mark_picked_up(uuid, text) from public, anon;`
- L1892: `revoke execute on function public.mark_returned(uuid, text) from public, anon;`
- L1893: `revoke execute on function public.complete_rental(uuid) from public, anon;`
- L1894: `grant execute on function public.request_rental(uuid, date, date) to authenticated;`
- L1895: `grant execute on function public.cancel_rental(uuid, text) to authenticated;`
- L1896: `grant execute on function public.mark_picked_up(uuid, text) to authenticated;`
- L1897: `grant execute on function public.mark_returned(uuid, text) to authenticated;`
- L1898: `grant execute on function public.complete_rental(uuid) to authenticated, service_role;`
- L1900: `revoke execute on function public.file_claim(uuid, numeric, text, text[]) from public, anon;`
- L1901: `revoke execute on function public.respond_claim(uuid, text, text) from public, anon;`
- L1902: `grant execute on function public.file_claim(uuid, numeric, text, text[]) to authenticated;`
- L1903: `grant execute on function public.respond_claim(uuid, text, text) to authenticated;`
- L1905: `revoke execute on function public.admin_end_rental(uuid, text, text, numeric, text, numeric) from public, anon;`
- L1906: `revoke execute on function public.admin_refund_rental(uuid, numeric, text) from public, anon;`
- L1907: `revoke execute on function public.admin_decide_claim(uuid, numeric, text) from public, anon;`
- L1908: `revoke execute on function public.admin_payments_overview() from public, anon;`
- L1909: `grant execute on function public.admin_end_rental(uuid, text, text, numeric, text, numeric) to authenticated;`
- L1910: `grant execute on function public.admin_refund_rental(uuid, numeric, text) to authenticated;`
- L1911: `grant execute on function public.admin_decide_claim(uuid, numeric, text) to authenticated;`
- L1912: `grant execute on function public.admin_payments_overview() to authenticated;`
- L1915: `revoke execute on function public.payments_available() from public, anon, authenticated;`
- L1916: `revoke execute on function public.payment_onboard_prepare(uuid) from public, anon, authenticated;`
- L1917: `revoke execute on function public.payment_save_account(uuid, text) from public, anon, authenticated;`
- L1918: `revoke execute on function public.payment_update_account(text, boolean, boolean, boolean) from public, anon, authenticated;`
- L1919: `revoke execute on function public.payment_account_for(uuid) from public, anon, authenticated;`
- L1920: `revoke execute on function public.payment_save_customer(uuid, text) from public, anon, authenticated;`
- L1921: `revoke execute on function public.payment_pay_prepare(uuid, uuid) from public, anon, authenticated;`
- L1922: `revoke execute on function public.payment_save_intent(uuid, text, numeric, numeric) from public, anon, authenticated;`
- L1923: `revoke execute on function public.payment_deposit_prepare(uuid, uuid) from public, anon, authenticated;`
- L1924: `revoke execute on function public.payment_deposit_result(uuid, text, text, timestamp with time zone, text) from public, anon, authenticated;`
- L1925: `revoke execute on function public.payment_operation_start(uuid) from public, anon, authenticated;`
- L1926: `revoke execute on function public.payment_operation_finish(uuid, boolean, text, text, jsonb) from public, anon, authenticated;`
- L1927: `revoke execute on function public.payment_handle_event(text, text, text, jsonb, timestamp with time zone) from public, anon, authenticated;`
- L1928: `grant execute on function public.payments_available() to service_role;`
- L1929: `grant execute on function public.payment_onboard_prepare(uuid) to service_role;`
- L1930: `grant execute on function public.payment_save_account(uuid, text) to service_role;`
- L1931: `grant execute on function public.payment_update_account(text, boolean, boolean, boolean) to service_role;`
- L1932: `grant execute on function public.payment_account_for(uuid) to service_role;`
- L1933: `grant execute on function public.payment_save_customer(uuid, text) to service_role;`
- L1934: `grant execute on function public.payment_pay_prepare(uuid, uuid) to service_role;`
- L1935: `grant execute on function public.payment_save_intent(uuid, text, numeric, numeric) to service_role;`
- L1936: `grant execute on function public.payment_deposit_prepare(uuid, uuid) to service_role;`
- L1937: `grant execute on function public.payment_deposit_result(uuid, text, text, timestamp with time zone, text) to service_role;`
- L1938: `grant execute on function public.payment_operation_start(uuid) to service_role;`
- L1939: `grant execute on function public.payment_operation_finish(uuid, boolean, text, text, jsonb) to service_role;`
- L1940: `grant execute on function public.payment_handle_event(text, text, text, jsonb, timestamp with time zone) to service_role;`
- L1943: `create or replace function public.export_my_data()`

### `supabase/migrations/20261113230000_c5_payment_screens_email.sql` (1103 lines)

- L36: `alter table public.rentals add column payment_due_at timestamp with time zone;`
- L37: `comment on column public.rentals.payment_due_at is 'C5: when an awaiting_payment rental is cancelled if still unpaid (acceptance + payment_deadline_hours, fixed when it s`
- L38: `create index rentals_payment_due_idx on public.rentals (payment_due_at) where status = 'awaiting_payment';`
- L41: `create function app_private.rentals_payment_due()`
- L54: `create trigger rentals_payment_due before insert or update of status on public.rentals`
- L58: `create function public.rental_settings()`
- L74: `comment on function public.rental_settings() is 'C5: the rental and payment rules the apps and website show (no secrets; the Terms state them).';`
- L77: `alter table public.notification_settings add column email_rentals boolean not null default true;`
- L78: `grant select (email_rentals), insert (email_rentals), update (email_rentals) on public.notification_settings to authenticated;`
- L79: `comment on column public.notification_settings.email_rentals is 'C5: "Email me about rentals" (requests, answers, receipts, reminders, claims). Default on.';`
- L81: `create table app_private.email_messages (`
- L102: `create index email_messages_recipient_idx on app_private.email_messages (recipient_id);`
- L103: `create index email_messages_finished_idx on app_private.email_messages (finished_at) where status <> 'queued';`
- L104: `alter table app_private.email_messages enable row level security;`
- L105: `revoke all on app_private.email_messages from public, anon, authenticated, service_role;`
- L106: `comment on table app_private.email_messages is 'C5: each transactional email: which template, to whom (an account, or an address only for the account-deleted email), its `
- L108: `alter table app_private.async_jobs drop constraint async_jobs_kind_check;`
- L109: `alter table app_private.async_jobs add constraint async_jobs_kind_check`
- L111: `alter table app_private.async_jobs drop constraint async_jobs_status_check;`
- L112: `alter table app_private.async_jobs add constraint async_jobs_status_check`
- L132: `create function app_private.queue_email(p_template text, p_recipient uuid, p_rental uuid, p_details jsonb default '{}'::jsonb)`
- L162: `create function app_private.queue_rental_email(p_kind text, p_rental public.rentals, p_recipient uuid, p_detail text default null)`
- L189: `create function app_private.rentals_receipt_email()`
- L202: `create trigger rentals_receipt_email after update of payment_status on public.rentals`
- L207: `create function public.queue_account_deleted_email(p_email text)`
- L230: `create function public.email_prepare(p_email_id uuid)`
- L314: `create function public.email_finish(p_email_id uuid, p_status text, p_reason text default null, p_provider_id text default null)`
- L337: `create or replace function app_private.dispatch_job(p_id bigint)`
- L425: `create or replace function app_private.job_failed(p_id bigint, p_error text)`
- L468: `create or replace function app_private.run_async_jobs()`
- L535: `create or replace function public.admin_jobs_status()`
- L570: `create or replace function public.admin_list_dead_jobs(p_limit integer default 30, p_offset integer default 0)`
- L608: `create or replace function app_private.queue_rental_push(p_kind text, p_rental public.rentals, p_recipient uuid,`
- L715: `create or replace function app_private.expire_rental_requests()`
- L773: `create or replace function app_private.rental_json(p_rental public.rentals, p_uid uuid, p_full boolean)`
- L845: `create or replace function public.export_my_data()`
- L1084: `revoke execute on function app_private.rentals_payment_due() from public, anon, authenticated;`
- L1085: `revoke execute on function app_private.queue_email(text, uuid, uuid, jsonb) from public, anon, authenticated;`
- L1086: `revoke execute on function app_private.queue_rental_email(text, public.rentals, uuid, text) from public, anon, authenticated;`
- L1087: `revoke execute on function app_private.rentals_receipt_email() from public, anon, authenticated;`
- L1088: `revoke execute on function app_private.dispatch_job(bigint) from public, anon, authenticated;`
- L1089: `revoke execute on function app_private.job_failed(bigint, text) from public, anon, authenticated;`
- L1090: `revoke execute on function app_private.run_async_jobs() from public, anon, authenticated;`
- L1091: `revoke execute on function app_private.queue_rental_push(text, public.rentals, uuid, uuid, text) from public, anon, authenticated;`
- L1092: `revoke execute on function app_private.expire_rental_requests() from public, anon, authenticated;`
- L1093: `revoke execute on function app_private.rental_json(public.rentals, uuid, boolean) from public, anon, authenticated;`
- L1095: `revoke execute on function public.rental_settings() from public;`
- L1096: `grant execute on function public.rental_settings() to anon, authenticated, service_role;`
- L1098: `revoke execute on function public.queue_account_deleted_email(text) from public, anon, authenticated;`
- L1099: `revoke execute on function public.email_prepare(uuid) from public, anon, authenticated;`
- L1100: `revoke execute on function public.email_finish(uuid, text, text, text) from public, anon, authenticated;`
- L1101: `grant execute on function public.queue_account_deleted_email(text) to service_role;`
- L1102: `grant execute on function public.email_prepare(uuid) to service_role;`
- L1103: `grant execute on function public.email_finish(uuid, text, text, text) to service_role;`
