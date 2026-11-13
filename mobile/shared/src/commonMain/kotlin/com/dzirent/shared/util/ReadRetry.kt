package com.dzirent.shared.util

/**
 * C1: automatic retries for reads only. A read that fails on the network or with a server error
 * (5xx or 408) is sent again up to [MAX_RETRIES] times, after 0.5 s and then 2 s. Writes are never
 * sent again: their error shows its code instead. The website uses the same rules
 * (apps/web/src/lib/retry.ts).
 */
object ReadRetry {
    const val MAX_RETRIES = 2
    private val DELAYS_MS = longArrayOf(500L, 2_000L)

    /** Database functions that only read: sending them twice changes nothing. */
    val READ_RPCS: Set<String> = setOf(
        "browse_listings", "get_listing", "get_studio", "fit_listings", "search_cities",
        "my_conversations", "my_saved_listings", "my_saved_studios", "my_blocked_users", "my_block_peer_ids",
        "needs_legal_acceptance", "age_blocked", "is_admin", "check_text",
        // C3: reading rentals.
        "get_rental", "my_rentals"
    )

    private val rpcPath = Regex("""/rest/v1/rpc/([A-Za-z0-9_]+)/?$""")

    /** True for a request that may be sent again: GET or HEAD, or a read-only database function. */
    fun isRead(method: String, path: String): Boolean {
        if ("/realtime/" in path) return false
        return when (method.uppercase()) {
            "GET", "HEAD" -> true
            "POST" -> rpcPath.find(path)?.groupValues?.get(1) in READ_RPCS
            else -> false
        }
    }

    /** Server answers worth one more try: timeouts and 5xx (not 501, which never changes). */
    fun retryableStatus(status: Int): Boolean = status == 408 || (status in 500..599 && status != 501)

    /** Wait before retry number [retry] (1 or 2). */
    fun delayMs(retry: Int): Long = DELAYS_MS[(retry - 1).coerceIn(0, DELAYS_MS.size - 1)]
}
