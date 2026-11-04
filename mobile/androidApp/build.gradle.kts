plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.aboutlibraries)
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

// Push notifications: Firebase reads google-services.json from the path in GOOGLE_SERVICES_JSON.
// The file never goes into the repo. Its values become the string resources the
// google-services plugin would generate, from the Firebase app registered for each build
// type's application ID. Release builds require it; a debug build without it has no push.
val googleServicesPath = providers.environmentVariable("GOOGLE_SERVICES_JSON").orNull?.trim()?.takeIf { it.isNotEmpty() }
val googleServices: Map<*, *>? = googleServicesPath?.let { path ->
    val json = file(path)
    if (!json.isFile) throw GradleException("GOOGLE_SERVICES_JSON points to a file that doesn't exist.")
    groovy.json.JsonSlurper().parse(json) as Map<*, *>
}
if (googleServices == null) {
    if (isRelease) throw GradleException("Release builds require GOOGLE_SERVICES_JSON (the path to google-services.json).")
    logger.warn("GOOGLE_SERVICES_JSON is not set: this build has no push notifications.")
}

/** The string resources Firebase reads at start-up, for the Firebase app of [packageName]. */
fun firebaseResources(packageName: String): Map<String, String> {
    val json = googleServices ?: return emptyMap()
    val project = json["project_info"] as Map<*, *>
    val client = (json["client"] as List<*>).map { it as Map<*, *> }.firstOrNull { client ->
        val info = client["client_info"] as Map<*, *>
        (info["android_client_info"] as Map<*, *>)["package_name"] == packageName
    } ?: throw GradleException("google-services.json has no Android app for $packageName.")
    val apiKey = ((client["api_key"] as List<*>).first() as Map<*, *>)["current_key"].toString()
    return buildMap {
        put("google_app_id", (client["client_info"] as Map<*, *>)["mobilesdk_app_id"].toString())
        put("gcm_defaultSenderId", project["project_number"].toString())
        put("google_api_key", apiKey)
        put("google_crash_reporting_api_key", apiKey)
        put("project_id", project["project_id"].toString())
        project["storage_bucket"]?.let { put("google_storage_bucket", it.toString()) }
    }
}

android {
    namespace = "com.dzirent.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.dzirent.app"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = "1.0.0"

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
            firebaseResources("${defaultConfig.applicationId}.debug").forEach { (name, value) -> resValue("string", name, value) }
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            resValue("string", "app_name", "Dzirent")
            firebaseResources("${defaultConfig.applicationId}").forEach { (name, value) -> resValue("string", name, value) }
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

    androidResources {
        // The model is memory-mapped straight from the APK, which needs it stored uncompressed.
        noCompress += "tflite"
    }
}

// Open-source licenses: also lists files that aren't Gradle dependencies (the TinyCLIP model).
aboutLibraries {
    configPath = "config"
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.android)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
}

