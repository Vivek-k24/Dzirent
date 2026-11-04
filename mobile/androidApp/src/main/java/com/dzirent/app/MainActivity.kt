package com.dzirent.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.dzirent.app.push.ChatNotifications
import com.dzirent.app.push.FirebasePush
import com.dzirent.shared.platform.AndroidDeviceServices
import com.dzirent.shared.platform.AndroidSettingsStorage
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.ui.DzirentApp
import com.dzirent.shared.util.AppSettings

class MainActivity : ComponentActivity() {
    /** The chat a tapped notification asks for, until the app has opened it. */
    private var chatToOpen by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The Messages channel exists from the start, so it shows in the phone's settings.
        ChatNotifications.createChannel(this)
        // After a rotation the intent is the same one again: its chat was already opened.
        if (savedInstanceState == null) chatToOpen = ChatNotifications.chatToOpen(intent)
        val settingsStorage = AndroidSettingsStorage(applicationContext)
        val packageInfo = packageManager.getPackageInfo(packageName, 0)
        val device = AndroidDeviceServices(
            applicationContext,
            packageInfo.versionName.orEmpty(),
            packageInfo.longVersionCode,
            FirebasePush(applicationContext)
        )
        setContent {
            // Wait for the saved settings (a few ms) so the app never flashes the other theme.
            val settings by settingsStorage.settings.collectAsState(initial = null)
            settings?.let { loaded: AppSettings ->
                CompositionLocalProvider(LocalDevice provides device) {
                    DzirentApp(
                        appSettings = loaded,
                        settingsStorage = settingsStorage,
                        openChatId = chatToOpen,
                        onOpenChatHandled = { chatToOpen = null }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        ChatNotifications.chatToOpen(intent)?.let { chatToOpen = it }
    }
}
