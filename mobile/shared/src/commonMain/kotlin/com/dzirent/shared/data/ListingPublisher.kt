package com.dzirent.shared.data

import com.dzirent.shared.model.Availability
import com.dzirent.shared.model.Listing
import com.dzirent.shared.model.ListingMeasurement
import com.dzirent.shared.model.ListingPhoto
import com.dzirent.shared.repository.DzirentException
import com.dzirent.shared.repository.DzirentRepository
import com.dzirent.shared.platform.DeviceServices
import com.dzirent.shared.util.isDraft
import kotlin.coroutines.cancellation.CancellationException

/** A photo in the editor: one already saved, or a new one picked from the gallery or camera. */
sealed class PhotoItem {
    abstract val key: String

    data class Existing(val photo: ListingPhoto) : PhotoItem() {
        override val key get() = photo.id
    }

    /** [uri]: the app's own copy of the photo (PhotoStore). */
    data class New(val uri: String) : PhotoItem() {
        override val key get() = uri
    }
}

/**
 * Everything the editor saves. [listing] carries the id, owner, location and text fields;
 * [photos] are in display order, with their slot keys ([slots], same order). With
 * [listingDeclarationVersion] set (accessories), the per-listing declaration is recorded too.
 */
data class ListingDraft(
    val listing: Listing,
    val photos: List<PhotoItem>,
    val measurements: List<ListingMeasurement>,
    val availability: List<Availability>,
    val slots: List<String?> = photos.map { null },
    val listingDeclarationVersion: Int? = null
)

/** Thrown when a publish step fails; [step] names it for the Retry screen. */
class PublishStepException(val step: String, cause: Throwable) :
    Exception(if (cause is DzirentException) cause.message else "Something went wrong. Please try again.", cause)

/**
 * Saves a new or edited listing in steps that resume after a failure:
 * - [syncPhotos], right after the photos step, so the server can check them: a new listing's
 *   paused draft row first (placeholder title), then removed photos, new photos and their order.
 * - [publish]: the details, any photo changes since, measurements and availability, the
 *   declaration, then the final status. A new listing (or a draft) ends up 'active' through
 *   the database's publish gate; an edited listing keeps its status, so a live listing stays
 *   live while it's edited (the server re-checks changed photos itself).
 *
 * One instance per editor session. Completed steps are remembered, and [restore] carries the
 * uploads of a saved draft across a restart.
 */
class ListingPublisher(
    private val repository: DzirentRepository,
    private val device: DeviceServices,
    /** Null for a new listing. */
    private val original: Listing?
) {
    private var listingCreated = original != null
    private val deletedPhotoIds = mutableSetOf<String>()
    private val uploaded = mutableMapOf<String, ListingPhoto>() // PhotoItem.New key -> saved photo
    private val savedPositions = mutableMapOf<String, Pair<Int, String?>>() // photo id -> (position, slot) in DB
    private var declarationRecorded = false

    /** A new listing, or a draft row from an earlier photo check: publishing makes it active. */
    private val goesLive = original == null || original.isDraft

    init {
        original?.photos?.forEach { savedPositions[it.id] = it.position to it.slot }
    }

    /** The listing row exists on the server. */
    val created: Boolean get() = listingCreated

    /** New photo URIs uploaded so far, with what they were saved as. */
    val uploadedPhotos: Map<String, ListingPhoto> get() = uploaded.toMap()

    /** The saved photo behind [item]: always for a saved one, once uploaded for a new one. */
    fun photoOf(item: PhotoItem): ListingPhoto? = when (item) {
        is PhotoItem.Existing -> item.photo
        is PhotoItem.New -> uploaded[item.key]
    }

    /** Picks up a saved draft's uploads, so they aren't uploaded again. */
    fun restore(created: Boolean, photos: Map<String, ListingPhoto>) {
        listingCreated = listingCreated || created
        uploaded.putAll(photos)
        photos.values.forEach { savedPositions[it.id] = it.position to it.slot }
    }

    /** Forgets a new listing's draft row and uploads (the row is gone), so the next sync starts afresh. */
    fun reset() {
        if (original != null) return
        listingCreated = false
        uploaded.clear()
        savedPositions.clear()
        deletedPhotoIds.clear()
    }

    /**
     * Puts the editor's photos on the listing as they are now, for the photo check. A new
     * listing's row is created first as a paused draft from [draftRow].
     */
    suspend fun syncPhotos(draftRow: Listing, photos: List<PhotoItem>, slots: List<String?>, onProgress: (String) -> Unit = {}) {
        if (!listingCreated) {
            step("Saving your draft", onProgress) {
                repository.createListing(draftRow.copy(status = "paused"))
                listingCreated = true
            }
        }
        savePhotos(draftRow.id, photos, slots, onProgress)
    }

    /**
     * Saves everything. [beforeGoingLive] runs just before a new listing (or draft) is made
     * active, so the editor can wait for the photo check while vision_required is on.
     */
    suspend fun publish(
        draft: ListingDraft,
        beforeGoingLive: suspend ((String) -> Unit) -> Unit = {},
        onProgress: (String) -> Unit
    ) {
        val listing = draft.listing
        // An edit saves with the status the listing has, so a live listing isn't taken down.
        val savedStatus = if (goesLive) "paused" else original!!.status

        step("Saving listing details", onProgress) {
            if (!listingCreated) {
                repository.createListing(listing.copy(status = "paused"))
                listingCreated = true
            } else {
                repository.updateListingDetails(listing, status = savedStatus)
            }
        }

        savePhotos(listing.id, draft.photos, draft.slots, onProgress)

        step("Saving measurements and dates", onProgress) {
            repository.replaceMeasurements(listing.id, draft.measurements)
            repository.replaceAvailability(listing.id, draft.availability)
        }

        val declarationVersion = draft.listingDeclarationVersion
        if (declarationVersion != null && !declarationRecorded) {
            step("Saving the declaration", onProgress) {
                repository.recordListingDeclaration(listing.id, declarationVersion)
                declarationRecorded = true
            }
        }

        if (goesLive) {
            beforeGoingLive(onProgress)
            step("Publishing", onProgress) {
                repository.toggleListingStatus(listing.id, "active")
            }
        }

        device.clearCameraCache()
    }

    /** Removed photos (saved ones, and uploads no longer in the editor), new photos, then the order. */
    private suspend fun savePhotos(listingId: String, photos: List<PhotoItem>, slots: List<String?>, onProgress: (String) -> Unit) {
        val keys = photos.map { it.key }.toSet()
        val keptExistingIds = photos.filterIsInstance<PhotoItem.Existing>().map { it.photo.id }.toSet()
        val toDelete = original?.photos.orEmpty().filter { it.id !in keptExistingIds && it.id !in deletedPhotoIds } +
            uploaded.filterKeys { it !in keys }.values
        if (toDelete.isNotEmpty()) {
            step("Removing photos", onProgress) {
                toDelete.forEach { photo ->
                    repository.deleteListingPhoto(photo)
                    deletedPhotoIds += photo.id
                    savedPositions.remove(photo.id)
                    uploaded.values.remove(photo)
                }
            }
        }

        val newPhotos = photos.withIndex().filter { it.value is PhotoItem.New && it.value.key !in uploaded }
        newPhotos.forEachIndexed { i, (position, item) ->
            step("Uploading photo ${i + 1} of ${newPhotos.size}", onProgress) {
                val bytes = readBytes((item as PhotoItem.New).uri)
                val slot = slots.getOrNull(position)
                val compressed = device.imageCompressor.compressImage(bytes)
                    ?: throw DzirentException("One of the photos couldn't be read. Remove it or pick a different one.")
                val photo = repository.uploadListingPhoto(listingId, compressed, position, slot)
                uploaded[item.key] = photo
                savedPositions[photo.id] = position to slot
            }
        }

        step("Saving photo order", onProgress) {
            photos.forEachIndexed { position, item ->
                val photoId = when (item) {
                    is PhotoItem.Existing -> item.photo.id
                    is PhotoItem.New -> uploaded.getValue(item.key).id
                }
                val place = position to slots.getOrNull(position)
                if (savedPositions[photoId] != place) {
                    repository.updatePhotoPosition(photoId, place.first, place.second)
                    savedPositions[photoId] = place
                    if (item is PhotoItem.New) uploaded[item.key] = uploaded.getValue(item.key).copy(position = place.first, slot = place.second)
                }
            }
        }
    }

    private suspend fun step(name: String, onProgress: (String) -> Unit, block: suspend () -> Unit) {
        onProgress("$name...")
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            throw PublishStepException(name, e)
        }
    }

    private suspend fun readBytes(uri: String): ByteArray =
        device.readPhoto(uri) ?: throw DzirentException("One of the photos couldn't be read. Remove it or pick a different one.")
}
