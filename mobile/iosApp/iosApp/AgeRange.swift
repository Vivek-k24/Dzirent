import UIKit
import DeclaredAgeRange
import shared

/// Apple's Declared Age Range for the shared age gate (IosAgeSignals.kt). Never asks for a birthdate.
///
/// Asks only when Apple says age assurance applies to this user (a covered region), so everyone
/// else sees no prompt. Anything else (iOS before 26.2, not covered, declined, an error, or the
/// Declared Age Range entitlement missing) is "no applicable signal".
final class DeclaredAgeRangeProvider: IosAgeRangeProvider {
    func requestAgeRange(ageGate: Int32, reply: AgeRangeReply) {
        // isEligibleForAgeFeatures (is this user covered?) needs iOS 26.2; earlier versions get no signal.
        guard #available(iOS 26.2, *) else {
            reply.noSignal()
            return
        }
        Task { @MainActor in
            do {
                guard try await AgeRangeService.shared.isEligibleForAgeFeatures,
                      let anchor = Self.topViewController() else {
                    reply.noSignal()
                    return
                }
                let response = try await AgeRangeService.shared.requestAgeRange(ageGates: Int(ageGate), in: anchor)
                switch response {
                case .sharing(let range):
                    // nil bounds are open ends: no lower bound = under the gate, no upper bound = at or over it.
                    reply.answer(lower: Int32(range.lowerBound ?? -1), upper: Int32(range.upperBound ?? -1))
                case .declinedSharing:
                    reply.noSignal()
                @unknown default:
                    reply.noSignal()
                }
            } catch {
                reply.noSignal()
            }
        }
    }

    /// The view controller Apple's sharing sheet is presented over.
    @MainActor
    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive } ??
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
