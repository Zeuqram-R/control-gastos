import SwiftUI
import PhotosUI

/// Metas de ahorro y lista de deseos.
struct MetasView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @EnvironmentObject var nav: AppNav
    @State private var vm: MetasVM?
    @State private var error: String?
    @State private var nueva: NuevaMetaPre?
    @State private var apartarMeta: MetasVM.Meta?
    @State private var opciones: MetasVM.Meta?
    @State private var deseo: DeseoEdit?
    @State private var alcanza: MetasVM.Deseo?

    private struct Clave: Equatable { let v: Int; let o: Bool; let h: String }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let vm { contenido(vm) }
                else if let error { Tarjeta { Text(error).foregroundStyle(Paleta.bad) } }
                else { HStack { Spacer(); ProgressView(); Spacer() }.padding(.top, 60) }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
            .frame(maxWidth: 820).frame(maxWidth: .infinity)
        }
        .background(Color(.systemGroupedBackground))
        .espacioBarra()
        .refreshable { await sync.runSync() }
        .sheet(item: $nueva) { NuevaMetaSheet(pre: $0) }
        .sheet(item: $apartarMeta) { ApartarSheet(meta: $0) }
        .sheet(item: $opciones) { OpcionesMetaSheet(meta: $0) }
        .sheet(item: $deseo) { DeseoSheet(edit: $0) }
        .sheet(item: $alcanza) { d in AlcanzaSheet(nombre: d.nombre, montoInicial: d.precio.map { String(Int($0)) }) }
        .task(id: Clave(v: sync.version, o: prefs.ocultar, h: Fmt.hoyCR())) {
            guard sync.hasData else { return }
            switch await vistaAsync(MetasVM.self, "metas", sync.D(CLAVES_RESUMEN + ["deseos"]), [Fmt.hoyCR()], ocultar: prefs.ocultar) {
            case .success(let v): vm = v; error = nil
            case .failure(let e): error = "No se pudo armar Metas: \(e.localizedDescription)"
            }
        }
    }

    @ViewBuilder private func contenido(_ vm: MetasVM) -> some View {
        Text("Cada meta te dice cuánto apartar por quincena hasta la fecha. Lo apartado de la quincena se resta de lo que queda libre, y lo que falta se resta en la proyección de las próximas.")
            .font(.caption).foregroundStyle(.secondary).padding(.top, 6)
        if !vm.tiles.isEmpty {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8, alignment: .top), GridItem(.flexible(), spacing: 8, alignment: .top)], spacing: 8) {
                ForEach(vm.tiles) { t in StatView(s: Stat.simple(t.lbl, t.num, t.sub)) }
            }
        }
        Button { nueva = NuevaMetaPre() } label: { Label("Nueva meta", systemImage: "flag").bold().frame(maxWidth: .infinity).padding(.vertical, 4) }
            .buttonStyle(.borderedProminent).tint(Paleta.ok)
        if vm.metas.isEmpty {
            Tarjeta { Text("Sin metas todavía. Creá una (por ejemplo, juntar para diciembre) y te digo cuánto apartar cada quincena.").foregroundStyle(.secondary) }
        }
        ForEach(vm.metas) { m in
            Tarjeta {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) { Text(m.nombre).font(.headline); Text(m.sub).font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                    Button { opciones = m } label: { Image(systemName: "ellipsis.circle").font(.title3) }.accessibilityLabel("Más opciones")
                }
                ProgressView(value: m.pct).tint(Paleta.ok)
                StatGrid(stats: m.stats)
                if !m.lista {
                    Button { apartarMeta = m } label: { Text("Apartar").bold().frame(maxWidth: .infinity) }.buttonStyle(.bordered).tint(Paleta.ok)
                }
            }
        }
        // Lista de deseos
        HStack {
            Titulo(texto: "Lista de deseos")
            Button { deseo = DeseoEdit(d: nil) } label: { Label("Agregar", systemImage: "plus") }.buttonStyle(.bordered).controlSize(.small)
        }
        Tarjeta {
            if vm.deseos.lista.isEmpty {
                Text("Anoten aquí lo que quieren comprar más adelante. Cuando se decidan por algo, lo convierten en meta con un toque o revisan si les alcanza.").foregroundStyle(.secondary)
            } else {
                Text(vm.deseos.nota).font(.caption).foregroundStyle(.secondary)
            }
            ForEach(vm.deseos.lista) { d in
                HStack(spacing: 10) {
                    ZStack(alignment: .topTrailing) {
                        FotoView(path: d.foto, size: 48)
                        Circle().fill(d.prioridad == 1 ? Paleta.bad : d.prioridad == 2 ? Paleta.warn : .gray).frame(width: 10, height: 10).offset(x: 3, y: -3)
                    }
                    Button { deseo = DeseoEdit(d: d) } label: {
                        VStack(alignment: .leading, spacing: 2) { Text(d.nombre).multilineTextAlignment(.leading); Text(d.sub).font(.caption).foregroundStyle(.secondary) }
                            .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(d.precioTxt).bold().monospacedDigit()
                        HStack(spacing: 4) {
                            if d.precio != nil { Button("¿Alcanza?") { alcanza = d }.buttonStyle(.bordered).controlSize(.mini) }
                            Button("Meta") { nueva = NuevaMetaPre(nombre: d.nombre, monto: d.precio.map { String(Int($0)) } ?? "", deseo: d.id) }
                                .buttonStyle(.borderedProminent).tint(Paleta.ok).controlSize(.mini)
                        }
                    }
                }
                Divider()
            }
            if !vm.deseos.hechos.isEmpty {
                DisclosureGroup("Cumplidos (\(vm.deseos.hechos.count))") {
                    ForEach(vm.deseos.hechos) { h in
                        HStack { VStack(alignment: .leading) { Text(h.nombre); Text(h.sub).font(.caption).foregroundStyle(.secondary) }; Spacer(); Text(h.precio) }
                    }
                }.font(.subheadline)
            }
        }
        if !vm.archivadas.isEmpty {
            Tarjeta {
                DisclosureGroup("Metas archivadas (\(vm.archivadas.count))") {
                    ForEach(vm.archivadas) { m in
                        HStack {
                            VStack(alignment: .leading) { Text(m.nombre); Text(m.sub).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Button("Reactivar") { sync.mutate("metas", kind: "patch", record: jsonObj([("id", m.id), ("estado", "activa")]), summary: "vuelve meta \(m.nombre)") }
                                .buttonStyle(.bordered).controlSize(.small)
                        }
                    }
                }.font(.subheadline)
            }
        }
    }
}

extension Stat {
    static func simple(_ lbl: String, _ num: String, _ sub: String?) -> Stat {
        let j = jsonObj([("lbl", lbl), ("num", num), ("sub", sub)])
        return try! JSONDecoder().decode(Stat.self, from: Data(j.utf8))
    }
}

struct NuevaMetaPre: Identifiable { let id = UUID(); var nombre = ""; var monto = ""; var deseo: String? = nil }
struct DeseoEdit: Identifiable { let id = UUID(); let d: MetasVM.Deseo? }

struct NuevaMetaSheet: View {
    let pre: NuevaMetaPre
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @Environment(\.dismiss) private var dismiss
    @State private var nombre = ""
    @State private var monto = ""
    @State private var fecha = Date().addingTimeInterval(86400 * 30)
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("¿Para qué?") { TextField("Diciembre, colchón, viaje…", text: $nombre) }
                Section("Cuánto (₡)") { TextField("0", text: $monto).keyboardType(.numberPad).font(.title3.bold()) }
                Section {
                    DatePicker("¿Para cuándo?", selection: $fecha, in: Date().addingTimeInterval(86400)..., displayedComponents: .date)
                } footer: { Text("Te digo cuánto apartar cada quincena y lo resto en la proyección de las próximas.") }
                if let error { Section { Text(error).foregroundStyle(Paleta.bad) } }
            }
            .navigationTitle(pre.deseo != nil ? "Meta para «\(pre.nombre)»" : "Nueva meta de ahorro").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Crear") { crear() }.bold() }
            }
            .onAppear { nombre = pre.nombre; monto = pre.monto }
        }
    }

    private func crear() {
        var st: [String: Any] = ["nombre": nombre, "monto": monto, "fecha": Periodos.iso(GastoSheet.utc(fecha))]
        if let d = pre.deseo { st["deseo"] = d }
        guard let a = armar("nuevaMeta", "{}", [st, Fmt.hoyCR(), sync.config?.persona ?? "Jose", nuevoId("M")]) else { return }
        if let e = a.error { error = e; return }
        guard let rec = a.recText else { return }
        sync.mutate("metas", kind: "upsert", record: rec, summary: a.summary ?? "nueva meta")
        if let dt = a.deseoText { sync.mutate("deseos", kind: "patch", record: dt, summary: a.deseoSummary ?? "") }
        nav.avisar("Meta creada.")
        dismiss()
    }
}

struct ApartarSheet: View {
    let meta: MetasVM.Meta
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @Environment(\.dismiss) private var dismiss
    @State private var monto = ""
    @State private var de = "Salario"
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(meta.estaQ > 0 ? String(Int(meta.estaQ)) : "0", text: $monto).keyboardType(.numberPad).font(.title2.bold())
                } header: { Text("Cuánto (₡)") } footer: { if let s = meta.sugerido { Text(s) } }
                Section {
                    Picker("", selection: $de) { Text("De la quincena").tag("Salario"); Text("Ya estaba ahorrado").tag("Fondo") }.pickerStyle(.segmented)
                } header: { Text("¿De dónde sale?") } footer: { Text("Si sale de la quincena, se resta de lo que queda libre y se suma al fondo de ahorro.") }
                if let error { Section { Text(error).foregroundStyle(Paleta.bad) } }
            }
            .navigationTitle("Apartar para «\(meta.nombre)»").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Apartar") { guardar() }.bold() }
            }
        }
        .presentationDetents([.medium])
    }

    private func guardar() {
        guard let a = armar("apartar", sync.D(CLAVES_RESUMEN), [meta.id, monto, de, Fmt.hoyCR(), sync.config?.persona ?? "Jose"]) else { return }
        if let e = a.error { error = e; return }
        guard let rec = a.recText else { return }
        sync.mutate("metas", kind: "patch", record: rec, summary: a.summary ?? "aparta")
        if let f = a.fondoText { sync.mutate("cuentas", kind: "patch", record: f, summary: a.fondoSummary ?? "fondo") }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        nav.avisar(a.toast ?? "Apartado.")
        dismiss()
    }
}

struct OpcionesMetaSheet: View {
    let meta: MetasVM.Meta
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section("Lo apartado") {
                    if meta.aportes.isEmpty { Text("Todavía no se ha apartado nada.").foregroundStyle(.secondary) }
                    ForEach(meta.aportes) { a in
                        HStack { VStack(alignment: .leading) { Text(a.titulo); Text(a.sub).font(.caption).foregroundStyle(.secondary) }; Spacer(); Text(a.monto).monospacedDigit() }
                    }
                }
                Section {
                    Button(meta.quitarLbl, role: meta.lista ? nil : .destructive) {
                        let s = sync, m = meta
                        s.mutate("metas", kind: "patch", record: jsonObj([("id", m.id), ("estado", "archivada")]), summary: "archiva meta \(m.nombre)")
                        nav.avisar("Meta «\(m.nombre)» quitada.", accion: "Deshacer") {
                            s.mutate("metas", kind: "patch", record: jsonObj([("id", m.id), ("estado", "activa")]), summary: "vuelve meta \(m.nombre)")
                        }
                        dismiss()
                    }
                }
            }
            .navigationTitle("«\(meta.nombre)»").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

struct DeseoSheet: View {
    let edit: DeseoEdit
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @Environment(\.dismiss) private var dismiss
    @State private var nombre = ""
    @State private var precio = ""
    @State private var prioridad = 2
    @State private var para = "Ambos"
    @State private var nota = ""
    @State private var foto: UIImage?
    @State private var quitarFoto = false
    @State private var item: PhotosPickerItem?
    @State private var camara = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("¿Qué?") { TextField("Zapatos, freidora de aire, viaje a la playa…", text: $nombre) }
                Section("Precio aproximado (₡)") { TextField("0", text: $precio).keyboardType(.numberPad) }
                Section("¿Qué tan pronto?") {
                    Picker("", selection: $prioridad) { Text("Ya").tag(1); Text("Pronto").tag(2); Text("Algún día").tag(3) }.pickerStyle(.segmented)
                }
                Section("¿Para quién?") {
                    Picker("", selection: $para) { Text("Los dos").tag("Ambos"); Text("Jose").tag("Jose"); Text("Ali").tag("Ali") }.pickerStyle(.segmented)
                }
                Section("Foto (opcional)") {
                    HStack(spacing: 12) {
                        if let foto { Image(uiImage: foto).resizable().scaledToFill().frame(width: 64, height: 64).clipShape(RoundedRectangle(cornerRadius: 10)) }
                        else if let f = edit.d?.foto, !quitarFoto { FotoView(path: f, size: 64) }
                        VStack(alignment: .leading, spacing: 6) {
                            PhotosPicker(selection: $item, matching: .images) { Label("Elegir foto", systemImage: "photo") }
                            Button { camara = true } label: { Label("Tomar foto", systemImage: "camera") }
                            if foto != nil || (edit.d?.foto != nil && !quitarFoto) { Button("Quitar", role: .destructive) { foto = nil; quitarFoto = true } }
                        }
                    }
                }
                Section("Nota") { TextField("Dónde lo vieron, link, para quién… (opcional)", text: $nota) }
                if let error { Section { Text(error).foregroundStyle(Paleta.bad) } }
                if let d = edit.d {
                    Section {
                        Button("Ya lo compramos") {
                            sync.mutate("deseos", kind: "patch", record: jsonObj([("id", d.id), ("estado", "comprado"), ("comprado", Fmt.hoyCR())]), summary: "deseo comprado: \(d.nombre)")
                            nav.avisar("¡Listo! «\(d.nombre)» marcado como comprado."); dismiss()
                        }
                        Button("Quitar de la lista", role: .destructive) {
                            let s = sync
                            s.mutate("deseos", kind: "delete", id: d.id, summary: "quita deseo: \(d.nombre)")
                            nav.avisar("Quitado: \(d.nombre)", accion: "Deshacer") { s.mutate("deseos", kind: "upsert", record: d.raw, summary: "vuelve deseo: \(d.nombre)") }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(edit.d == nil ? "Agregar a la lista de deseos" : "Editar deseo").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(edit.d == nil ? "Agregar" : "Guardar") { guardar() }.bold() }
            }
            .onChange(of: item) { _, it in
                Task { if let d = try? await it?.loadTransferable(type: Data.self), let i = UIImage(data: d) { foto = i; quitarFoto = false } }
            }
            .fullScreenCover(isPresented: $camara) { Camara { foto = $0; quitarFoto = false }.ignoresSafeArea() }
            .onAppear {
                if let d = edit.d { nombre = d.nombre; precio = d.precio.map { String(Int($0)) } ?? ""; prioridad = d.prioridad; para = d.para; nota = d.nota }
            }
        }
    }

    private func guardar() {
        let id = edit.d?.id ?? nuevoId("W")
        var ruta: Any = NSNull()
        var datos: Data?
        if let f = foto, let jpg = f.jpeg(max: 1200, calidad: 0.82) {
            let r = "fotos/deseos/\(id)-\(SyncEngine.b36(Date().timeIntervalSince1970 * 1000)).jpg"
            ruta = r; datos = jpg
        } else if quitarFoto { ruta = "" }
        let st: [String: Any] = ["id": edit.d?.id ?? NSNull(), "nombre": nombre, "precio": precio, "prioridad": prioridad, "para": para, "nota": nota]
        guard let a = armar("guardarDeseo", sync.D(["deseos"]), [st, Fmt.hoyCR(), sync.config?.persona ?? "Jose", id, ruta]) else { return }
        if let e = a.error { error = e; return }
        guard let rec = a.recText else { return }
        if let r = ruta as? String, !r.isEmpty, let d = datos {
            if let img = UIImage(data: d) { sync.fotoLocal(r, img) }
            sync.subir([(path: r, b64: d.base64EncodedString())], message: "\(sync.config?.persona ?? "Jose"): foto del deseo «\(a.nombre ?? nombre)»", resumen: "Foto: \(a.nombre ?? nombre)")
        }
        sync.mutate("deseos", kind: "upsert", record: rec, summary: a.summary ?? "deseo")
        nav.avisar(edit.d == nil ? "Agregado a la lista de deseos." : "Deseo actualizado.")
        dismiss()
    }
}
