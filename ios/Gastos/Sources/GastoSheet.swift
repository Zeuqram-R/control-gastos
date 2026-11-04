import SwiftUI

/// Botón "Gasto": anotar un gasto sin factura (SINPE, Uber, efectivo, la feria…) en segundos.
/// El registro lo arma el mismo código de la web (js/gastoRec.js) para que quede idéntico.
struct GastoSheet: View {
    var negocioInicial = false
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var nav: AppNav
    @Environment(\.dismiss) private var dismiss

    @State private var op: OpcionesGasto?
    @State private var monto = ""
    @State private var moneda = "CRC"
    @State private var comercio = ""
    @State private var desc = ""
    @State private var categoria: String?
    @State private var catAuto = false
    @State private var tipo = "Variable"
    @State private var fuente = "Salario"
    @State private var quien = "Jose"
    @State private var fecha = Date()
    @State private var negocio = false
    @State private var error: String?
    @State private var guardando = false
    @FocusState private var foco: Campo?

    enum Campo { case monto, comercio, desc }

    private var hoy: String { Fmt.hoyCR() }
    private var fechaISO: String { Periodos.iso(Self.utc(fecha)) }
    private var cats: [String] { (negocio ? op?.catsNeg : op?.catsCasa) ?? [] }
    private var fuentes: [String] { (negocio ? op?.fuentesNeg : op?.fuentes) ?? ["Salario", "Wink", "BofA", "Préstamo", "Efectivo"] }
    private var sugeridos: [String] {
        let q = normal(comercio.trimmingCharacters(in: .whitespaces))
        guard q.count >= 1, let l = op?.comercios else { return [] }
        return Array(l.filter { normal($0).hasPrefix(q) && normal($0) != q }.prefix(4))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Monto") {
                    HStack {
                        TextField(moneda == "USD" ? "0.00" : "0", text: $monto)
                            .keyboardType(.decimalPad).font(.system(size: 30, weight: .bold, design: .rounded))
                            .focused($foco, equals: .monto)
                        Picker("", selection: $moneda) { Text("₡").tag("CRC"); Text("$").tag("USD") }
                            .pickerStyle(.segmented).frame(width: 96)
                    }
                }
                Section {
                    TextField("Uber, la feria, SINPE a Cris…", text: $comercio)
                        .focused($foco, equals: .comercio)
                        .onChange(of: comercio) { _, v in adivinar(v) }
                    if !sugeridos.isEmpty && foco == .comercio {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack { ForEach(sugeridos, id: \.self) { s in Button(s) { comercio = s; foco = nil }.buttonStyle(.bordered).controlSize(.small) } }
                        }
                    }
                    Toggle(isOn: $negocio) { Text("Es de Santo Coco 🥥") }
                        .onChange(of: negocio) { _, v in
                            categoria = nil; catAuto = false
                            fuente = v ? (op?.cajaNegocio ?? "Caja Santo Coco") : "Salario"
                        }
                } header: { Text("¿En qué?") } footer: {
                    if negocio { Text("Si sale de la caja del negocio no toca la plata de la casa. Si lo pagaron con plata de la casa, se cuenta en la quincena como \"Santo Coco\".") }
                }
                Section("Categoría") { Chips(opciones: cats, sel: Binding(get: { categoria }, set: { categoria = $0; catAuto = false })) }
                Section("Tipo") {
                    Picker("", selection: $tipo) { Text("Variable").tag("Variable"); Text("De una vez").tag("Una vez") }.pickerStyle(.segmented)
                }
                Section("Cómo se pagó") { Chips(opciones: fuentes, sel: Binding(get: { fuente }, set: { fuente = $0 ?? fuente })) }
                Section("Quién pagó") {
                    Picker("", selection: $quien) { Text("Jose").tag("Jose"); Text("Ali").tag("Ali") }.pickerStyle(.segmented)
                }
                Section("Cuándo") {
                    HStack {
                        Button("Hoy") { fecha = Date() }.buttonStyle(.bordered).tint(fechaISO == hoy ? Paleta.ok : .secondary)
                        Button("Ayer") { fecha = Date().addingTimeInterval(-86400) }.buttonStyle(.bordered)
                            .tint(fechaISO == ayer ? Paleta.ok : .secondary)
                        Spacer()
                        DatePicker("", selection: $fecha, in: ...Date(), displayedComponents: .date).labelsHidden()
                    }
                }
                Section {
                    TextField("Opcional · en Uber, DiDi, InDrive, taxi o bus: de dónde a dónde (Casa a Walmart)", text: $desc, axis: .vertical)
                        .focused($foco, equals: .desc)
                } header: { Text("Detalle") } footer: {
                    Text("Los pagos que se repiten cada mes van en Recurrentes, y las compras con factura conviene subirlas (así se anotan los productos y precios).")
                }
                if let error { Section { Text(error).foregroundStyle(Paleta.bad) } }
            }
            .navigationTitle("Anotar un gasto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Anotar") { guardar() }.bold().disabled(guardando)
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button { guardar() } label: { Text("Anotar gasto").bold().frame(maxWidth: .infinity).padding(.vertical, 6) }
                    .buttonStyle(.borderedProminent).tint(Paleta.blue).disabled(guardando)
                    .padding(.horizontal, 16).padding(.bottom, 8)
                    .background(.bar)
            }
        }
        .task {
            quien = sync.config?.persona ?? "Jose"
            negocio = negocioInicial
            if negocioInicial { fuente = "Caja Santo Coco" }
            let d = sync.D(["gastos"])
            op = await Task.detached { try? JSONDecoder().decode(OpcionesGasto.self, from: try Core.shared.vista("opcionesGasto", d: d, args: [])) }.value
            foco = .monto
        }
    }

    private var ayer: String { Periodos.iso(Self.utc(Date().addingTimeInterval(-86400))) }

    /// La fecha elegida, en Costa Rica, como día UTC (para el texto yyyy-MM-dd).
    static func utc(_ d: Date) -> Date {
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/Costa_Rica")!
        let k = c.dateComponents([.year, .month, .day], from: d)
        return Periodos.cal.date(from: k) ?? d
    }

    /// Lo último anotado en ese comercio sugiere la categoría y el tipo.
    private func adivinar(_ v: String) {
        guard let prev = op?.porComercio[v.trimmingCharacters(in: .whitespaces).lowercased()], prev.negocio == negocio else { return }
        if categoria == nil || catAuto, let c = prev.categoria {
            categoria = c; catAuto = true
            if prev.tipo == "Variable" || prev.tipo == "Una vez" { tipo = prev.tipo! }
        }
    }

    private func guardar() {
        error = nil
        guard let cfg = sync.config else { return }
        var st: [String: Any] = ["monto": monto, "moneda": moneda, "comercio": comercio, "desc": desc, "tipo": tipo, "fuente": fuente,
                                 "quien": quien, "fecha": fechaISO, "negocio": negocio]
        st["categoria"] = categoria ?? NSNull()
        let d = sync.D(["tipo_cambio", "cuentas"])
        let r: GastoArmado
        do {
            r = try JSONDecoder().decode(GastoArmado.self, from: try Core.shared.vista("armarGasto", d: d, args: [st, ["persona": cfg.persona, "hoy": hoy]]))
        } catch { self.error = error.localizedDescription; return }
        if let e = r.error {
            error = e
            foco = r.campo == "monto" ? .monto : r.campo == "comercio" ? .comercio : nil
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return
        }
        guard let rec = r.rec, let recText = r.recText else { return }
        guardando = true
        sync.mutate("gastos", kind: "upsert", record: recText, summary: r.summary ?? "gasto")
        if let ct = r.cuentaText, let c = r.cuenta { sync.mutate("cuentas", kind: "patch", record: ct, summary: c.summary) }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        let undo = r.undoText, cuenta = r.cuenta, undoSummary = r.undoSummary ?? "deshace gasto"
        let s = sync
        nav.avisar("Anotado: \(rec.comercio) \(Fmt.crc(r.montoCRC ?? 0))", accion: "Deshacer") {
            s.mutate("gastos", kind: "delete", id: rec.id, summary: undoSummary)
            if let undo, let cuenta { s.mutate("cuentas", kind: "patch", record: undo, summary: cuenta.undoSummary) }
        }
        dismiss()
    }
}

/// Opciones en botoncitos que se acomodan en varias líneas (como .seg.wrap de la web).
struct Chips: View {
    let opciones: [String]
    @Binding var sel: String?
    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(opciones, id: \.self) { o in
                Button { sel = o; UISelectionFeedbackGenerator().selectionChanged() } label: {
                    Text(o).font(.subheadline)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Capsule().fill(sel == o ? Paleta.ok : Color(.tertiarySystemFill)))
                        .foregroundStyle(sel == o ? Color.white : Color.primary)
                }.buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, fila: CGFloat = 0
        for s in subviews {
            let t = s.sizeThatFits(.unspecified)
            if x + t.width > w && x > 0 { x = 0; y += fila + spacing; fila = 0 }
            x += t.width + spacing; fila = max(fila, t.height)
        }
        return CGSize(width: w, height: y + fila)
    }
    func placeSubviews(in b: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = b.minX, y = b.minY, fila: CGFloat = 0
        for s in subviews {
            let t = s.sizeThatFits(.unspecified)
            if x + t.width > b.maxX && x > b.minX { x = b.minX; y += fila + spacing; fila = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(t))
            x += t.width + spacing; fila = max(fila, t.height)
        }
    }
}
