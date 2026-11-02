# Dzirent iOS Application — KMP Toolchain Audit & Package Specification

**Document Version:** 2.0.0 (Strictly Aligned with `Preview` Branch)  
**Target Architecture:** Apple Silicon (`arm64`)  
**Base Repository Branch:** `Preview` (`https://github.com/Vivek-k24/Dzirent.git`)  
**Audit Date:** October 31, 2026  
**Auditor:** Antigravity Discovery Agent  

---

## Executive Summary

This specification represents a complete, read-only audit of the **Dzirent** codebase strictly from the **`Preview`** branch, discarding all obsolete architectural assumptions.

### Architecture & Domain Reality on `Preview`
1. **Kotlin Multiplatform (KMP) Architecture:** The mobile codebase (`mobile/`) is a unified Kotlin Multiplatform project using **Compose Multiplatform 1.7.3** and **Kotlin 2.1.0**. The UI and business logic are shared across platforms inside `mobile/shared/src/commonMain` (`DzirentApp()`).
2. **iOS Entry Point:** `mobile/shared/src/iosMain` provides `MainViewController(): UIViewController = ComposeUIViewController { DzirentApp() }`. An Xcode container project (`iosApp`) will embed this shared framework.
3. **Backend Stack:** Strictly **Supabase** (Postgrest RPC functions, Supabase Auth, Supabase Storage, Realtime, and Edge Functions). There is **no** Python API, **no** Azure infrastructure, and **no** external payment gateways.
4. **Zero Payments or Checkout:** Peer-to-peer clothing rental arranged directly between renters and lenders in in-app chat. There are **no payments, no deposits, and no checkout/Bag flows**.
5. **Feature is "Saved" (Not "Bag"):** Users bookmark pieces and studios into the **"Saved"** screen (`SavedScreen.kt`).
6. **Platform Services:** iOS-specific hardware integration (Location, Camera, Photo Picker, Settings, and Image Compression) is abstracted via `PlatformServices.kt` with stubs in `IosPlatformServices.kt` ready for native iOS bridges.

---

## 1. System & macOS Prerequisites for KMP iOS

Read-only checks were performed directly against this MacBook to verify readiness for compiling and running the Kotlin Multiplatform iOS target.

| Tool / Component | Current Status on this Mac | Target / Required Version | Status | Notes & Paths |
| :--- | :--- | :--- | :--- | :--- |
| **macOS** | macOS 27.0.1 (Darwin 26A434) | macOS 14.0+ / 15.0+ | **Ready** | Apple Silicon (`arm64`) |
| **JDK (Java)** | OpenJDK 17.0.21 (`Temurin-17.0.21+9`) | JDK 17 (or 21) | **Ready** | `/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home`. Matches `JvmTarget.JVM_17`. |
| **Xcode Application** | Xcode 27.1 (Build 27A9275) | Xcode 16.0+ / 27.0+ | **Ready** | `/Applications/Xcode.app` |
| **Active Developer Path (`xcode-select`)** | `/Applications/Xcode.app/Contents/Developer` | `/Applications/Xcode.app/Contents/Developer` | **Ready** | Correctly points to full Xcode installation |
| **`xcodebuild` CLI** | Xcode 27.1 (Build 27A9275) | Xcode 27.1 | **Ready** | Functional and responsive |
| **iOS Simulator Runtimes** | iOS 27.0 & iOS 27.1 installed | iOS 17.0+ / 27.0+ | **Ready** | iPhone 18 Pro, iPhone 17, iPad Pro M5 available |
| **Gradle Wrapper** | Configured for Gradle 8.11.1 (`gradlew`) | Gradle 8.10+ / 8.11.1 | **Action Needed** | `mobile/gradlew` exists but requires executable permission (`chmod +x gradlew`) |
| **Kotlin Compiler** | Kotlin 2.1.0 (via Gradle build) | Kotlin 2.1.0 | **Ready** | Pinned in `libs.versions.toml` |
| **KDoctor** | Not installed (`which kdoctor` failed) | Latest stable | **Missing** | Install via `brew install kdoctor` to diagnose KMP environment |
| **CocoaPods** | Not installed (`pod` not found) | CocoaPods 1.15.0+ | **Optional/Missing** | Install via `brew install cocoapods` if using podspec integration; SPM is preferred |
| **Homebrew** | Homebrew 7.0.11 | Homebrew 4.0+ | **Ready** | `/opt/homebrew/bin/brew` |

---

## 2. Required Packages & Dependencies (Strictly from `Preview`)

The following libraries and frameworks are declared in `mobile/gradle/libs.versions.toml` and `mobile/shared/build.gradle.kts`. These constitute the complete set of dependencies required to compile and run the Dzirent iOS application from the shared Kotlin codebase.

### A. Kotlin Multiplatform & Compose UI (Shared Module)

| Component | Dependency Identifier | Pinned Version | Specific Feature Mapping in Dzirent |
| :--- | :--- | :--- | :--- |
| **Kotlin Multiplatform** | `org.jetbrains.kotlin.multiplatform` | `2.1.0` | Enables shared Kotlin code targeting `iosArm64` and `iosSimulatorArm64`. |
| **Compose Multiplatform** | `org.jetbrains.compose` | `1.7.3` | Powers 100% of the UI (`DzirentApp`, Material3 theme, responsive layouts). |
| **Compose UI & Foundation** | `androidx.compose.ui`, `foundation`, `material3` | `1.7.3` | Minimalist Black & White theme, custom Typography, Card layouts. |
| **Compose Resources** | `org.jetbrains.compose.components.resources` | `1.7.3` | Multiplatform vector drawables (`logo_wordmark.xml`, `logo_mark.xml`). |
| **Navigation Compose** | `org.jetbrains.androidx.navigation:navigation-compose` | `2.8.0-alpha10` | Tab navigation (Home, Inbox, Search, Closet, Saved), Sidebar, and Modals. |
| **Lifecycle Compose** | `org.jetbrains.androidx.lifecycle:lifecycle-viewmodel-compose` | `2.8.4` | Scoped state and lifecycle handling for Compose Multiplatform. |
| **Coroutines** | `org.jetbrains.kotlinx:kotlinx-coroutines-core` | `1.10.1` | Asynchronous operations, background tasks, and real-time streams. |
| **Serialization** | `org.jetbrains.kotlinx:kotlinx-serialization-json` | `1.7.3` | JSON parsing for Supabase models (`Profile`, `Listing`, `SavedListing`, `ChatMessage`). |
| **DateTime** | `org.jetbrains.kotlinx:kotlinx-datetime` | `0.6.1` | Date range calculations, rental window validation, and ISO timestamps. |

### B. Supabase Backend Integration (`io.github.jan-tennert.supabase`)

All networking, authentication, database calls, and media operations communicate strictly with Supabase (`supabase-kt` 3.0.3).

| Module | Library Identifier | Purpose & Specific Dzirent Contract Mapping |
| :--- | :--- | :--- |
| **Supabase BOM** | `io.github.jan-tennert.supabase:bom:3.0.3` | Bill of Materials ensuring version compatibility across all Supabase modules. |
| **Supabase Auth** | `io.github.jan-tennert.supabase:auth-kt` | Email/password authentication, JWT management, session persistence, and guest-mode gating. |
| **Supabase Postgrest** | `io.github.jan-tennert.supabase:postgrest-kt` | Invoking PostgreSQL RPC shop window functions (`browse_listings`, `get_listing`, `get_studio`, `fit_matching_listings`). |
| **Supabase Storage** | `io.github.jan-tennert.supabase:storage-kt` | Uploading and fetching garment photos in Supabase object storage bucket (`listing-photos`). |
| **Supabase Realtime** | `io.github.jan-tennert.supabase:realtime-kt` | Live chat message syncing between renters and lenders, unread notification dots. |
| **Supabase Functions** | `io.github.jan-tennert.supabase:functions-kt` | Calling deployed Edge Functions (`delete-listing`, `delete-account`). |

### C. Network & Image Loading for iOS

| Module | Library Identifier | Target Version | Purpose in Dzirent iOS |
| :--- | :--- | :--- | :--- |
| **Ktor Client Core** | `io.ktor:ktor-client-core` | `3.0.3` | Shared HTTP engine abstractions for REST and Supabase communication. |
| **Ktor Darwin Engine** | `io.ktor:ktor-client-darwin` | `3.0.3` | **iOS Native Engine:** Wraps Apple's `NSURLSession` for optimized networking on iOS devices and simulators. |
| **Coil 3 Compose** | `io.coil-kt.coil3:coil-compose` | `3.0.4` | Asynchronous image loading for garment listings, studio avatars, and chat media. |
| **Coil Network (Ktor 3)** | `io.coil-kt.coil3:coil-network-ktor3` | `3.0.4` | Direct integration bridging Coil 3 image loading with the Ktor Darwin network client. |

### D. iOS Target Bridge & Platform Services

The UI entry point for iOS is defined in `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/MainViewController.kt`:
```kotlin
fun MainViewController(): UIViewController = ComposeUIViewController {
    DzirentApp()
}
```

To complete native hardware integration on iOS, native platform implementations are required for the interfaces defined in `PlatformServices.kt`:
- **`LocationService` (`IosLocationService`):** Apple `CoreLocation` framework for calculating approximate distance in miles (`City, ST`).
- **`SettingsStorage` (`IosSettingsStorage`):** `NSUserDefaults` or iOS Keychain for persisting user theme, distance units, and rental presets.
- **`PhotoPicker` (`IosPhotoPicker`):** Apple `PhotosUI` (`PHPickerViewController`) to select up to 5 listing photos.
- **`CameraService` (`IosCameraService`):** Apple `AVFoundation` for capturing garment photos directly inside the app.
- **`ImageCompressor` (`IosImageCompressor`):** UIKit (`UIImageJPEGRepresentation`) to downsample and compress garment photos before upload.

---

## 3. Manual Installation & Fix Commands

Follow these step-by-step commands in your terminal to prepare your MacBook, build the shared iOS framework, and launch the Dzirent iOS application.

### Step 1: Make Gradle Wrapper Executable

The checked-in Gradle wrapper requires executable permissions:

```bash
cd /Users/vivekanandakallakuri/Desktop/Dzirent/mobile
chmod +x gradlew
./gradlew --version
```

### Step 2: Install Diagnostics & Optional iOS Tooling

Install KDoctor to audit your Kotlin Multiplatform setup and CocoaPods (if using pod-based linking):

```bash
# 1. Install KDoctor for KMP verification
brew install kdoctor

# 2. Run KDoctor to verify your environment health
kdoctor

# 3. (Optional) Install CocoaPods if using Pod integration rather than SPM / XCFramework
brew install cocoapods
```

### Step 3: Configure iOS Framework Generation in `mobile/shared/build.gradle.kts`

To produce a framework that an Xcode project can link against, ensure the framework binary is declared for the iOS targets in `mobile/shared/build.gradle.kts`:

```kotlin
kotlin {
    val iosArm64 = iosArm64()
    val iosSimulatorArm64 = iosSimulatorArm64()
    
    listOf(iosArm64, iosSimulatorArm64).forEach { target ->
        target.binaries.framework {
            baseName = "shared"
            isStatic = true
        }
    }
    // ...
}
```

### Step 4: Export the Shared iOS Framework

Compile the shared Kotlin code into an iOS framework for the simulator:

```bash
cd /Users/vivekanandakallakuri/Desktop/Dzirent/mobile

# Set your Supabase environment variables for the build task
export SUPABASE_URL="https://your-supabase-project.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="your-anon-publishable-key"

# Compile the framework for the iOS Simulator (Apple Silicon arm64)
./gradlew :shared:linkDebugFrameworkIosSimulatorArm64
```

*Generated framework path:*  
`mobile/shared/build/bin/iosSimulatorArm64/debugFramework/shared.framework`

### Step 5: Initialize the Xcode `iosApp` Project Wrapper

Create the iOS application in Xcode to host `MainViewController`:

1. Open Xcode:
   ```bash
   open -a /Applications/Xcode.app
   ```
2. Create a new Xcode project:
   - **Template:** iOS -> App
   - **Product Name:** `iosApp`
   - **Interface:** SwiftUI
   - **Language:** Swift
   - **Save Location:** `/Users/vivekanandakallakuri/Desktop/Dzirent/mobile/iosApp`
3. Embed the compiled `shared.framework` into your Xcode project's `Frameworks, Libraries, and Embedded Content` setting (set to *Embed & Sign*).
4. Update `ContentView.swift` to present the shared Compose controller:
   ```swift
   import SwiftUI
   import shared

   struct ComposeView: UIViewControllerRepresentable {
       func makeUIViewController(context: Context) -> UIViewController {
           MainViewControllerKt.MainViewController()
       }

       func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
   }

   struct ContentView: View {
       var body: some View {
           ComposeView()
               .ignoresSafeArea(.all)
       }
   }
   ```
5. Select the **iPhone 18 Pro (iOS 27.1)** simulator in Xcode and press **Run** (`⌘R`).

---
*Report strictly verified and generated against the `Preview` branch.*
