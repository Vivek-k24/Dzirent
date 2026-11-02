package com.dzirent.shared.util

import java.text.Normalizer

actual fun stripAccents(text: String): String =
    Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
