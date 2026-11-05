package com.dzirent.shared.data

import com.dzirent.shared.platform.PhotoAnalyzer
import com.dzirent.shared.platform.toRgbImage
import com.dzirent.shared.platform.uprightImage
import com.dzirent.shared.util.PhotoScores
import com.dzirent.shared.util.PhotoThresholds
import com.dzirent.shared.util.analyzeImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import platform.Foundation.NSData
import platform.Foundation.NSLog
import platform.Foundation.NSURL
import platform.Foundation.dataWithContentsOfFile

/**
 * Photo checks on the iPhone, the same shared checks Android runs. Item recognition (TinyCLIP)
 * isn't on iOS yet, so this behaves exactly like Android when its model can't load: the checks
 * run, there's no embedding and no scores, and the editor shows no suggestions.
 */
class IosPhotoAnalyzer : PhotoAnalyzer {
    override suspend fun analyze(uri: String): PhotoAnalysis = withContext(Dispatchers.Default) {
        val image = guarded {
            val path = NSURL.URLWithString(uri)?.path
            val data = path?.let { NSData.dataWithContentsOfFile(it) }
            data?.let { uprightImage(it, PhotoThresholds.WORKING_LONG_SIDE) }?.toRgbImage()
        } ?: return@withContext PhotoAnalysis(checks = null)
        val analysis = guarded { analyzeImage(image) } ?: return@withContext PhotoAnalysis(checks = null)
        PhotoAnalysis(checks = analysis.checks, embedding = null, scores = null, colors = analysis.colors)
    }

    /** No model on iOS yet. */
    override suspend fun scores(embedding: FloatArray): PhotoScores? = null

    private inline fun <T> guarded(block: () -> T): T? = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        NSLog("Dzirent: photo analysis step failed: %@", e.message ?: e.toString())
        null
    }
}
