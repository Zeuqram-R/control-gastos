import SwiftUI
import UniformTypeIdentifiers

/// Respaldo: bajar todo en Excel o JSON, y restaurar desde un JSON (igual que en la web).
/// Los respaldos quedan también en Archivos → En mi iPhone → Gastos → Respaldos.
struct RespaldoView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @State private var compartir: URL?
    @State private var elegir = false
    @State private var revision: Revision?
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                Button { hacer("xlsx") } label: { Label("Descargar Excel", systemImage: "tablecells") }
                Button { hacer("json") } label: { Label("Descargar copia completa (JSON)", systemImage: "doc.text") }
            } header: { Text("Respaldo") } footer: {
                Text("Todos los datos: el Excel trae una hoja por archivo (para verlos o sacar cuentas); el JSON es la copia completa que sirve para restaurar. También quedan guardados en Archivos → En mi iPhone → Gastos → Respaldos.")
            }
            Section {
                Button { elegir = true } label: { Label("Restaurar desde un respaldo…", systemImage: "arrow.counterclockwise") }
            } footer: { Text("Elegí un respaldo .json. Antes de cambiar nada se guarda una copia de cómo está ahora.") }
            if let error { Section { Text(error).foregroundStyle(Paleta.bad) } }
        }
        .navigationTitle("Respaldo").navigationBarTitleDisplayMode(.inline)
        .espacioBarra()
        .sheet(item: Binding(get: { compartir.map { Compartible(url: $0) } }, set: { compartir = $0?.url })) { CompartirSheet(items: [$0.url]) }
        .fileImporter(isPresented: $elegir, allowedContentTypes: [.json, .plainText, .data]) { r in
            guard let url = try? r.get() else { return }
            let ok = url.startAccessingSecurityScopedResource(); defer { if ok { url.stopAccessingSecurityScopedResource() } }
            guard let d = try? Data(contentsOf: url), let t = String(data: d, encoding: .utf8) else { error = "No se pudo leer ese archivo."; return }
            revisar(t, nombre: url.lastPathComponent)
        }
        .sheet(item: $revision) { RestaurarSheet(rev: $0) { guardar("json", sufijo: "-antes-de-restaurar") } }
    }

    struct Compartible: Identifiable { let url: URL; var id: String { url.path } }

    private func claves() -> [String] {
        guard let d = try? Core.shared.vista("clavesRespaldo", d: "{}", args: []), let k = try? JSONDecoder().decode([String].self, from: d) else { return [] }
        return k
    }

    /// Arma el respaldo y lo guarda en Documentos/Respaldos. Devuelve la ruta.
    @discardableResult
    private func guardar(_ formato: String, sufijo: String = "") -> URL? {
        let D = sync.D(claves())
        let meta: [String: Any] = ["fecha": isoFmt.string(from: Date()), "por": sync.config?.persona ?? "", "dispositivo": sync.config?.dispositivo ?? ""]
        guard let data = try? Core.shared.vista("respaldo", d: D, args: [formato, meta]) else { error = "No se pudo armar el respaldo."; return nil }
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Respaldos", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("control-de-gastos-\(Fmt.hoyCR())\(sufijo).\(formato)")
        if formato == "json" {
            struct R: Decodable { let texto: String }
            guard let r = try? JSONDecoder().decode(R.self, from: data) else { return nil }
            try? Data(r.texto.utf8).write(to: url, options: .atomic)
        } else {
            struct R: Decodable { let archivos: [[String]] }
            guard let r = try? JSONDecoder().decode(R.self, from: data) else { return nil }
            try? Zip.stored(r.archivos.map { ($0[0], Data($0[1].utf8)) }).write(to: url, options: .atomic)
        }
        return url
    }

    private func hacer(_ formato: String) {
        error = nil
        if let u = guardar(formato) { compartir = u }
    }

    private func revisar(_ texto: String, nombre: String) {
        error = nil
        guard let data = try? Core.shared.vista("revisarRespaldo", d: sync.D(claves()), args: [texto]),
              let r = try? JSONDecoder().decode(Revision.self, from: data) else { error = "No se pudo leer ese respaldo."; return }
        if let e = r.error { error = e; return }
        var rr = r; rr.nombre = nombre
        revision = rr
    }
}

struct Revision: Decodable, Identifiable {
    struct Meta: Decodable { let fecha: String?; let por: String? }
    struct Parte: Decodable, Identifiable { var id: String { k }; let k: String; let t: String; let marcada: Bool; let sub: String; let texto: String }
    var id: String { (meta?.fecha ?? "") + (nombre ?? "") }
    let error: String?
    let meta: Meta?
    let partes: [Parte]?
    var nombre: String?
    private enum CodingKeys: String, CodingKey { case error, meta, partes }
}

struct RestaurarSheet: View {
    let rev: Revision
    let copiaAntes: () -> URL?
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @Environment(\.dismiss) private var dismiss
    @State private var sel: Set<String> = []
    @State private var confirmar = false

    private var fecha: Date? { rev.meta?.fecha.flatMap { isoFmt.date(from: $0) ?? ISO8601DateFormatter().date(from: $0) } }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if let f = fecha {
                        Text("Respaldo del \(f.formatted(.dateTime.day().month(.wide).year().locale(Locale(identifier: "es_CR")))), \(f.formatted(.dateTime.hour().minute().locale(Locale(identifier: "es_CR"))))\(rev.meta?.por.map { ", hecho por \($0)" } ?? "").")
                    } else { Text("Respaldo sin fecha (de una versión anterior de la app).") }
                    Text("Lo que marqués se reemplaza en GitHub por lo del respaldo, para todos los aparatos. Antes de cambiar nada guardo una copia de cómo está ahora, por si querés volver.")
                        .font(.footnote).foregroundStyle(.secondary)
                    if sync.pending > 0 {
                        Text("Hay \(sync.pending) cambio(s) de este aparato sin subir. Esperá a que diga \"Al día\" antes de restaurar.").foregroundStyle(Paleta.bad)
                    }
                }
                Section("Partes") {
                    ForEach(rev.partes ?? []) { p in
                        Button {
                            if sel.contains(p.k) { sel.remove(p.k) } else { sel.insert(p.k) }
                        } label: {
                            HStack {
                                Image(systemName: sel.contains(p.k) ? "checkmark.square.fill" : "square").foregroundStyle(sel.contains(p.k) ? Paleta.ok : .secondary)
                                VStack(alignment: .leading, spacing: 2) { Text(p.t); Text(p.sub).font(.caption).foregroundStyle(.secondary) }
                            }.contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                }
                Section {
                    Button("Restaurar lo marcado", role: .destructive) { confirmar = true }
                        .disabled(sel.isEmpty || sync.pending > 0)
                }
            }
            .navigationTitle("Restaurar un respaldo").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } } }
            .confirmationDialog("¿Reemplazar \(sel.count) parte(s) con lo del respaldo? Esto cambia los datos en todos los aparatos.", isPresented: $confirmar, titleVisibility: .visible) {
                Button("Reemplazar", role: .destructive) { restaurar() }
            }
            .onAppear { sel = Set((rev.partes ?? []).filter(\.marcada).map(\.k)) }
        }
    }

    private func restaurar() {
        _ = copiaAntes()
        let partes = (rev.partes ?? []).filter { sel.contains($0.k) }
        let files = partes.map { (path: "data/\($0.k).json", b64: Data($0.texto.utf8).base64EncodedString()) }
        let cfg = sync.config
        let f = fecha.map { " del \(Periodos.iso(GastoSheet.utc($0)))" } ?? ""
        sync.subir(files, message: "\(cfg?.persona ?? "") (\(cfg?.dispositivo ?? "")): restaura respaldo\(f) (\(partes.map(\.k).joined(separator: ", ")))", resumen: "Restaurar respaldo")
        nav.avisar("Restaurando… en unos segundos se ve en todos los aparatos.")
        dismiss()
    }
}

/// Hoja de compartir de iOS (Guardar en Archivos, AirDrop, WhatsApp…).
struct CompartirSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// ZIP sin compresión (un .xlsx es un ZIP con XML adentro), igual al de js/respaldo.js.
enum Zip {
    private static let tabla: [UInt32] = (0..<256).map { n -> UInt32 in
        var c = UInt32(n)
        for _ in 0..<8 { c = (c & 1) != 0 ? 0xedb88320 ^ (c >> 1) : c >> 1 }
        return c
    }
    static func crc32(_ d: Data) -> UInt32 {
        var c: UInt32 = 0xffffffff
        for b in d { c = tabla[Int((c ^ UInt32(b)) & 0xff)] ^ (c >> 8) }
        return c ^ 0xffffffff
    }
    static func stored(_ files: [(String, Data)]) -> Data {
        var out = Data(), central = Data()
        func u16(_ v: Int, _ d: inout Data) { var x = UInt16(v).littleEndian; d.append(Data(bytes: &x, count: 2)) }
        func u32(_ v: UInt32, _ d: inout Data) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
        for (name, data) in files {
            let n = Data(name.utf8), c = crc32(data), off = UInt32(out.count)
            u32(0x04034b50, &out); u16(20, &out); u16(0x0800, &out); u16(0, &out); u16(0, &out); u16(0, &out)
            u32(c, &out); u32(UInt32(data.count), &out); u32(UInt32(data.count), &out); u16(n.count, &out); u16(0, &out)
            out.append(n); out.append(data)
            u32(0x02014b50, &central); u16(20, &central); u16(20, &central); u16(0x0800, &central); u16(0, &central); u16(0, &central); u16(0, &central)
            u32(c, &central); u32(UInt32(data.count), &central); u32(UInt32(data.count), &central); u16(n.count, &central)
            u16(0, &central); u16(0, &central); u16(0, &central); u16(0, &central); u32(0, &central); u32(off, &central)
            central.append(n)
        }
        let inicio = UInt32(out.count)
        out.append(central)
        u32(0x06054b50, &out); u16(0, &out); u16(0, &out); u16(files.count, &out); u16(files.count, &out)
        u32(UInt32(central.count), &out); u32(inicio, &out); u16(0, &out)
        return out
    }
}
