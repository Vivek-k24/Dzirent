package com.dzirent.shared.util

/** [text] without accents ("López" -> "Lopez"): NFD, then combining marks dropped. */
expect fun stripAccents(text: String): String
