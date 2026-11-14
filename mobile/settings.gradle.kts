pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // C6: Didit's documented Maven repository for its Android SDK (me.didit:didit-sdk). Only the
        // me.didit group is ever looked up here; every other library still comes from Google and Maven Central.
        exclusiveContent {
            forRepository {
                maven { url = uri("https://raw.githubusercontent.com/didit-protocol/sdk-android/main/repository") }
            }
            filter { includeGroup("me.didit") }
        }
    }
}

rootProject.name = "dzirent-mobile"
include(":shared")
include(":androidApp")

