package com.dzirent.shared.util

/**
 * F1: what a studio page offers. Someone else's: Save and Message (Report and Block are in a
 * listing's menu and the chat). Your own: Edit studio (Settings > My studio) instead, never Save,
 * Message, Report or Block. Share shows on both. The website follows the same rule
 * (apps/web/src/lib/studio-view.ts), and the database ignores a self-block or self-report.
 */
data class StudioActions(val save: Boolean, val message: Boolean, val edit: Boolean)

fun studioActions(isOwn: Boolean, hasPieces: Boolean): StudioActions =
    if (isOwn) StudioActions(save = false, message = false, edit = true)
    else StudioActions(save = true, message = hasPieces, edit = false)

/** Your own studio: the server says so (is_own), or it's your own id. */
fun isOwnStudio(pageSaysOwn: Boolean, lenderId: String, currentUserId: String?): Boolean =
    pageSaysOwn || (!currentUserId.isNullOrBlank() && lenderId == currentUserId)

/**
 * F1: what a listing page offers in its top bar. Your own listing: Edit only. Someone else's:
 * Save and the menu with Report listing; a guest gets Save (which asks them to sign up) and no
 * Report.
 */
data class ListingActions(val edit: Boolean, val save: Boolean, val report: Boolean)

fun listingActions(isOwn: Boolean, isGuest: Boolean): ListingActions =
    if (isOwn) ListingActions(edit = true, save = false, report = false)
    else ListingActions(edit = false, save = true, report = !isGuest)
