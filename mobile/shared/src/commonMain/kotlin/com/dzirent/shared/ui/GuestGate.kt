package com.dzirent.shared.ui

/**
 * User actions that are restricted in Guest Mode and require signing in or creating an account.
 */
enum class GatedAction(val title: String, val message: String) {
    SAVE_PIECE(
        title = "Save pieces to your closet",
        message = "Sign in or create an account to save pieces and view them anytime."
    ),
    MESSAGE_LENDER(
        title = "Message the lender",
        message = "Sign in or create an account to chat with lenders and arrange rentals."
    ),
    OPEN_STUDIO(
        title = "View lender studios",
        message = "Sign in or create an account to see lender studios and saved collections."
    ),
    LIST_PIECE(
        title = "List a piece",
        message = "Sign in or create an account to list your outfits and start renting them."
    ),
    FIT_MATCHING(
        title = "See what fits you",
        message = "Sign in or create an account and save your measurements to see personalized fit matches."
    );

    val requiresSignIn: Boolean get() = true
}

/**
 * Central rule checking whether an action is gated for guests.
 */
object GuestGate {
    /**
     * Returns true if the specified action requires an authenticated account.
     */
    fun requiresSignIn(action: GatedAction): Boolean = action.requiresSignIn

    /**
     * Checks if a user is permitted to perform the action.
     * When isGuest is true, gated actions return false.
     */
    fun isActionAllowed(isGuest: Boolean, action: GatedAction): Boolean {
        return if (isGuest) !requiresSignIn(action) else true
    }

    /**
     * Browsing screens (Home, Search, Listing Details) are open to guests.
     */
    fun isBrowsingAllowedForGuest(): Boolean = true
}

