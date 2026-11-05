import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Facturas: tomarle foto (o elegirla), subirla para que Claude la procese, ver cómo van y contestar sus preguntas.
struct FacturasView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @EnvironmentObject var nav: AppNav
    @State private var vm: FacturasVM?
    @State private var fotos: [Adjunto] = []
    @State private var lugar = ""
    @State private var fuente = "Salario"
    @State private var quien = "Jose"
    @State private var nota = ""
    @State private var negocio = false
    @State private var subiendo = false
    @State private var camara = false
    @State private var items: [PhotosPickerItem] = []
    @State private var pdf = false
    @State private var respuestas: [String: String] = [:]

    struct Adjunto: Identifiable { let id = UUID(); let datos: Data; let ext: String; let vista: UIImage? }

    private let fuentesCasa = ["Salario", "Wink", "BofA", "Préstamo", "Efectivo"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let vm, !vm.preguntas.isEmpty { preguntas(vm.preguntas) }
                subir
                if let vm { estado(vm) }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
            .frame(maxWidth: 820).frame(maxWidth: .infinity)
        }
        .background(Color(.systemGroupedBackground))
        .espacioBarra()
        .navigationTitle("Facturas").navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $camara) { Camara { agregar($0) }.ignoresSafeArea() }
        .fileImporter(isPresented: $pdf, allowedContentTypes: [.pdf, .image], allowsMultipleSelection: true) { r in
            for url in (try? r.get()) ?? [] {
                let ok = url.startAccessingSecurityScopedResource(); defer { if ok { url.stopAccessingSecurityScopedResource() } }
                guard let d = try? Data(contentsOf: url) else { continue }
                if let i = UIImage(data: d) { agregar(i) } else { fotos.append(Adjunto(datos: d, ext: url.pathExtension.lowercased().isEmpty ? "pdf" : url.pathExtension.lowercased(), vista: nil)) }
            }
        }
        .onChange(of: items) { _, nuevos in
            Task {
                for it in nuevos { if let d = try? await it.loadTransferable(type: Data.self), let i = UIImage(data: d) { agregar(i) } }
                items = []
            }
        }
        .onAppear { quien = sync.config?.persona ?? "Jose" }
        .task(id: sync.version) {
            let bandeja = Set(sync.photoPaths("bandeja/").filter { $0.hasSuffix("/factura.json") }.map { $0.split(separator: "/")[1] }).map(String.init).sorted()
            if case .success(let v) = await vistaAsync(FacturasVM.self, "facturas", sync.D(["pendientes", "facturas", "lugares"]), [bandeja], ocultar: prefs.ocultar) { vm = v }
        }
    }

    private func agregar(_ img: UIImage) {
        // Máx. 2000 px, JPEG, como la web.
        guard let d = img.jpeg(max: 2000, calidad: 0.85) else { return }
        fotos.append(Adjunto(datos: d, ext: "jpg", vista: img))
    }

    private var subir: some View {
        Tarjeta {
            Text("Subir una factura").font(.headline)
            Text("Tomale foto (o elegila de tus fotos o archivos). Claude la lee en GitHub, anota el gasto y los productos, y si tiene dudas te pregunta aquí. Funciona sin internet: se sube sola cuando vuelva.")
                .font(.caption).foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(fotos) { f in
                        ZStack(alignment: .topTrailing) {
                            Group {
                                if let v = f.vista { Image(uiImage: v).resizable().scaledToFill() }
                                else { Text(f.ext.uppercased()).font(.headline).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(.tertiarySystemFill)) }
                            }
                            .frame(width: 84, height: 110).clipShape(RoundedRectangle(cornerRadius: 10))
                            Button { fotos.removeAll { $0.id == f.id } } label: { Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.white, .black.opacity(0.6)) }
                                .padding(3).accessibilityLabel("Quitar")
                        }
                    }
                }
            }
            HStack {
                Button { camara = true } label: { Label("Tomar foto", systemImage: "camera.fill").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).tint(Paleta.ok)
                PhotosPicker(selection: $items, maxSelectionCount: 10, matching: .images) { Label("Fotos", systemImage: "photo").frame(maxWidth: .infinity) }.buttonStyle(.bordered)
                Button { pdf = true } label: { Label("Archivo", systemImage: "doc").frame(maxWidth: .infinity) }.buttonStyle(.bordered)
            }.controlSize(.regular)
            VStack(alignment: .leading, spacing: 4) {
                Text("Dónde").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                TextField("Walmart, el chino, la feria…", text: $lugar)
                    .padding(10).background(RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemGroupedBackground)))
                let sug = (vm?.lugares ?? []).filter { !lugar.isEmpty && normal($0).hasPrefix(normal(lugar)) && $0 != lugar }.prefix(4)
                if !sug.isEmpty { HStack { ForEach(Array(sug), id: \.self) { l in Button(l) { lugar = l }.buttonStyle(.bordered).controlSize(.small) } } }
            }
            Toggle("Es de Santo Coco 🥥", isOn: $negocio).onChange(of: negocio) { _, v in fuente = v ? "Caja Santo Coco" : "Salario" }
            Text("Cómo se pagó").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Chips(opciones: negocio ? ["Caja Santo Coco"] + fuentesCasa : fuentesCasa, sel: Binding(get: { fuente }, set: { fuente = $0 ?? fuente }))
            Text("Quién pagó").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Picker("", selection: $quien) { Text("Jose").tag("Jose"); Text("Ali").tag("Ali") }.pickerStyle(.segmented)
            TextField("Algo que deba saber (opcional)", text: $nota)
                .padding(10).background(RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemGroupedBackground)))
            Button { enviar() } label: { Text(subiendo ? "Preparando…" : "Subir factura").bold().frame(maxWidth: .infinity).padding(.vertical, 4) }
                .buttonStyle(.borderedProminent).tint(Paleta.blue).disabled(subiendo || fotos.isEmpty)
        }
    }

    private func enviar() {
        guard !fotos.isEmpty, let cfg = sync.config else { nav.avisar("Elegí al menos una foto de la factura."); return }
        subiendo = true
        let id = "\(Fmt.hoyCR())-\(SyncEngine.b36(Date().timeIntervalSince1970 * 1000))"
        var files: [(path: String, b64: String)] = [], nombres: [String] = []
        for (i, f) in fotos.enumerated() {
            let n = "foto-\(i + 1).\(f.ext)"
            nombres.append(n)
            files.append((path: "bandeja/\(id)/\(n)", b64: f.datos.base64EncodedString()))
        }
        let st: [String: Any] = ["lugar": lugar, "fuente": fuente, "quien": quien, "nota": nota, "negocio": negocio]
        guard let a = armar("fichaFactura", "{}", [st, cfg.persona, cfg.dispositivo, id, nombres, isoFmt.string(from: Date())]),
              let texto = a.texto else { subiendo = false; return }
        files.append((path: "bandeja/\(id)/factura.json", b64: Data(texto.utf8).base64EncodedString()))
        sync.subir(files, message: a.message ?? "factura", resumen: a.resumen ?? "Factura")
        fotos = []; lugar = ""; nota = ""; negocio = false; fuente = "Salario"; subiendo = false
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        nav.avisar("Factura en camino. Te aviso aquí cuando esté lista.")
    }

    private func estado(_ vm: FacturasVM) -> some View {
        Tarjeta {
            Text("Facturas").font(.headline)
            if sync.uploads.isEmpty && vm.bandeja.isEmpty && vm.lista.isEmpty {
                Text("Todavía no se ha subido ninguna factura desde la app.").foregroundStyle(.secondary)
            }
            ForEach(sync.uploads, id: \.id) { u in fila("wait", u.resumen.isEmpty ? "Factura" : u.resumen, "En este aparato, esperando internet · \(Fmt.hace(iso: u.at))", nil) }
            ForEach(vm.bandeja) { b in fila("work", b.titulo, b.sub, nil) }
            ForEach(vm.lista) { f in fila(f.estado, f.titulo, f.sub, f.total) }
        }
    }

    private func fila(_ estado: String, _ t: String, _ s: String, _ total: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Circle().fill(estado == "ok" ? Paleta.ok : estado == "bad" ? Paleta.bad : estado == "work" ? Paleta.blue : .gray).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) { Text(t); Text(s).font(.caption).foregroundStyle(.secondary) }
            Spacer()
            if let total { Text(total).monospacedDigit() }
        }
    }

    private func preguntas(_ ps: [FacturasVM.Pregunta]) -> some View {
        Tarjeta {
            Text("Preguntas de Claude (\(ps.count))").font(.headline)
            Text("Contestá aquí; cualquiera de los dos puede hacerlo.").font(.caption).foregroundStyle(.secondary)
            ForEach(ps) { p in
                VStack(alignment: .leading, spacing: 6) {
                    Text(p.pregunta).font(.subheadline.weight(.semibold))
                    if let d = p.detalle { Text(d).font(.caption).foregroundStyle(.secondary) }
                    if !p.opciones.isEmpty {
                        FlowLayout(spacing: 6) { ForEach(p.opciones, id: \.self) { o in Button(o) { responder(p, o) }.buttonStyle(.bordered).controlSize(.small) } }
                    }
                    if p.texto {
                        HStack {
                            TextField("Otra respuesta…", text: Binding(get: { respuestas[p.id] ?? "" }, set: { respuestas[p.id] = $0 }))
                                .onSubmit { responder(p, respuestas[p.id] ?? "") }
                                .padding(8).background(RoundedRectangle(cornerRadius: 8).fill(Color(.tertiarySystemGroupedBackground)))
                            Button("Enviar") { responder(p, respuestas[p.id] ?? "") }.buttonStyle(.borderedProminent).tint(Paleta.ok).controlSize(.small)
                        }
                    }
                }
                .padding(.vertical, 4)
                Divider()
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Paleta.warn, lineWidth: 1.5))
    }

    private func responder(_ p: FacturasVM.Pregunta, _ txt: String) {
        guard let a = armar("respuesta", sync.D(["pendientes"]), [p.id, txt, sync.config?.persona ?? "Jose", isoFmt.string(from: Date())]),
              a.error == nil, let rec = a.recText else { return }
        sync.mutate("pendientes", kind: "patch", record: rec, summary: a.summary ?? "responde")
        respuestas[p.id] = nil
        nav.avisar("Respuesta enviada. Claude la aplica en unos minutos.")
    }
}
