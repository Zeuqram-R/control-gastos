import SwiftUI

/// Santo Coco: ventas y gastos del negocio de Ali, aparte de la plata de la casa.
struct NegocioView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @State private var vm: NegocioVM?
    @State private var off = 0
    @State private var venta = false
    @State private var gasto = false

    private struct Clave: Equatable { let v: Int; let o: Bool; let off: Int }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Lo del negocio va aparte de la plata de la casa. Lo que se paga con la caja de Santo Coco no toca la quincena; si se paga con plata de la casa, aparece en la quincena como \"Santo Coco\".")
                    .font(.caption).foregroundStyle(.secondary).padding(.top, 6)
                HStack {
                    Button { venta = true } label: { Label("Venta", systemImage: "plus").bold().frame(maxWidth: .infinity).padding(.vertical, 4) }.buttonStyle(.borderedProminent).tint(Paleta.ok)
                    Button { gasto = true } label: { Text("Gasto").bold().frame(maxWidth: .infinity).padding(.vertical, 4) }.buttonStyle(.borderedProminent).tint(Paleta.blue)
                }
                if let vm {
                    Tarjeta {
                        HStack {
                            Button { off += 1 } label: { Image(systemName: "chevron.left").frame(width: 32, height: 32) }.disabled(vm.off >= vm.max)
                            Spacer()
                            VStack(spacing: 1) { Text(vm.titulo).font(.headline); Text(vm.sub).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Button { off -= 1 } label: { Image(systemName: "chevron.right").frame(width: 32, height: 32) }.disabled(vm.off <= 0)
                        }.buttonStyle(.bordered).buttonBorderShape(.circle)
                        StatGrid(stats: vm.stats)
                        if !vm.porCat.isEmpty {
                            Text("Gastos por categoría").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            Barras(filas: vm.porCat, color: Paleta.blue)
                        }
                    }
                    Tarjeta {
                        Text("Movimientos del mes").font(.headline)
                        if vm.movs.isEmpty { Text("Nada anotado este mes. Usá Venta o Gasto de arriba.").foregroundStyle(.secondary) }
                        ForEach(vm.movs, id: \.uid) { m in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Circle().fill(m.venta ? Paleta.ok : Paleta.blue).frame(width: 9, height: 9)
                                VStack(alignment: .leading, spacing: 2) { Text(m.titulo); Text(m.sub).font(.caption).foregroundStyle(.secondary) }
                                Spacer()
                                Text(m.monto).monospacedDigit().foregroundStyle(m.venta ? Paleta.ok : .primary)
                            }
                        }
                    }
                } else { HStack { Spacer(); ProgressView(); Spacer() }.padding(.top, 40) }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
            .frame(maxWidth: 820).frame(maxWidth: .infinity)
        }
        .background(Color(.systemGroupedBackground))
        .espacioBarra()
        .navigationTitle("Santo Coco 🥥").navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $venta) { VentaSheet() }
        .sheet(isPresented: $gasto) { GastoSheet(negocioInicial: true) }
        .task(id: Clave(v: sync.version, o: prefs.ocultar, off: off)) {
            if case .success(let v) = await vistaAsync(NegocioVM.self, "negocio", sync.D(["gastos", "negocio"]), [Fmt.hoyCR(), off], ocultar: prefs.ocultar) { vm = v; off = v.off }
        }
    }
}

struct VentaSheet: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @Environment(\.dismiss) private var dismiss
    @State private var monto = ""
    @State private var detalle = ""
    @State private var cobro = "SINPE"
    @State private var quien = "Ali"
    @State private var fecha = Date()
    @State private var error: String?
    @FocusState private var foco: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section("Monto (₡)") { TextField("0", text: $monto).keyboardType(.numberPad).font(.title2.bold()).focused($foco) }
                Section("Detalle") { TextField("Qué se vendió o a quién (opcional)", text: $detalle) }
                Section("Cómo se cobró") { Chips(opciones: ["SINPE", "Efectivo", "Tarjeta", "Otro"], sel: Binding(get: { cobro }, set: { cobro = $0 ?? cobro })) }
                Section("Quién la anotó") { Picker("", selection: $quien) { Text("Ali").tag("Ali"); Text("Jose").tag("Jose") }.pickerStyle(.segmented) }
                Section { DatePicker("Cuándo", selection: $fecha, in: ...Date(), displayedComponents: .date) }
                if let error { Section { Text(error).foregroundStyle(Paleta.bad) } }
            }
            .navigationTitle("Anotar una venta").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Anotar") { guardar() }.bold() }
            }
            .onAppear { quien = sync.config?.persona ?? "Ali"; foco = true }
        }
    }

    private func guardar() {
        let id = "V-\(SyncEngine.b36(Date().timeIntervalSince1970 * 1000))"
        let st: [String: Any] = ["monto": monto, "detalle": detalle, "cobro": cobro, "quien": quien, "fecha": Periodos.iso(GastoSheet.utc(fecha))]
        guard let a = armar("venta", "{}", [st, id]) else { return }
        if let e = a.error { error = e; foco = true; return }
        guard let rec = a.recText else { return }
        let s = sync
        s.mutate("negocio", kind: "upsert", record: rec, summary: a.summary ?? "venta")
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        nav.avisar(a.toast ?? "Venta anotada.", accion: "Deshacer") { s.mutate("negocio", kind: "delete", id: id, summary: "deshace venta") }
        dismiss()
    }
}

/// Tu año: en qué se fue la plata, ahorro, lo más comprado, Santo Coco…
struct AnioView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @State private var vm: AnioVM?
    @State private var anio: Int?

    private struct Clave: Equatable { let v: Int; let o: Bool; let a: Int? }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let vm, vm.vacio == nil {
                    HStack {
                        Button { anio = (vm.anio ?? 0) - 1 } label: { Image(systemName: "chevron.left").frame(width: 32, height: 32) }.disabled((vm.anio ?? 0) <= (vm.min ?? 0))
                        Spacer()
                        VStack(spacing: 1) { Text(vm.titulo ?? "").font(.title2.bold()); Text(vm.sub ?? "").font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        Button { anio = (vm.anio ?? 0) + 1 } label: { Image(systemName: "chevron.right").frame(width: 32, height: 32) }.disabled((vm.anio ?? 0) >= (vm.max ?? 0))
                    }.buttonStyle(.bordered).buttonBorderShape(.circle).padding(.top, 6)
                    Tarjeta { StatGrid(stats: vm.stats ?? []) }
                    Tarjeta { Text("Mes a mes").font(.headline); Barras(filas: vm.porMes ?? []) }
                    Tarjeta {
                        Text("En qué se fue la plata").font(.headline)
                        Barras(filas: vm.porCat ?? [], color: Paleta.blue)
                        if let m = vm.masCats { Text(m).font(.caption).foregroundStyle(.secondary) }
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 10, alignment: .top)], spacing: 10) {
                        ForEach(vm.datos ?? []) { d in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(d.emoji).font(.largeTitle)
                                Text(d.titulo).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                Text(d.valor).font(.headline).lineLimit(3)
                                Text(d.sub).font(.caption2).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .topLeading).padding(12)
                            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(.secondarySystemGroupedBackground)))
                        }
                    }
                    if let top = vm.top, !top.isEmpty {
                        Tarjeta {
                            Text("Lo más comprado").font(.headline)
                            ForEach(top) { t in
                                HStack(spacing: 10) {
                                    Text("\(t.rank)").font(.headline).frame(width: 24).foregroundStyle(Paleta.ok)
                                    VStack(alignment: .leading) { Text(t.producto); Text(t.sub).font(.caption).foregroundStyle(.secondary) }
                                    Spacer(); Text(t.monto).monospacedDigit()
                                }
                            }
                        }
                    }
                } else if let v = vm?.vacio { Tarjeta { Text(v).foregroundStyle(.secondary) } }
                else { HStack { Spacer(); ProgressView(); Spacer() }.padding(.top, 60) }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
            .frame(maxWidth: 820).frame(maxWidth: .infinity)
        }
        .background(Color(.systemGroupedBackground))
        .espacioBarra()
        .navigationTitle("Tu año").navigationBarTitleDisplayMode(.inline)
        .task(id: Clave(v: sync.version, o: prefs.ocultar, a: anio)) {
            let a: Any = anio ?? NSNull()
            if case .success(let v) = await vistaAsync(AnioVM.self, "anio", sync.D(CLAVES_RESUMEN), [Fmt.hoyCR(), a], ocultar: prefs.ocultar) { vm = v }
        }
    }
}
