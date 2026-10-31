plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.kotlin.compose)
}

val generatedConfigDir = layout.buildDirectory.dir("generated/source/supabaseConfig/commonMain/kotlin")

val generateSupabaseConfig by tasks.registering {
    val outputDir = generatedConfigDir
    outputs.dir(outputDir)

    val envUrl = providers.environmentVariable("SUPABASE_URL").orNull?.trim() ?: ""
    val envKey = providers.environmentVariable("SUPABASE_PUBLISHABLE_KEY").orNull?.trim() ?: ""
    inputs.property("SUPABASE_URL", envUrl)
    inputs.property("SUPABASE_PUBLISHABLE_KEY", envKey)

    doLast {
        if (envUrl.isEmpty()) {
            throw GradleException("Missing required environment variable: SUPABASE_URL")
        }
        if (envKey.isEmpty()) {
            throw GradleException("Missing required environment variable: SUPABASE_PUBLISHABLE_KEY")
        }
        val destDir = outputDir.get().asFile.resolve("com/dzirent/shared/config")
        destDir.mkdirs()
        val file = destDir.resolve("SupabaseBuildConfig.kt")
        file.writeText(
            """
            package com.dzirent.shared.config

            object SupabaseBuildConfig {
                const val SUPABASE_URL: String = "$envUrl"
                const val SUPABASE_PUBLISHABLE_KEY: String = "$envKey"
            }
            """.trimIndent() + "\n"
        )
    }
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
    iosArm64()
    iosSimulatorArm64()

    sourceSets {
        commonMain {
            kotlin.srcDir(generateSupabaseConfig)
            dependencies {
                implementation(project.dependencies.platform(libs.supabase.bom))
                implementation(libs.supabase.auth)
                implementation(libs.supabase.postgrest)
                implementation(libs.supabase.storage)
                implementation(libs.supabase.realtime)
                implementation(libs.supabase.functions)
                implementation(libs.ktor.client.core)
                implementation(libs.kotlinx.coroutines.core)
                implementation(libs.kotlinx.serialization.json)
                implementation(libs.kotlinx.datetime)

                // Compose Multiplatform
                implementation(compose.runtime)
                implementation(compose.foundation)
                implementation(compose.material3)
                implementation(compose.ui)
                implementation(compose.components.resources)
                implementation(compose.materialIconsExtended)
                implementation(libs.navigation.compose)
                implementation(libs.lifecycle.viewmodel.compose)
                implementation(libs.lifecycle.runtime.compose)

                // Coil 3
                implementation(libs.coil.compose)
                implementation(libs.coil.network.ktor3)
            }
        }
        commonTest {
            dependencies {
                implementation(kotlin("test"))
                implementation(libs.kotlinx.coroutines.test)
            }
        }
        androidMain {
            dependencies {
                implementation(libs.ktor.client.android)
                implementation(libs.kotlinx.coroutines.android)
                implementation(libs.androidx.core.ktx)
                implementation(libs.androidx.datastore.preferences)
                implementation(libs.play.services.location)
                implementation(libs.androidx.exifinterface)
            }
        }
        val iosMain by creating {
            dependsOn(commonMain.get())
            dependencies {
                implementation(libs.ktor.client.darwin)
            }
        }
        getByName("iosArm64Main").dependsOn(iosMain)
        getByName("iosSimulatorArm64Main").dependsOn(iosMain)

        val androidUnitTest by getting {
            dependencies {
                implementation(libs.junit)
            }
        }
    }
}

android {
    namespace = "com.dzirent.shared"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
