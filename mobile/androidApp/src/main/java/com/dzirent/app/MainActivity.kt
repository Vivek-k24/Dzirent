package com.dzirent.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import com.dzirent.shared.platform.AndroidSettingsStorage
import com.dzirent.shared.platform.AppSettings
import com.dzirent.shared.ui.DzirentApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val settingsStorage = remember { AndroidSettingsStorage(applicationContext) }
            val settings by settingsStorage.settings.collectAsState(initial = AppSettings())
            DzirentApp(appSettings = settings)
        }
    }
}

