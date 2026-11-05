import SwiftUI

enum Tab: String, CaseIterable, Identifiable {
    case resumen, lista, productos, recurrentes, deudas, metas
    var id: String { rawValue }
    var titulo: String {
        switch self {
        case .resumen: return "Resumen"
        case .lista: return "Lista"
        case .productos: return "Productos"
        case .recurrentes: return "Recurrentes"
        case .deudas: return "Deudas"
        case .metas: return "Metas"
        }
    }
    var icono: String {
        switch self {
        case .resumen: return "house"
        case .lista: return "list.bullet.clipboard"
        case .productos: return "tag"
        case .recurrentes: return "arrow.triangle.2.circlepath"
        case .deudas: return "scalemass"
        case .metas: return "flag"
        }
    }
    var fase: Int {
        switch self {
        case .resumen: return 2
        case .lista, .productos: return 3
        case .recurrentes, .deudas: return 4
        case .metas: return 5
        }
    }
}

/// Seis pestañas solo con íconos (como la web). El TabView de iOS mete la sexta en "Más", por eso la barra es propia.
struct MainTabs: View {
    @EnvironmentObject var nav: AppNav
    private var tab: Tab { nav.tab }
    var body: some View {
        ZStack {
            ForEach(Tab.allCases) { t in
                NavigationStack {
                    Group {
                        switch t {
                        case .resumen: ResumenView()
                        case .lista: ListaView()
                        case .productos: ProductosView()
                        case .recurrentes: RecurrentesView()
                        case .deudas: DeudasView()
                        case .metas: MetasView()
                        default: Proximamente(tab: t)
                        }
                    }
                    .navigationTitle(t.titulo)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) { StatusPill() }
                        ToolbarItem(placement: .topBarTrailing) {
                            NavigationLink { AjustesView() } label: { Image(systemName: "gearshape") }
                                .accessibilityLabel("Ajustes")
                        }
                    }
                }
                .opacity(tab == t ? 1 : 0)
                .allowsHitTesting(tab == t)
                .accessibilityHidden(tab != t)
            }
        }
        .overlay(alignment: .bottom) { barra }
        .overlay(alignment: .bottom) { ToastView().padding(.bottom, 76) }
        .sheet(isPresented: $nav.gasto) { GastoSheet() }
    }

    @Namespace private var marca

    /// Igual que la web: una cápsula flotante de vidrio, centrada, solo íconos; la pestaña activa lleva su pastilla verde suave.
    private var barra: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases) { t in
                Button {
                    if tab != t { UISelectionFeedbackGenerator().selectionChanged() }
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { nav.tab = t }
                } label: {
                    Image(systemName: t.icono)
                        .font(.system(size: 22, weight: .regular))
                        .frame(width: 54, height: 46)
                        .foregroundStyle(tab == t ? Paleta.ok : Color.primary.opacity(0.75))
                        .background {
                            if tab == t {
                                Capsule().fill(Paleta.ok.opacity(0.16)).matchedGeometryEffect(id: "tab", in: marca)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(t.titulo)
                .accessibilityAddTraits(tab == t ? .isSelected : [])
            }
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(Capsule().fill(.regularMaterial))
        .overlay(Capsule().stroke(Color.primary.opacity(0.10), lineWidth: 1))
        .shadow(color: .black.opacity(0.14), radius: 16, y: 6)
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity)
    }
}

struct Proximamente: View {
    let tab: Tab
    var body: some View {
        ContentUnavailableView {
            Label(tab.titulo, systemImage: tab.icono)
        } description: {
            Text("Esta pestaña llega en la fase \(tab.fase) de la app nativa. Mientras tanto está en la app web.")
        } actions: {
            Link("Abrir la app web", destination: URL(string: "https://zeuqram-r.github.io/control-gastos/")!)
        }
        .espacioBarra()
    }
}

/// Píldora de estado: verde al día, azul subiendo/bajando, gris sin internet, rojo error.
struct StatusPill: View {
    @EnvironmentObject var sync: SyncEngine
    @State private var showInfo = false

    var body: some View {
        Button { showInfo = true } label: {
            HStack(spacing: 5) {
                if busy { ProgressView().controlSize(.mini) } else { Circle().fill(color).frame(width: 7, height: 7) }
                Text(texto).font(.caption.weight(.semibold)).lineLimit(1)
            }
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(Capsule().fill(color.opacity(0.14)))
            .foregroundStyle(color)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Estado de sincronización: \(texto)")
        .popover(isPresented: $showInfo) {
            VStack(alignment: .leading, spacing: 8) {
                Text(texto).font(.headline)
                if !sync.message.isEmpty { Text(sync.message).font(.subheadline) }
                Text("Última sincronización: \(Fmt.hace(sync.lastSync))").font(.subheadline).foregroundStyle(.secondary)
                if sync.pending > 0 { Text("\(sync.pending) cambio(s) esperando para subir.").font(.subheadline) }
                Button("Sincronizar ahora") { sync.sync(); showInfo = false }.buttonStyle(.borderedProminent)
            }
            .padding()
            .presentationCompactAdaptation(.popover)
        }
    }

    private var busy: Bool { [.checking, .downloading, .uploading].contains(sync.state) }
    private var color: Color {
        switch sync.state {
        case .error: return Paleta.bad
        case .offline: return .gray
        case .uploading, .downloading, .checking: return Paleta.blue
        case .idle: return sync.pending > 0 ? Paleta.warn : Paleta.ok
        }
    }
    private var texto: String {
        switch sync.state {
        case .error: return "Error"
        case .offline: return sync.pending > 0 ? "Sin internet · \(sync.pending)" : "Sin internet"
        case .uploading: return "Subiendo"
        case .downloading: return "Bajando"
        case .checking: return "Revisando"
        case .idle: return sync.pending > 0 ? "\(sync.pending) por subir" : "Al día"
        }
    }
}
