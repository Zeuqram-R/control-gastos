import SwiftUI

/// Lo que suma una cajita del Resumen (o "General": todo lo de la quincena).
struct CategoriaView: View {
    let cat: String
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @State private var vm: CategoriaVM?
    @State private var error: String?

    private struct Clave: Equatable { let v: Int; let o: Bool }

    var body: some View {
        List {
            if let vm {
                Section {
                    Text(vm.nota).font(.footnote).foregroundStyle(.secondary)
                    HStack { Text("Total").bold(); Spacer(); Text(vm.total).bold().monospacedDigit() }
                    if vm.items.isEmpty { Text("Nada en esta quincena.").foregroundStyle(.secondary) }
                    ForEach(vm.items) { FilaMov(m: $0) }
                }
                if !vm.pasadas.isEmpty {
                    Section("Quincenas anteriores") {
                        ForEach(vm.pasadas) { g in
                            DisclosureGroup {
                                ForEach(g.items) { FilaMov(m: $0) }
                            } label: {
                                HStack { Text(g.titulo); Spacer(); Text(g.total).monospacedDigit().foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
            } else if let error {
                Text(error).foregroundStyle(Paleta.bad)
            } else {
                ProgressView()
            }
        }
        .espacioBarra()
        .navigationTitle(cat == "General" ? "Quincena" : cat)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: Clave(v: sync.version, o: prefs.ocultar)) {
            let d = sync.D(CLAVES_RESUMEN), hoy = Fmt.hoyCR(), oc = prefs.ocultar, c = cat
            let r: Result<CategoriaVM, Error> = await Task.detached {
                do { return .success(try JSONDecoder().decode(CategoriaVM.self, from: try Core.shared.vista("categoria", d: d, args: [hoy, c], ocultar: oc))) }
                catch { return .failure(error) }
            }.value
            switch r {
            case .success(let v): vm = v
            case .failure(let e): error = e.localizedDescription
            }
        }
    }
}

/// "¿Me alcanza?": antes de comprar algo, ver cómo quedarían esta quincena y las próximas.
struct AlcanzaSheet: View {
    var nombre: String? = nil
    var montoInicial: String? = nil
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @Environment(\.dismiss) private var dismiss
    @State private var monto = ""
    @State private var cuando = "ahora"
    @State private var vm: AlcanzaVM?
    @FocusState private var foco: Bool

    private struct Clave: Equatable { let m: String; let c: String; let v: Int }

    var body: some View {
        NavigationStack {
            Form {
                Section("¿Cuánto cuesta? (₡)") {
                    TextField("0", text: $monto).keyboardType(.numberPad).font(.title2.bold()).focused($foco)
                }
                Section("¿Cuándo lo comprarían?") {
                    Picker("", selection: $cuando) {
                        ForEach(vm?.opciones ?? [["ahora", "Esta quincena"], ["proxima", "La próxima"]], id: \.self) { o in Text(o.last ?? "").tag(o.first ?? "") }
                    }.pickerStyle(.segmented)
                }
                if let vm {
                    if let v = vm.vacio {
                        Text(v).font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Section {
                            Text(vm.veredicto ?? "").font(.title3.bold()).foregroundStyle(colorDe(vm.cls) ?? .primary)
                            if let n = vm.nota, !n.isEmpty { Text(n).font(.footnote) }
                            ForEach(vm.filas ?? []) { f in
                                HStack {
                                    Text(f.lbl).font(.subheadline)
                                    Spacer()
                                    Text(f.antes).font(.caption).foregroundStyle(.secondary).monospacedDigit()
                                    Image(systemName: "arrow.right").font(.caption2).foregroundStyle(.tertiary)
                                    Text(f.despues).font(.subheadline.bold()).monospacedDigit().foregroundStyle(f.bad ? Paleta.bad : .primary)
                                }
                            }
                            if let m = vm.metaTxt { Text(m).font(.footnote) }
                        } footer: { Text(vm.pie ?? "") }
                    }
                }
            }
            .navigationTitle(nombre.map { "¿Me alcanza para «\($0)»?" } ?? "¿Me alcanza?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Listo") { dismiss() } } }
            .task(id: Clave(m: monto, c: cuando, v: sync.version)) { await calcular() }
            .onAppear { if let m = montoInicial, monto.isEmpty { monto = m } else { foco = true } }
        }
        .presentationDetents([.large])
    }

    private func calcular() async {
        let n = Int(monto.filter(\.isNumber)) ?? 0
        let d = sync.D(CLAVES_RESUMEN), hoy = Fmt.hoyCR(), c = cuando, oc = prefs.ocultar
        let r = await Task.detached { try? JSONDecoder().decode(AlcanzaVM.self, from: try Core.shared.vista("alcanza", d: d, args: [hoy, n, c], ocultar: oc)) }.value
        if let r { vm = r }
    }
}
