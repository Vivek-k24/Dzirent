package com.dzirent.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.dzirent.shared.platform.AndroidDeviceServices
import com.dzirent.shared.platform.AndroidSettingsStorage
import com.dzirent.shared.platform.LocalDevice
import com.dzirent.shared.ui.DzirentApp
import com.dzirent.shared.util.AppSettings

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val settingsStorage = AndroidSettingsStorage(applicationContext)
        val packageInfo = packageManager.getPackageInfo(packageName, 0)
        val device = AndroidDeviceServices(applicationContext, packageInfo.versionName.orEmpty(), packageInfo.longVersionCode)
        setContent {
            // Wait for the saved settings (a few ms) so the app never flashes the other theme.
            val settings by settingsStorage.settings.collectAsState(initial = null)
            settings?.let { loaded: AppSettings ->
                CompositionLocalProvider(LocalDevice provides device) {
                    DzirentApp(appSettings = loaded, settingsStorage = settingsStorage)
                }
            }
        }
    }
}
