package com.dzirent.shared.platform

import com.dzirent.shared.util.RgbImage
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.useContents
import kotlinx.cinterop.usePinned
import platform.CoreGraphics.CGBitmapContextCreate
import platform.CoreGraphics.CGColorSpaceCreateDeviceRGB
import platform.CoreGraphics.CGColorSpaceRelease
import platform.CoreGraphics.CGContextDrawImage
import platform.CoreGraphics.CGContextRelease
import platform.CoreGraphics.CGImageAlphaInfo
import platform.CoreGraphics.CGImageGetHeight
import platform.CoreGraphics.CGImageGetWidth
import platform.CoreGraphics.CGRectMake
import platform.CoreGraphics.CGSizeMake
import platform.Foundation.NSData
import platform.Foundation.create
import platform.UIKit.UIGraphicsImageRenderer
import platform.UIKit.UIGraphicsImageRendererFormat
import platform.UIKit.UIImage
import platform.posix.memcpy
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@OptIn(ExperimentalForeignApi::class, kotlinx.cinterop.BetaInteropApi::class)
internal fun ByteArray.toNSData(): NSData =
    if (isEmpty()) NSData() else usePinned { NSData.create(bytes = it.addressOf(0), length = size.toULong()) }

@OptIn(ExperimentalForeignApi::class)
internal fun NSData.toByteArray(): ByteArray {
    val count = length.toInt()
    val out = ByteArray(count)
    if (count > 0) out.usePinned { memcpy(it.addressOf(0), bytes, length) }
    return out
}

/**
 * Decodes [data] and draws it upright (UIImage applies the EXIF orientation), scaled down so the
 * long side is at most [maxSide] pixels; never scaled up. Null if it can't be read.
 */
@OptIn(ExperimentalForeignApi::class)
internal fun uprightImage(data: NSData, maxSide: Int): UIImage? {
    val image = UIImage.imageWithData(data) ?: return null
    // imageWithData has scale 1, so its size (already in upright orientation) is in pixels.
    val (width, height) = image.size.useContents { width to height }
    if (width <= 0.0 || height <= 0.0) return null
    val ratio = min(1.0, maxSide / max(width, height))
    val targetWidth = max(1, (width * ratio).roundToInt()).toDouble()
    val targetHeight = max(1, (height * ratio).roundToInt()).toDouble()
    val format = UIGraphicsImageRendererFormat()
    format.scale = 1.0
    format.opaque = true
    return UIGraphicsImageRenderer(size = CGSizeMake(targetWidth, targetHeight), format = format)
        .imageWithActions { image.drawInRect(CGRectMake(0.0, 0.0, targetWidth, targetHeight)) }
}

/** The image's pixels as 0xRRGGBB for the shared photo checks. */
@OptIn(ExperimentalForeignApi::class)
internal fun UIImage.toRgbImage(): RgbImage? {
    val cgImage = CGImage ?: return null
    val width = CGImageGetWidth(cgImage).toInt()
    val height = CGImageGetHeight(cgImage).toInt()
    if (width <= 0 || height <= 0) return null
    val rgba = ByteArray(width * height * 4)
    val drawn = rgba.usePinned { pinned ->
        val colorSpace = CGColorSpaceCreateDeviceRGB()
        // 8-bit R, G, B, unused byte, rows top to bottom.
        val context = CGBitmapContextCreate(
            pinned.addressOf(0), width.toULong(), height.toULong(), 8u, (width * 4).toULong(),
            colorSpace, CGImageAlphaInfo.kCGImageAlphaNoneSkipLast.value
        )
        CGColorSpaceRelease(colorSpace)
        if (context == null) {
            false
        } else {
            CGContextDrawImage(context, CGRectMake(0.0, 0.0, width.toDouble(), height.toDouble()), cgImage)
            CGContextRelease(context)
            true
        }
    }
    if (!drawn) return null
    val pixels = IntArray(width * height) { i ->
        val o = i * 4
        ((rgba[o].toInt() and 0xFF) shl 16) or ((rgba[o + 1].toInt() and 0xFF) shl 8) or (rgba[o + 2].toInt() and 0xFF)
    }
    return RgbImage(width, height, pixels)
}
