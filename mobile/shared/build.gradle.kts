plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
}

val generatedConfigDir = layout.buildDirectory.dir("generated/source/supabaseConfig/commonMain/kotlin")

val generateSupabaseConfig by tasks.registering {
    val outputDir = generatedConfigDir
    outputs.dir(outputDir)

    val envUrl = providers.environmentVariable("SUPABASE_URL").orNull?.trim() ?: ""
    val envKey = (providers.environmentVariable("SUPABASE_PUBLISHABLE_KEY").orNull
        ?: providers.environmentVariable("SUPABASE_ANON_KEY").orNull)?.trim() ?: ""
    val isRelease = gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }

    doLast {
        if (isRelease && (envUrl.isEmpty() || envKey.isEmpty())) {
            throw GradleException(
                "Release build requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY environment variables. " +
                "Refusing to build release with placeholder values."
            )
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
    compileSdk = 35

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
