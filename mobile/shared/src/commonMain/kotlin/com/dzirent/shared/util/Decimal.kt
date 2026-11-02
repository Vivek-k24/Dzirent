package com.dzirent.shared.util

import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.round

// BigDecimal.valueOf(x).setScale(n, HALF_UP) and stripTrailingZeros().toPlainString(), in
// common code. Like BigDecimal.valueOf, they start from the shortest decimal form of the
// double ("2.675"), so 2.675 rounds to 2.68 rather than to the binary value's 2.67.

/** [value] written out without an exponent: 25.0 -> "25.0", 1.0E-4 -> "0.0001". */
fun plainString(value: Double): String {
    val s = value.toString()
    if (!s.contains('E') && !s.contains('e')) return s
    val negative = value < 0
    val (mantissa, exponentText) = s.removePrefix("-").lowercase().split('e')
    val exponent = exponentText.toInt()
    val digits = mantissa.replace(".", "")
    val point = mantissa.indexOf('.').let { if (it < 0) mantissa.length else it } + exponent
    val out = when {
        point <= 0 -> "0." + "0".repeat(-point) + digits
        point >= digits.length -> digits + "0".repeat(point - digits.length) + ".0"
        else -> digits.substring(0, point) + "." + digits.substring(point)
    }
    return (if (negative) "-" else "") + out
}

/** [value] rounded half up to [scale] decimals, written with exactly [scale] decimals. */
fun roundHalfUp(value: Double, scale: Int): String {
    val plain = plainString(abs(value))
    val negative = value < 0
    val intPart = plain.substringBefore('.')
    val fraction = plain.substringAfter('.', "")
    if (fraction.length <= scale) {
        val padded = fraction.padEnd(scale, '0')
        return (if (negative) "-" else "") + intPart + if (scale > 0) ".$padded" else ""
    }
    // Round the decimal digits themselves, carrying into the integer part when needed.
    val digits = (intPart + fraction.substring(0, scale)).toCharArray()
    if (fraction[scale] >= '5') {
        var i = digits.lastIndex
        while (i >= 0) {
            if (digits[i] == '9') {
                digits[i] = '0'
                i--
            } else {
                digits[i] = digits[i] + 1
                break
            }
        }
        if (i < 0) return roundHalfUpWithCarry(digits, scale, negative)
    }
    val all = digits.concatToString()
    val whole = all.substring(0, all.length - scale)
    val dec = all.substring(all.length - scale)
    val isZero = all.all { it == '0' }
    return (if (negative && !isZero) "-" else "") + whole + if (scale > 0) ".$dec" else ""
}

private fun roundHalfUpWithCarry(digits: CharArray, scale: Int, negative: Boolean): String {
    val all = "1" + digits.concatToString()
    val whole = all.substring(0, all.length - scale)
    val dec = all.substring(all.length - scale)
    return (if (negative) "-" else "") + whole + if (scale > 0) ".$dec" else ""
}

/** "25.50" -> "25.5", "25.00" -> "25", "25" -> "25". */
fun stripTrailingZeros(text: String): String =
    if (!text.contains('.')) text else text.trimEnd('0').trimEnd('.')

/** [value] rounded half up to [scale] decimals, as a number. */
fun roundTo(value: Double, scale: Int): Double {
    val factor = 10.0.pow(scale)
    return round(value * factor) / factor
}
