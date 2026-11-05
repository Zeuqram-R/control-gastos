import SwiftUI

/// Deudas: lo que debemos y lo que nos deben, con abonos y lo ya pagado.
struct DeudasView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @EnvironmentObject var nav: AppNav
    @EnvironmentObject var tachador: Tachador
    @State private var vm: DeudasVM?
    @State private var error: String?
    @State private var filtro: String?
    @State private var abiertos: Set<String> = []
    @State private var abonando: DeudasVM.Item?
    @State private var nueva = false

    private struct Clave: Equatable { let v: Int; let o: Bool; let h: String; let f: String? }
    private let naranja = Paleta.warn

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
        .sheet(item: $abonando) { AbonoSheet(item: $0) }
        .sheet(isPresented: $nueva) { NuevaDeudaSheet(personas: vm?.personas ?? []) }
        .task(id: Clave(v: sync.version, o: prefs.ocultar, h: Fmt.hoyCR(), f: filtro)) {
            guard sync.hasData else { return }
            let d = sync.D(CLAVES_PAGOS), hoy = Fmt.hoyCR(), oc = prefs.ocultar, quien = sync.config?.persona ?? "Jose"
            let f: Any = filtro ?? NSNull()
            let r: Result<DeudasVM, Error> = await Task.detached {
                do { return .success(try JSONDecoder().decode(DeudasVM.self, from: try Core.shared.vista("deudas", d: d, args: [hoy, quien, f], ocultar: oc))) }
                catch { return .failure(error) }
            }.value
            switch r {
            case .success(let v): vm = v; error = nil
            case .failure(let e): error = "No se pudo armar Deudas: \(e.localizedDescription)"
            }
        }
    }

    @ViewBuilder private func contenido(_ vm: DeudasVM) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8, alignment: .top), GridItem(.flexible(), spacing: 8, alignment: .top)], spacing: 8) {
            ForEach(vm.tiles) { t in
                Button { if t.k != "bal" { filtro = filtro == t.k ? nil : t.k } } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t.lbl).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        Text(t.num).font(.title3.bold()).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7).foregroundStyle(colorDe(t.color) ?? .primary)
                        Text(t.sub + (filtro == t.k ? " · filtrado" : "")).font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading).padding(12)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(filtro == t.k ? Paleta.ok.opacity(0.14) : Color(.secondarySystemGroupedBackground)))
                }.buttonStyle(.plain).disabled(t.k == "bal")
            }
        }
        Tarjeta {
            HStack {
                Text(vm.titulo).font(.headline)
                Spacer()
                Button { nueva = true } label: { Label("Agregar", systemImage: "plus") }.buttonStyle(.borderedProminent).tint(Paleta.ok).controlSize(.small)
            }
            HStack(spacing: 12) {
                HStack(spacing: 4) { Circle().fill(naranja).frame(width: 8, height: 8); Text("Debemos") }
                HStack(spacing: 4) { Circle().fill(Paleta.ok).frame(width: 8, height: 8); Text("Nos deben") }
            }.font(.caption2)
            Text("Tocá una deuda para tacharla como pagada (5 segundos para deshacer). Las que tienen varios detalles se abren para tachar cada uno. Totales en ₡ y $ (tipo de cambio de venta).")
                .font(.caption).foregroundStyle(.secondary)
            if vm.grupos.isEmpty { Text("No hay deudas pendientes aquí.").foregroundStyle(.secondary) }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 10, alignment: .top)], spacing: 10) {
                ForEach(vm.grupos) { tarjeta($0) }
            }
        }
        Tarjeta {
            Text("Pagado").font(.headline)
            Text("Deudas que ya se pagaron o que ya nos pagaron, y los abonos, con su fecha.").font(.caption).foregroundStyle(.secondary)
            if !vm.abonos.isEmpty {
                Text("Abonos").font(.subheadline.weight(.semibold))
                ForEach(vm.abonos) { a in hecho(a) { sync.mutate("abonos", kind: "delete", id: a.id, summary: a.summary); nav.avisar("Abono quitado.") } }
                Text("Deudas pagadas").font(.subheadline.weight(.semibold)).padding(.top, 4)
            }
            if vm.pagadas.isEmpty { Text("Todavía no hay nada pagado.").foregroundStyle(.secondary) }
            ForEach(vm.pagadas) { p in hecho(p) { sync.mutate("pagos_deudas", kind: "delete", id: p.id, summary: p.summary); nav.avisar("Vuelve a pendientes.") } }
        }
    }

    private func hecho(_ h: DeudasVM.Hecho, deshacer: @escaping () -> Void) -> some View {
        HStack(alignment: .center, spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(h.debemos ? naranja : Paleta.ok).frame(width: 4).frame(minHeight: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(h.titulo)
                Text(h.sub).font(.caption).foregroundStyle(.secondary)
                Button("Deshacer", action: deshacer).font(.caption.weight(.semibold))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(h.monto).monospacedDigit()
                if let o = h.otro { Text(o).font(.caption2).foregroundStyle(.secondary) }
            }
        }
    }

    private func tarjeta(_ g: DeudasVM.Grupo) -> some View {
        let color = g.debemos ? naranja : Paleta.ok
        let abierto = abiertos.contains(g.gk)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(g.persona).bold()
                Spacer()
                Text(g.pill).font(.caption2.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 2)
                    .background(Capsule().fill(colorQuien(g.pill).opacity(0.18))).foregroundStyle(colorQuien(g.pill))
            }
            Text(g.total).font(.subheadline.weight(.semibold)).foregroundStyle(color).monospacedDigit()
            if let f = g.fija, let it = g.items.first {
                HStack { Text(f.cuotas).font(.subheadline); Spacer(); Text(f.monto).font(.subheadline).monospacedDigit() }
                if let a = f.abonado { Text(a).font(.caption).foregroundStyle(.secondary) }
                Text(f.nota).font(.caption).foregroundStyle(.secondary)
                Button(it.abonoLbl) { abonando = it }.font(.subheadline.weight(.semibold))
            } else if !g.multi, let it = g.items.first {
                item(it, solo: true)
            } else {
                Button { withAnimation { if abierto { abiertos.remove(g.gk) } else { abiertos.insert(g.gk) } } } label: {
                    HStack { Text("\(g.mas) · \(abierto ? "tocá un detalle para tacharlo" : "tocá para ver y tachar cada uno")").font(.caption); Spacer(); Image(systemName: abierto ? "chevron.up" : "chevron.down") }
                        .foregroundStyle(.secondary).contentShape(Rectangle())
                }.buttonStyle(.plain)
                if abierto { ForEach(g.items) { item($0, solo: false); Divider() } }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(color.opacity(0.08)))
        .overlay(alignment: .leading) { RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 4).padding(.vertical, 8) }
    }

    private func item(_ it: DeudasVM.Item, solo: Bool) -> some View {
        let seg = tachador.segundos("d:\(it.id)")
        return VStack(alignment: .leading, spacing: 4) {
            Button { pagar(it) } label: {
                HStack(alignment: .firstTextBaseline) {
                    Text(it.concepto).font(.subheadline).strikethrough(seg != nil).multilineTextAlignment(.leading)
                    Spacer()
                    Text(it.monto).font(.subheadline).monospacedDigit().multilineTextAlignment(.trailing)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain)
            if solo, let n = it.nota { Text(n).font(.caption).foregroundStyle(.secondary) }
            if let a = solo ? it.abonado : it.abonoMini { Text(a).font(.caption).foregroundStyle(.secondary) }
            if let s = seg { Text("Tachado · tocá de nuevo para deshacer (\(s))").font(.caption.weight(.semibold)).foregroundStyle(Paleta.warn) }
            else { Button(it.abonoLbl) { abonando = it }.font(.caption.weight(.semibold)) }
        }
    }

    private func pagar(_ it: DeudasVM.Item) {
        let s = sync
        tachador.toggle("d:\(it.id)") { s.mutate("pagos_deudas", kind: "upsert", record: it.pago, summary: it.pagoSummary) }
    }
}

struct AbonoSheet: View {
    let item: DeudasVM.Item
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @Environment(\.dismiss) private var dismiss
    @State private var monto = ""
    @FocusState private var foco: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section { Text("\(item.persona) · \(item.concepto)").font(.subheadline); Text("Falta: \(item.monto)").font(.caption).foregroundStyle(.secondary) }
                Section(item.moneda == "USD" ? "Monto en $" : "Monto en ₡") {
                    TextField("0", text: $monto).keyboardType(.decimalPad).font(.title2.bold()).focused($foco)
                }
            }
            .navigationTitle(item.abonoLbl).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Guardar") { guardar() }.bold() }
            }
            .onAppear { foco = true }
        }
        .presentationDetents([.medium])
    }

    private func guardar() {
        let id = "A\(SyncEngine.b36(Date().timeIntervalSince1970 * 1000))"
        let d = sync.D(CLAVES_PAGOS)
        guard let data = try? Core.shared.vista("abono", d: d, args: [Fmt.hoyCR(), sync.config?.persona ?? "Jose", item.id, monto, id]),
              let a = try? JSONDecoder().decode(Armado.self, from: data) else { return }
        if a.error != nil { foco = true; return }
        guard let rec = a.recText else { return }
        sync.mutate("abonos", kind: "upsert", record: rec, summary: a.summary ?? "abono")
        nav.avisar("Abono anotado.")
        dismiss()
    }
}

struct NuevaDeudaSheet: View {
    let personas: [String]
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @Environment(\.dismiss) private var dismiss
    @State private var dir = "debemos"
    @State private var persona = ""
    @State private var concepto = ""
    @State private var monto = ""
    @State private var moneda = "CRC"
    @State private var quien = "Ambos"
    @State private var conFecha = false
    @State private var fecha = Date()
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Picker("", selection: $dir) { Text("Debemos").tag("debemos"); Text("Nos deben").tag("nos deben") }.pickerStyle(.segmented)
                Section(dir == "debemos" ? "A quién le debemos" : "Quién nos debe") {
                    TextField("Nombre", text: $persona)
                    let sug = personas.filter { !persona.isEmpty && normal($0).hasPrefix(normal(persona)) && $0 != persona }
                    if !sug.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(sug, id: \.self) { p in Button(p) { persona = p }.buttonStyle(.bordered).controlSize(.small) } } }
                    }
                }
                Section("Concepto") { TextField("Por qué", text: $concepto) }
                Section("Monto") {
                    HStack {
                        TextField("0", text: $monto).keyboardType(.decimalPad)
                        Picker("", selection: $moneda) { Text("₡").tag("CRC"); Text("$").tag("USD") }.pickerStyle(.segmented).frame(width: 96)
                    }
                }
                Section("De quién es") {
                    Picker("", selection: $quien) { Text("Jose").tag("Jose"); Text("Ali").tag("Ali"); Text("Ambos").tag("Ambos") }.pickerStyle(.segmented)
                }
                Section {
                    Toggle("Pagar antes de una fecha", isOn: $conFecha)
                    if conFecha { DatePicker("Fecha", selection: $fecha, displayedComponents: .date) }
                }
                if let error { Section { Text(error).foregroundStyle(Paleta.bad) } }
            }
            .navigationTitle("Agregar deuda").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Guardar") { guardar() }.bold() }
            }
        }
    }

    private func guardar() {
        let id = "D\(SyncEngine.b36(Date().timeIntervalSince1970 * 1000).uppercased())"
        let st: [String: Any] = ["persona": persona, "concepto": concepto, "monto": monto, "moneda": moneda, "dir": dir, "quien": quien,
                                 "fecha": conFecha ? Periodos.iso(GastoSheet.utc(fecha)) : ""]
        guard let data = try? Core.shared.vista("nuevaDeuda", d: "{}", args: [st, sync.config?.persona ?? "Jose", id]),
              let a = try? JSONDecoder().decode(Armado.self, from: data) else { return }
        if let e = a.error { error = e; return }
        guard let rec = a.recText else { return }
        sync.mutate("deudas", kind: "upsert", record: rec, summary: a.summary ?? "nueva deuda")
        nav.avisar("Deuda agregada.")
        dismiss()
    }
}
