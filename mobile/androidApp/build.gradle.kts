plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val isRelease = gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }
val runNumberEnv = providers.environmentVariable("GITHUB_RUN_NUMBER").orNull?.trim()
val offsetEnv = providers.environmentVariable("ANDROID_VERSION_CODE_OFFSET").orNull?.trim()

val appVersionCode: Int = if (runNumberEnv != null) {
    val runNumber = runNumberEnv.toIntOrNull() ?: 1
    val offset = offsetEnv?.toIntOrNull()
    if (offset == null) {
        if (isRelease) {
            throw GradleException("Release builds require ANDROID_VERSION_CODE_OFFSET environment variable.")
        }
        runNumber
    } else {
        runNumber + offset
    }
} else {
    if (isRelease && offsetEnv == null) {
        throw GradleException("Release builds require ANDROID_VERSION_CODE_OFFSET environment variable.")
    }
    1
}

val releaseKeystorePath = providers.environmentVariable("DZIRENT_KEYSTORE").orNull?.trim()
val releaseStorePassword = providers.environmentVariable("DZIRENT_STORE_PASSWORD").orNull?.trim()
val releaseKeyAlias = providers.environmentVariable("DZIRENT_KEY_ALIAS").orNull?.trim()
val releaseKeyPassword = providers.environmentVariable("DZIRENT_KEY_PASSWORD").orNull?.trim()

val hasReleaseSigning = !releaseKeystorePath.isNullOrBlank() &&
    !releaseStorePassword.isNullOrBlank() &&
    !releaseKeyAlias.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank() &&
    file(releaseKeystorePath).exists()

android {
    namespace = "com.dzirent.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.dzirent.app"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = "2.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseKeystorePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            resValue("string", "app_name", "Dzirent Debug")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            resValue("string", "app_name", "Dzirent")
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
}

