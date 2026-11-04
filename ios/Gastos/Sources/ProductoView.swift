import SwiftUI
import Charts

/// Perfil de un producto: precios, qué pasó con él, de quién es y dónde se guarda.
struct ProductoView: View {
    let clave: String
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @EnvironmentObject var nav: AppNav
    @State private var vm: ProductoVM?
    @State private var visor = false
    @State private var refri = false
    @State private var ubicacion = ""

    private struct Clave: Equatable { let v: Int; let o: Bool }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let vm, vm.error == nil { contenido(vm) }
                else if let e = vm?.error { Tarjeta { Text(e).foregroundStyle(.secondary) } }
                else { HStack { Spacer(); ProgressView(); Spacer() }.padding(.top, 60) }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
            .frame(maxWidth: 820).frame(maxWidth: .infinity)
        }
        .background(Color(.systemGroupedBackground))
        .espacioBarra()
        .navigationTitle(vm?.producto ?? "Producto")
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $visor) { VisorFoto(titulo: vm?.producto ?? "", grande: vm?.foto, mini: vm?.mini) }
        .sheet(isPresented: $refri) { if let vm { RefriSheet(vm: vm) { dias in guardarRefri(vm, dias) } } }
        .task(id: Clave(v: sync.version, o: prefs.ocultar)) {
            let d = sync.D(CLAVES_PRODUCTOS), hoy = Fmt.hoyCR(), oc = prefs.ocultar, c = clave
            let r = await Task.detached { try? JSONDecoder().decode(ProductoVM.self, from: try Core.shared.vista("producto", d: d, args: [hoy, c], ocultar: oc)) }.value
            if let r { vm = r; ubicacion = r.ubicacion ?? "" }
        }
    }

    @ViewBuilder private func contenido(_ vm: ProductoVM) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Button { if sync.photoExists(vm.foto ?? "") || sync.photoExists(vm.mini ?? "") { visor = true } } label: {
                FotoView(path: sync.photoExists(vm.foto ?? "") ? vm.foto : vm.mini, size: 110, radius: 16)
            }.buttonStyle(.plain).accessibilityLabel("Ver foto")
            VStack(alignment: .leading, spacing: 8) {
                Text(vm.producto ?? "").font(.title3.bold())
                FlowLayout(spacing: 6) { ForEach(vm.tags ?? [], id: \.self) { Pill(texto: $0, tipo: nil) } }
            }
        }
        .padding(.top, 6)

        if let n = vm.nombres, !n.isEmpty {
            Tarjeta {
                Text("Cómo se llama en cada lugar").font(.headline)
                Text("El nombre de arriba es el normalizado; estos son los que salen en los tiquetes o como lo llaman en cada lugar.").font(.caption).foregroundStyle(.secondary)
                ForEach(n) { x in VStack(alignment: .leading, spacing: 2) { Text(x.lugar); Text(x.nombres).font(.caption).foregroundStyle(.secondary) } }
            }
        }

        Tarjeta { StatGrid(stats: vm.stats ?? []) }

        Tarjeta {
            Text("¿Qué pasó con él?").font(.headline)
            Text("Avisá aquí y se actualizan la lista y los perecederos.").font(.caption).foregroundStyle(.secondary)
            Button { refri = true } label: { Text("🧊 Lo guardamos en la refri").frame(maxWidth: .infinity) }.buttonStyle(.bordered)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach([("terminado", "Se acabó"), ("congelado", "Lo congelamos"), ("cocinado", "Lo cocinamos"), ("botado", "Se botó")], id: \.0) { t, l in
                    Button { evento(vm, t, dias: t == "cocinado" ? 3 : nil) } label: { Text(l).frame(maxWidth: .infinity) }.buttonStyle(.bordered)
                }
            }
            Button { agregarLista(vm) } label: { Text(vm.enLista == true ? "Ya está en la lista" : "Agregar a la lista").bold().frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(Paleta.ok).disabled(vm.enLista == true)
            ForEach(vm.eventos ?? []) { e in
                VStack(alignment: .leading, spacing: 2) { Text(e.titulo).font(.subheadline); Text(e.sub).font(.caption).foregroundStyle(.secondary) }
            }
        }

        Tarjeta {
            Text("Precio por lugar").font(.headline)
            Text("Precio por unidad (o por kilo) en cada compra; una línea por lugar.").font(.caption).foregroundStyle(.secondary)
            grafico(vm.puntos ?? [])
            ForEach(vm.porLugar ?? []) { l in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) { Text(l.lugar); Text(l.sub).font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                    if let c = l.cambio { Text(c.texto).font(.caption.bold()).foregroundStyle(c.dir == "up" ? Paleta.bad : c.dir == "down" ? Paleta.ok : .secondary) }
                    else { Text("—").foregroundStyle(.secondary) }
                }
            }
        }

        Tarjeta {
            Text("De quién es y dónde se guarda").font(.headline)
            Picker("De", selection: Binding(get: { vm.dueno ?? "Casa" }, set: { d in
                if d != vm.dueno { patch(vm, [("dueno", d)], "\(vm.producto ?? ""): de \(d)") }
            })) { Text("Casa").tag("Casa"); Text("Ali").tag("Ali"); Text("Jose").tag("Jose") }
                .pickerStyle(.segmented)
            HStack {
                TextField("Refri, congelador, alacena…", text: $ubicacion).onSubmit { guardarUbicacion(vm) }
                    .padding(10).background(RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemGroupedBackground)))
                Menu {
                    ForEach(vm.ubicaciones ?? [], id: \.self) { u in Button(u) { ubicacion = u; guardarUbicacion(vm) } }
                } label: { Image(systemName: "chevron.down.circle").font(.title3) }
            }
            Text("Se guarda en: \((vm.ubicacion ?? "").isEmpty ? "—" : vm.ubicacion!)").font(.caption).foregroundStyle(.secondary)
        }

        Tarjeta {
            Text("Cuánto dura").font(.headline)
            if (vm.duraciones ?? []).isEmpty { Text("Cuando avisen que se acabó, aquí sale cuántos días duró.").font(.subheadline).foregroundStyle(.secondary) }
            ForEach(vm.duraciones ?? []) { d in VStack(alignment: .leading, spacing: 2) { Text(d.titulo); Text(d.sub).font(.caption).foregroundStyle(.secondary) } }
        }

        Tarjeta {
            Text("Otras presentaciones").font(.headline)
            if (vm.otras ?? []).isEmpty { Text(vm.otrasVacio ?? "").font(.subheadline).foregroundStyle(.secondary) }
            ForEach(vm.otras ?? []) { o in
                if o.este {
                    HStack { Text(o.titulo).bold(); Spacer(); Text(o.monto).foregroundStyle(o.mejor ? Paleta.ok : .primary) }
                } else {
                    NavigationLink { ProductoView(clave: o.clave) } label: {
                        HStack { Text(o.titulo); Spacer(); Text(o.monto).foregroundStyle(o.mejor ? Paleta.ok : .primary); Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary) }
                    }.buttonStyle(.plain)
                }
            }
        }

        Tarjeta {
            Text("Historial de compras").font(.headline)
            ForEach(vm.historial ?? []) { r in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) { Text(r.titulo); Text(r.sub).font(.caption).foregroundStyle(.secondary) }
                    Spacer(); Text(r.monto).monospacedDigit()
                }
                Divider()
            }
        }
    }

    @ViewBuilder private func grafico(_ pts: [ProductoVM.Punto]) -> some View {
        if !pts.isEmpty {
            Chart(pts) { p in
                LineMark(x: .value("Fecha", Periodos.fecha(p.fecha) ?? Date()), y: .value("Precio", p.precio))
                    .foregroundStyle(by: .value("Lugar", p.lugar))
                    .interpolationMethod(.monotone)
                PointMark(x: .value("Fecha", Periodos.fecha(p.fecha) ?? Date()), y: .value("Precio", p.precio))
                    .foregroundStyle(by: .value("Lugar", p.lugar))
            }
            .chartYAxis { AxisMarks { v in AxisGridLine(); AxisValueLabel { if let d = v.as(Double.self) { Text(prefs.crc(d)).font(.caption2) } } } }
            .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { v in AxisValueLabel { if let d = v.as(Date.self) { Text(Fmt.dia(Periodos.iso(d))).font(.caption2) } } } }
            .chartLegend(position: .bottom)
            .frame(height: 190)
        }
    }

    // MARK: Acciones (mismo formato de registros que la web)

    private var persona: String { sync.config?.persona ?? "Jose" }
    private func nuevoId(_ p: String) -> String { "\(p)\(SyncEngine.b36(Date().timeIntervalSince1970 * 1000))" }

    private func evento(_ vm: ProductoVM, _ tipo: String, dias: Int?) {
        let id = nuevoId("E")
        let rec = jsonObj([("id", id), ("fecha", Fmt.hoyCR()), ("clave", clave), ("evento", tipo), ("vida_dias", dias), ("nota", ""), ("por", persona)])
        let txt = vm.evTxt?[tipo] ?? tipo
        sync.mutate("eventos", kind: "upsert", record: rec, summary: "\(vm.producto ?? ""): \(txt.lowercased())")
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        let s = sync, nombre = vm.producto ?? ""
        nav.avisar("Anotado: \(txt)", accion: "Deshacer") { s.mutate("eventos", kind: "delete", id: id, summary: "deshace: \(nombre)") }
    }

    private func guardarRefri(_ vm: ProductoVM, _ n: Int) {
        if vm.refri?.conocido != true {
            sync.mutate("productos", kind: "patch", record: jsonObj([("id", clave), ("vida_refri_dias", n)]), summary: "\(vm.producto ?? ""): dura \(n) días en la refri")
        }
        evento(vm, "refrigerado", dias: n)
    }

    private func agregarLista(_ vm: ProductoVM) {
        let rec = jsonObj([("id", nuevoId("P")), ("tipo", "pedido"), ("clave", clave), ("texto", vm.producto ?? ""), ("cantidad", ""), ("fecha", Fmt.hoyCR()), ("por", persona)])
        sync.mutate("lista", kind: "upsert", record: rec, summary: "agrega \"\(vm.producto ?? "")\"")
        nav.avisar("Agregado a la lista.")
    }

    private func patch(_ vm: ProductoVM, _ campos: [(String, Any?)], _ summary: String) {
        sync.mutate("productos", kind: "patch", record: jsonObj([("id", vm.id ?? clave)] + campos), summary: summary)
    }

    private func guardarUbicacion(_ vm: ProductoVM) {
        let v = ubicacion.trimmingCharacters(in: .whitespaces)
        if v != (vm.ubicacion ?? "") { patch(vm, [("ubicacion", v)], "\(vm.producto ?? ""): se guarda en \(v.isEmpty ? "—" : v)") }
    }
}

/// "Lo guardamos en la refri": cuántos días dura desde hoy.
struct RefriSheet: View {
    let vm: ProductoVM
    let guardar: (Int) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var dias = 7

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(vm.refri?.nota ?? "").font(.footnote) }
                Section {
                    Stepper(value: $dias, in: 1...90) { Text("\(dias) día\(dias == 1 ? "" : "s")").font(.title3.bold()) }
                } header: { Text("¿Cuántos días dura en la refri?") } footer: {
                    Text("Vencería aprox. el \(Fmt.dia(Periodos.iso(Periodos.cal.date(byAdding: .day, value: dias, to: Periodos.fecha(Fmt.hoyCR()) ?? Date())!))).")
                }
            }
            .navigationTitle("Guardado en la refri")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Guardar") { guardar(dias); dismiss() }.bold() }
            }
            .onAppear { dias = vm.refri?.sugerido ?? 7 }
        }
        .presentationDetents([.medium])
    }
}
