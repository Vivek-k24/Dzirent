package com.dzirent.shared

import com.dzirent.shared.ui.GatedAction
import com.dzirent.shared.ui.GuestGate
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GuestGateTest {

    @Test
    fun testAllGatedActionsRequireSignIn() {
        for (action in GatedAction.entries) {
            assertTrue(
                GuestGate.requiresSignIn(action),
                "Action $action should require sign in"
            )
        }
    }

    @Test
    fun testGuestPermissions() {
        val isGuest = true
        // Guests cannot execute gated actions
        for (action in GatedAction.entries) {
            assertFalse(
                GuestGate.isActionAllowed(isGuest = isGuest, action = action),
                "Guest should not be allowed to execute $action without signing in"
            )
        }

        // Guests CAN browse
        assertTrue(GuestGate.isBrowsingAllowedForGuest(), "Guests must be allowed to browse")

        // Authenticated users CAN execute all actions
        val isAuthenticated = false // isGuest = false
        for (action in GatedAction.entries) {
            assertTrue(
                GuestGate.isActionAllowed(isGuest = isAuthenticated, action = action),
                "Authenticated user should be allowed to execute $action"
            )
        }
    }
}

