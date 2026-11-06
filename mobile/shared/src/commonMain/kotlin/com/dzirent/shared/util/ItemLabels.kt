package com.dzirent.shared.util

/**
 * The kind of garment, which decides the size picker and the measurement rows. Stored on the
 * listing as garment_type (008), so "Same as your …" can find the lender's last one. The photo
 * check suggests one with the same keys (services/vision policy).
 */
enum class GarmentKind(val key: String, val label: String) {
    TOP("top", "Top or coat"),
    TROUSERS("trousers", "Trousers"),
    SUIT("suit", "Suit or blazer"),
    DRESS("dress", "Dress"),
    SKIRT("skirt", "Skirt"),
    SAREE("saree", "Saree or lehenga"),
    ONE_SIZE("one_size", "Accessory");

    companion object {
        fun fromKey(key: String?): GarmentKind? = entries.firstOrNull { it.key == key }
    }
}

/**
 * What can and can't be listed, in words, for the "What can I list?" sheet and the Community
 * policy. The same rules as the database's policy_item_types, which the server's photo check
 * applies to every listing.
 */
object ItemLabels {
    /** Accessories worth more than this can't be listed (the declaration says "less than $300"). */
    const val ACCESSORY_MAX_VALUE_USD = 300

    /** What Dzirent is for; shown above the lists. */
    const val SCOPE = "Dzirent is for clothing, bags and fashion accessories only."

    /** In the order the policy text lists them. */
    val NOT_ALLOWED_GROUPS = listOf(
        "lingerie", "underwear", "swimwear", "socks and hosiery", "shoes and boots", "hats and caps", "smartwatches"
    )

    /** Fine jewelry, listed under "Not allowed": costume jewelry is fine, with the declaration. */
    const val FINE_JEWELRY = "real gold, silver, platinum, diamonds, pearls or gemstones"

    val NOT_OFFERED_GROUPS = listOf(
        "T-shirts", "tank tops", "hoodies", "sweatshirts", "track pants", "sweatpants", "joggers", "shorts", "jeans"
    )

    /** "accessories worth more than $300", the last entry of the "Not allowed" list. */
    val ACCESSORY_VALUE_RULE = "accessories worth more than \$$ACCESSORY_MAX_VALUE_USD"

    /**
     * "Not allowed: lingerie, underwear, swimwear, socks and hosiery, shoes and boots, hats and caps,
     * smartwatches, real gold, silver, platinum, diamonds, pearls or gemstones, and accessories
     * worth more than $300."
     */
    val notAllowedText: String = "Not allowed: " +
        (NOT_ALLOWED_GROUPS + FINE_JEWELRY).joinToString(", ") + ", and $ACCESSORY_VALUE_RULE."

    /** "Not offered: everyday basics like T-shirts, tank tops, hoodies, … shorts and jeans." */
    val notOfferedText: String = "Not offered: everyday basics like " + joinWithAnd(NOT_OFFERED_GROUPS) + "."
}

/** "a, b and c" (no serial comma). */
fun joinWithAnd(items: List<String>): String = when (items.size) {
    0 -> ""
    1 -> items[0]
    else -> items.dropLast(1).joinToString(", ") + " and " + items.last()
}
