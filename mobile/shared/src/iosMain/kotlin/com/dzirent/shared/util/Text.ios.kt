package com.dzirent.shared.util

import platform.Foundation.NSString
import platform.Foundation.decomposedStringWithCanonicalMapping

@Suppress("CAST_NEVER_SUCCEEDS")
actual fun stripAccents(text: String): String =
    (text as NSString).decomposedStringWithCanonicalMapping.filter { it.code !in 0x0300..0x036F }
