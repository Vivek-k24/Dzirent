import SwiftUI
import shared

@main
struct iOSApp: App {
    init() {
        // The shared age gate asks Apple's Declared Age Range through this (AgeRange.swift).
        IosAgeRange.shared.provider = DeclaredAgeRangeProvider()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

/// The shared Compose UI, edge to edge; Compose handles the safe area and the keyboard itself.
struct ContentView: View {
    var body: some View {
        ComposeView()
            .ignoresSafeArea()
    }
}

struct ComposeView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        MainViewControllerKt.MainViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
