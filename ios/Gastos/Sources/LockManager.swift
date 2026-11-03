import Foundation
import LocalAuthentication
import SwiftUI

/// Face ID directo al abrir (como WhatsApp): sin botón de por medio; si se cancela, queda un botón para reintentar.
@MainActor
final class LockManager: ObservableObject {
    @Published private(set) var locked: Bool
    @Published private(set) var authenticating = false
    @Published var enabled: Bool { didSet { UserDefaults.standard.set(enabled, forKey: "lock.enabled"); if !enabled { locked = false } } }
    /// Minutos fuera de la app antes de volver a pedir Face ID (0 = al salir).
    @Published var espera: Int { didSet { UserDefaults.standard.set(espera, forKey: "lock.espera") } }
    private var leftAt: Date?

    init() {
        let d = UserDefaults.standard
        let en = d.object(forKey: "lock.enabled") as? Bool ?? true
        enabled = en
        espera = d.object(forKey: "lock.espera") as? Int ?? 1
        locked = en && LockManager.available
    }

    static var available: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    static var biometryName: String {
        let c = LAContext()
        _ = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch c.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "el código"
        }
    }

    private var wentBackground = false

    func didEnterBackground() {
        wentBackground = true
        if !locked { leftAt = Date() }
        if enabled && espera == 0 { locked = true }
    }

    /// Solo al volver de afuera (el propio aviso de Face ID también pasa la app a "inactiva" y no debe repetir).
    func didBecomeActive() {
        guard wentBackground else { return }
        wentBackground = false
        guard enabled, LockManager.available else { locked = false; return }
        if let t = leftAt, Date().timeIntervalSince(t) >= Double(espera * 60) { locked = true }
        leftAt = nil
        if locked { unlock() }
    }

    func unlock() {
        guard locked, !authenticating else { return }
        guard LockManager.available else { locked = false; return }
        authenticating = true
        let ctx = LAContext()
        ctx.localizedCancelTitle = "Cancelar"
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Abrir Gastos") { ok, _ in
            Task { @MainActor in
                self.authenticating = false
                if ok { withAnimation(.easeOut(duration: 0.2)) { self.locked = false } }
            }
        }
    }
}
