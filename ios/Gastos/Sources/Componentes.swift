import SwiftUI

/// Navegación y avisos de toda la app.
@MainActor
final class AppNav: ObservableObject {
    @Published var tab: Tab = .resumen
    @Published var toast: Toast?
    @Published var gasto = false

    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let texto: String
        let accion: String?
        let fn: (() -> Void)?
        static func == (a: Toast, b: Toast) -> Bool { a.id == b.id }
    }

    func avisar(_ texto: String, accion: String? = nil, fn: (() -> Void)? = nil) {
        let t = Toast(texto: texto, accion: accion, fn: fn)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { toast = t }
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_500_000_000)
            if self?.toast?.id == t.id { withAnimation(.easeOut(duration: 0.25)) { self?.toast = nil } }
        }
    }
}

struct ToastView: View {
    @EnvironmentObject var nav: AppNav
    var body: some View {
        if let t = nav.toast {
            HStack(spacing: 12) {
                Text(t.texto).font(.subheadline.weight(.medium)).foregroundStyle(.white).lineLimit(2)
                Spacer(minLength: 0)
                if let a = t.accion, let fn = t.fn {
                    Button(a) { fn(); withAnimation { nav.toast = nil } }
                        .font(.subheadline.bold()).foregroundStyle(Paleta.moneda)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black.opacity(0.85)))
            .padding(.horizontal, 14)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .onTapGesture { withAnimation { nav.toast = nil } }
        }
    }
}

/// Tarjeta como las de la web.
struct Tarjeta<C: View>: View {
    var padding: CGFloat = 14
    @ViewBuilder var content: C
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(.secondarySystemGroupedBackground)))
    }
}

struct Titulo: View {
    let texto: String
    var body: some View { Text(texto).font(.title3.bold()).padding(.top, 8).frame(maxWidth: .infinity, alignment: .leading) }
}

func colorDe(_ s: String?) -> Color? {
    switch s {
    case "ok": return Paleta.ok
    case "bad": return Paleta.bad
    case "warn": return Paleta.warn
    default: return nil
    }
}

/// Un número con su etiqueta. Si trae fuente, se toca para ver de dónde sale.
struct StatView: View {
    let s: Stat
    var abrir: ((Fuente) -> Void)?
    var body: some View {
        let contenido = VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 2) {
                Text(s.lbl).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                if s.fuente != nil && abrir != nil { Text("›").font(.caption.bold()).foregroundStyle(.tertiary) }
            }
            Text(s.num).font(.title3.weight(.bold)).monospacedDigit().foregroundStyle(colorDe(s.color) ?? .primary)
                .minimumScaleFactor(0.7).lineLimit(1)
            if let sub = s.sub { Text(sub).font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(.tertiarySystemGroupedBackground)))
        if let f = s.fuente, let abrir {
            Button { abrir(f) } label: { contenido }.buttonStyle(.plain)
        } else { contenido }
    }
}

struct StatGrid: View {
    let stats: [Stat]
    var abrir: ((Fuente) -> Void)?
    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8, alignment: .top), GridItem(.flexible(), spacing: 8, alignment: .top)], spacing: 8) {
            ForEach(stats) { StatView(s: $0, abrir: abrir) }
        }
    }
}

/// Hoja "¿De dónde sale?".
struct FuenteSheet: View {
    let f: Fuente
    @EnvironmentObject var prefs: Prefs
    @Environment(\.dismiss) private var dismiss

    private func money(_ v: Double?, _ signo: String? = nil) -> String {
        guard let v else { return "—" }
        if prefs.ocultar { return Fmt.crc(0, hide: true) }
        return "\(signo ?? (v < 0 ? "−" : ""))\(Fmt.crc(abs(v)))"
    }

    var body: some View {
        NavigationStack {
            List {
                if let n = f.nota { Text(n).font(.footnote).foregroundStyle(.secondary) }
                ForEach(f.grupos) { g in
                    Section {
                        ForEach(g.lineas) { l in
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(l.nombre)
                                    if let s = l.sub, !s.isEmpty { Text(s).font(.caption).foregroundStyle(.secondary) }
                                }
                                Spacer()
                                Text(money(l.monto, l.signo)).monospacedDigit()
                            }
                        }
                        if g.lineas.isEmpty, let v = g.vacio { Text(v).font(.footnote).foregroundStyle(.secondary) }
                    } header: {
                        HStack {
                            if let s = g.signo { Text(s).bold().foregroundStyle(s == "−" ? Paleta.bad : Paleta.ok) }
                            Text(g.titulo)
                            Spacer()
                            if g.total != nil { Text(money(g.total)).bold().monospacedDigit() }
                        }
                    }
                }
                if let t = f.total {
                    Section {
                        HStack {
                            Text("= \(f.totalLbl ?? f.titulo)").bold()
                            Spacer()
                            Text(money(t)).bold().monospacedDigit().foregroundStyle(t < 0 ? Paleta.bad : .primary)
                        }
                    }
                }
            }
            .navigationTitle(f.titulo)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text("¿De dónde sale?").font(.caption2).foregroundStyle(.secondary)
                        Text(f.titulo).font(.headline).lineLimit(1)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) { Button("Listo") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

/// Barras horizontales simples (como bars() de la web).
struct Barras: View {
    let filas: [Barra]
    var color: Color = Paleta.ok
    @EnvironmentObject var prefs: Prefs
    var body: some View {
        let max = Swift.max(filas.map(\.total).max() ?? 1, 1)
        VStack(spacing: 6) {
            ForEach(filas) { r in
                HStack(spacing: 8) {
                    Text(r.label).font(.caption).frame(width: 110, alignment: .leading).lineLimit(1)
                    GeometryReader { g in
                        Capsule().fill(Color(.systemFill))
                            .overlay(alignment: .leading) { Capsule().fill(color).frame(width: g.size.width * r.total / max) }
                    }.frame(height: 8)
                    Text(prefs.crc(r.total)).font(.caption).monospacedDigit().frame(width: 78, alignment: .trailing)
                }
            }
        }
    }
}

struct Pill: View {
    let texto: String
    let tipo: String?
    var body: some View {
        Text(texto).font(.caption2.weight(.semibold))
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(Capsule().fill(fondo.opacity(0.16)))
            .foregroundStyle(fondo)
    }
    private var fondo: Color { tipo == "pend" ? Paleta.warn : tipo == "rec" ? Paleta.blue : .secondary }
}

struct FilaMov: View {
    let m: MovVM
    var buscar = ""
    @EnvironmentObject var prefs: Prefs
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text(marcado(m.titulo, buscar))
                Text(marcado(m.sub, buscar)).font(.caption).foregroundStyle(.secondary)
                if let p = m.pill { Pill(texto: p, tipo: m.pillTipo) }
            }
            Spacer()
            Text(prefs.crc(m.monto)).monospacedDigit()
        }
    }
}

/// Sin tildes ni mayúsculas, para buscar.
func normal(_ s: String) -> String { s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es")) }

/// Resalta lo buscado (sin importar tildes).
func marcado(_ texto: String, _ q: String) -> AttributedString {
    var a = AttributedString(texto)
    let qq = q.trimmingCharacters(in: .whitespaces)
    guard !qq.isEmpty else { return a }
    let t = normal(texto), n = normal(qq)
    guard t.count == texto.count else { return a }
    var desde = t.startIndex
    while let r = t.range(of: n, range: desde..<t.endIndex) {
        let i = t.distance(from: t.startIndex, to: r.lowerBound), len = t.distance(from: r.lowerBound, to: r.upperBound)
        let ai = a.index(a.startIndex, offsetByCharacters: i), aj = a.index(ai, offsetByCharacters: len)
        a[ai..<aj].backgroundColor = Paleta.moneda.opacity(0.45)
        desde = r.upperBound
    }
    return a
}

extension View {
    /// Deja libre el espacio de la barra flotante de abajo: lo último de la página se puede subir por encima de ella.
    func espacioBarra() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: 76) }
    }
}
