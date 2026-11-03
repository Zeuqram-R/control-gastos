import SwiftUI

@main
struct GastosApp: App {
    @StateObject private var sync = SyncEngine()
    @StateObject private var lock = LockManager()
    @StateObject private var prefs = Prefs()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(sync)
                .environmentObject(lock)
                .environmentObject(prefs)
                .tint(Paleta.ok)
        }
        .onChange(of: phase) { _, p in
            switch p {
            case .background: lock.didEnterBackground()
            case .active:
                lock.didBecomeActive()
                sync.sync()
            default: break
            }
        }
    }
}

/// Preferencias de este aparato.
@MainActor
final class Prefs: ObservableObject {
    /// Ocultar montos (como el ojo de la web).
    @Published var ocultar: Bool { didSet { UserDefaults.standard.set(ocultar, forKey: "ocultar") } }
    init() { ocultar = UserDefaults.standard.bool(forKey: "ocultar") }
    func crc(_ v: Double) -> String { Fmt.crc(v, hide: ocultar) }
}

struct RootView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var lock: LockManager
    @Environment(\.scenePhase) private var phase

    var body: some View {
        ZStack {
            if sync.connected { MainTabs() } else { SetupView() }
            if sync.connected && lock.enabled && (lock.locked || phase != .active) {
                LockScreen().transition(.opacity).zIndex(10)
            }
        }
        .onAppear { if lock.locked { lock.unlock() } }
    }
}

struct LockScreen: View {
    @EnvironmentObject var lock: LockManager
    var body: some View {
        ZStack {
            Paleta.marca.ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "lock.fill").font(.system(size: 38, weight: .semibold)).foregroundStyle(Paleta.moneda)
                Text("Gastos").font(.title2.bold()).foregroundStyle(.white)
                if lock.locked && !lock.authenticating {
                    Button { lock.unlock() } label: {
                        Label("Desbloquear con \(LockManager.biometryName)", systemImage: "faceid")
                            .padding(.horizontal, 18).padding(.vertical, 10)
                    }
                    .buttonStyle(.borderedProminent).tint(Paleta.moneda).foregroundStyle(Paleta.marca)
                }
            }
        }
    }
}
