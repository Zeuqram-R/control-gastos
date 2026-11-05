import SwiftUI
import Charts

/// Resumen: los mismos números y textos de la web (los arma core.js) dibujados en nativo.
struct ResumenView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @EnvironmentObject var nav: AppNav
    @State private var vm: ResumenVM?
    @State private var error: String?
    @State private var qOff = 0
    @State private var fuente: Fuente?
    @State private var alcanza = false
    @State private var movModo = "mes"
    @State private var movOff = 0
    @State private var buscar = ""
    @State private var verPagos = false

    private struct Clave: Equatable { let v: Int; let o: Bool; let h: String }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let vm {
                        chips(proxy)
                        anotar(vm)
                        if let a = vm.anio {
                            Link(destination: URL(string: "https://zeuqram-r.github.io/control-gastos/")!) {
                                Tarjeta {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(a).bold()
                                            Text("En qué se fue la plata, cuánto ahorraron, lo que más compraron…").font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer(); Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                                    }
                                }
                            }.buttonStyle(.plain)
                        }
                        quincena(vm).id("q")
                        cuentas(vm).id("cuentas")
                        metas(vm).id("metas")
                        negocio(vm).id("negocio")
                        tipos(vm).id("tipos")
                        mes(vm).id("mes")
                        movimientos(vm).id("gastos")
                    } else if let error {
                        Tarjeta { Text(error).foregroundStyle(Paleta.bad) }
                    } else {
                        HStack { Spacer(); ProgressView(sync.hasData ? "Calculando…" : "Bajando los datos…"); Spacer() }.padding(.top, 60)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            }
            .background(Color(.systemGroupedBackground))
            .espacioBarra()
            .refreshable { await sync.runSync() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { prefs.ocultar.toggle() } label: { Image(systemName: prefs.ocultar ? "eye.slash" : "eye") }
                    .accessibilityLabel(prefs.ocultar ? "Mostrar montos" : "Ocultar montos")
            }
        }
        .sheet(item: $fuente) { FuenteSheet(f: $0) }
        .sheet(isPresented: $alcanza) { AlcanzaSheet() }
        .task(id: Clave(v: sync.version, o: prefs.ocultar, h: Fmt.hoyCR())) { await calcular() }
    }

    private func calcular() async {
        guard sync.hasData else { return }
        let d = sync.D(CLAVES_RESUMEN), hoy = Fmt.hoyCR(), oc = prefs.ocultar
        let r: Result<ResumenVM, Error> = await Task.detached(priority: .userInitiated) {
            do {
                let data = try Core.shared.vista("resumen", d: d, args: [hoy], ocultar: oc)
                return .success(try JSONDecoder().decode(ResumenVM.self, from: data))
            } catch { return .failure(error) }
        }.value
        switch r {
        case .success(let v): vm = v; error = nil
        case .failure(let e): error = "No se pudo calcular el resumen: \(e.localizedDescription)"
        }
    }

    // MARK: Secciones

    private func chips(_ proxy: ScrollViewProxy) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach([("q", "Quincena"), ("cuentas", "Cuentas"), ("metas", "Metas"), ("negocio", "Santo Coco"), ("tipos", "Por tipo"), ("mes", "El mes"), ("gastos", "Movimientos")], id: \.0) { id, t in
                    Button(t) { withAnimation { proxy.scrollTo(id, anchor: .top) } }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Capsule().fill(Color(.secondarySystemGroupedBackground)))
                        .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 4)
    }

    private func anotar(_ vm: ResumenVM) -> some View {
        Tarjeta {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(vm.preguntas > 0 ? "Claude tiene \(vm.preguntas) pregunta\(vm.preguntas == 1 ? "" : "s")" : "Anotar").bold()
                    Text(vm.preguntas > 0 ? "Sobre las últimas facturas. Por ahora se contestan en la web." : "Anotá un gasto. Las facturas por ahora se suben en la web.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Gasto") { nav.gasto = true }
                    .buttonStyle(.borderedProminent).tint(Paleta.blue).bold()
                Link("Factura", destination: URL(string: "https://zeuqram-r.github.io/control-gastos/")!)
                    .buttonStyle(.bordered)
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(vm.preguntas > 0 ? Paleta.warn : .clear, lineWidth: 1.5))
    }

    private func qNav(_ titulo: String, _ sub: String) -> some View {
        HStack {
            Button { withAnimation { qOff -= 1 } } label: { Image(systemName: "chevron.left").frame(width: 36, height: 36) }
                .disabled(qOff <= 0).accessibilityLabel("Quincena anterior")
            Spacer()
            VStack(spacing: 1) {
                Text(titulo).font(.headline).multilineTextAlignment(.center)
                Text(sub).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button { withAnimation { qOff += 1 } } label: { Image(systemName: "chevron.right").frame(width: 36, height: 36) }
                .disabled(qOff >= 12).accessibilityLabel("Quincena siguiente")
        }
        .buttonStyle(.bordered).buttonBorderShape(.circle)
    }

    @ViewBuilder private func quincena(_ vm: ResumenVM) -> some View {
        if qOff > 0, qOff <= vm.proyecciones.count {
            let p = vm.proyecciones[qOff - 1]
            VStack(alignment: .leading, spacing: 10) {
                qNav(p.titulo, p.sub)
                Tarjeta {
                    StatGrid(stats: p.stats) { fuente = $0 }
                    Button { if let f = p.total.fuente { fuente = f } } label: {
                        HStack {
                            Text(p.total.lbl).font(.headline)
                            Spacer()
                            Text(p.total.num).font(.title2.bold()).monospacedDigit().foregroundStyle(colorDe(p.total.color) ?? .primary)
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 12).fill((colorDe(p.total.color) ?? .gray).opacity(0.12)))
                    }.buttonStyle(.plain)
                    fondo(p.fondo)
                    pagos(p.pagos)
                    Text(p.nota).font(.caption).foregroundStyle(.secondary)
                }
            }
        } else {
            let q = vm.quincena
            VStack(alignment: .leading, spacing: 10) {
                qNav(q.titulo, "Tocá › para ver las próximas")
                Text(q.nota).font(.caption).foregroundStyle(.secondary)
                Tarjeta {
                    StatGrid(stats: q.stats) { fuente = $0 }
                    HStack {
                        Text("Tocá un número para ver de dónde sale.").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button("¿Me alcanza?") { alcanza = true }.buttonStyle(.bordered).controlSize(.small)
                    }
                    fondo(q.fondo)
                    pagos(q.pagos)
                }
                NavigationLink { CategoriaView(cat: "General") } label: { GenCardView(c: q.gen, compact: false) }
                    .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private func fondo(_ f: LineaFondo?) -> some View {
        if let f {
            HStack { Text(f.lbl).font(.subheadline); Spacer(); Text(f.num).bold().monospacedDigit().foregroundStyle(f.bad ? Paleta.bad : .primary) }
        }
    }

    @ViewBuilder private func pagos(_ ps: [Pago]) -> some View {
        if !ps.isEmpty {
            DisclosureGroup("Ver lo que hay que pagar") {
                VStack(spacing: 8) {
                    ForEach(ps) { p in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Circle().fill(colorQuien(p.quien)).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(p.nombre).font(.subheadline)
                                Text(p.sub).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(prefs.crc(p.monto ?? 0)).font(.subheadline).monospacedDigit()
                        }
                    }
                }.padding(.top, 6)
            }
            .font(.subheadline.weight(.semibold))
        }
    }


    @ViewBuilder private func cuentas(_ vm: ResumenVM) -> some View {
        if let c = vm.cuentas {
            VStack(alignment: .leading, spacing: 8) {
                Titulo(texto: "Cuentas")
                Button { nav.tab = .recurrentes } label: {
                    Tarjeta {
                        ForEach(c.filas) { f in
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(f.nombre)
                                    Text(f.sub).font(.caption).foregroundStyle(f.subBad ? Paleta.bad : .secondary)
                                }
                                Spacer()
                                Text(f.num).bold().monospacedDigit().foregroundStyle(f.bad ? Paleta.bad : .primary)
                            }
                        }
                        if let n = c.nota { Text(n).font(.caption).foregroundStyle(.secondary) }
                        Text("Ver en Recurrentes ›").font(.caption.weight(.semibold)).foregroundStyle(Paleta.ok)
                    }
                }.buttonStyle(.plain)
            }
        }
    }

    private func metas(_ vm: ResumenVM) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Titulo(texto: "Metas de ahorro")
            Button { nav.tab = .metas } label: {
                Tarjeta {
                    if vm.metas.isEmpty {
                        Text("Sin metas todavía. Tocá para crear una en Metas.").font(.subheadline).foregroundStyle(.secondary)
                    }
                    ForEach(vm.metas) { m in
                        HStack(alignment: .center) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(m.nombre)
                                ProgressView(value: m.pct).tint(Paleta.ok)
                                Text(m.sub).font(.caption).foregroundStyle(.secondary)
                            }
                            if let e = m.estaQ {
                                VStack(alignment: .trailing, spacing: 1) {
                                    Text("Esta quincena").font(.caption2).foregroundStyle(.secondary)
                                    Text(e).bold().monospacedDigit()
                                }.padding(.leading, 8)
                            }
                        }
                    }
                    Text("Ver en Metas ›").font(.caption.weight(.semibold)).foregroundStyle(Paleta.ok)
                }
            }.buttonStyle(.plain)
        }
    }

    private func negocio(_ vm: ResumenVM) -> some View {
        Link(destination: URL(string: "https://zeuqram-r.github.io/control-gastos/")!) {
            Tarjeta {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Santo Coco 🥥").bold()
                        Text(vm.negocio).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(); Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                }
            }
        }.buttonStyle(.plain)
    }

    private func tipos(_ vm: ResumenVM) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Titulo(texto: "Por tipo de gasto")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 330), spacing: 12, alignment: .top)], spacing: 12) {
                ForEach(vm.tipos.cards) { c in
                    NavigationLink { CategoriaView(cat: c.cat) } label: { GenCardView(c: c, compact: true) }.buttonStyle(.plain)
                }
            }
            if let r = vm.tipos.resto { Text(r).font(.caption).foregroundStyle(.secondary) }
        }
    }

    private func mes(_ vm: ResumenVM) -> some View {
        let m = vm.mes
        return VStack(alignment: .leading, spacing: 8) {
            Titulo(texto: m.titulo)
            Text(m.nota).font(.caption).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8, alignment: .top), GridItem(.flexible(), spacing: 8, alignment: .top)], spacing: 8) {
                ForEach(m.tiles) { t in
                    Button { if let f = t.fuente { fuente = f } } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 2) { Text(t.lbl).font(.caption.weight(.semibold)).foregroundStyle(.secondary); Text("›").font(.caption.bold()).foregroundStyle(.tertiary) }
                            Text(t.num).font(.title3.bold()).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                            if let s = t.sub {
                                Text(s).font(.caption2).foregroundStyle(t.dir == "up" ? Paleta.bad : t.dir == "down" ? Paleta.ok : .secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .topLeading).padding(12)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(.secondarySystemGroupedBackground)))
                    }.buttonStyle(.plain)
                }
            }
            if let c = m.cmp { MesAMes(c: c) }
        }
    }

    // MARK: Movimientos

    private func movimientos(_ vm: ResumenVM) -> some View {
        let q = buscar.trimmingCharacters(in: .whitespaces)
        let periodos = Periodos.lista(modo: movModo, primero: vm.movs.last?.fecha ?? Fmt.hoyCR(), hoy: Fmt.hoyCR())
        let off = max(0, min(movOff, periodos.count - 1))
        let actual = periodos.isEmpty ? "" : periodos[periodos.count - 1 - off]
        let lista = vm.movs.filter { Periodos.clave(modo: movModo, fecha: $0.fecha) == actual }
        let res: [MovVM] = q.isEmpty ? [] : {
            let n = normal(q)
            return vm.movs.filter { m in
                normal(m.buscar ?? "\(m.titulo) \(m.sub)").contains(n)
                    || (n.count >= 3 && normal(vm.meses[max(0, min(11, (Int(m.fecha.dropFirst(5).prefix(2)) ?? 1) - 1))]).hasPrefix(n))
            }
        }()
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Titulo(texto: "Movimientos")
                Button("Gasto") { nav.gasto = true }.buttonStyle(.borderedProminent).tint(Paleta.blue).controlSize(.small).bold()
                Picker("", selection: $movModo) { Text("Mes").tag("mes"); Text("Semana").tag("semana") }
                    .pickerStyle(.segmented).frame(width: 140)
                    .onChange(of: movModo) { _, _ in movOff = 0 }
            }
            Tarjeta {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Buscar: Uber, súper, Wink, octubre…", text: $buscar)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    if !buscar.isEmpty {
                        Button { buscar = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                            .accessibilityLabel("Borrar búsqueda")
                    }
                }
                .padding(9)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemGroupedBackground)))
                if !q.isEmpty {
                    VStack(spacing: 1) {
                        Text("\(res.count) resultado(s)").font(.headline)
                        Text("\(prefs.crc(res.reduce(0) { $0 + $1.monto })) en total · todos los meses").font(.caption).foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity)
                    filas(res, q, vacio: "Nada coincide con la búsqueda.")
                } else {
                    HStack {
                        Button { movOff = off + 1 } label: { Image(systemName: "chevron.left").frame(width: 32, height: 32) }
                            .disabled(off >= periodos.count - 1)
                        Spacer()
                        VStack(spacing: 1) {
                            Text(Periodos.titulo(modo: movModo, clave: actual, meses: vm.meses)).font(.headline)
                            Text("\(lista.count) movimiento(s) · \(prefs.crc(lista.reduce(0) { $0 + $1.monto }))").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button { movOff = off - 1 } label: { Image(systemName: "chevron.right").frame(width: 32, height: 32) }
                            .disabled(off <= 0)
                    }
                    .buttonStyle(.bordered).buttonBorderShape(.circle)
                    filas(lista, "", vacio: movModo == "mes" ? "No hay movimientos este mes." : "No hay movimientos esta semana.")
                }
            }
        }
    }

    @ViewBuilder private func filas(_ l: [MovVM], _ q: String, vacio: String) -> some View {
        if l.isEmpty {
            Text(vacio).font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 8)
        } else {
            LazyVStack(spacing: 0) {
                ForEach(l) { m in
                    FilaMov(m: m, buscar: q).padding(.vertical, 8)
                    Divider()
                }
            }
        }
    }
}

/// Meses o semanas desde el primer movimiento hasta hoy.
enum Periodos {
    static let cal: Calendar = { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "UTC")!; return c }()
    static func fecha(_ s: String) -> Date? {
        let p = s.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }
    static func iso(_ d: Date) -> String {
        let c = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    static func semana(_ f: String) -> String {
        guard let d = fecha(f) else { return f }
        let dow = (cal.component(.weekday, from: d) + 5) % 7 // lunes = 0
        return iso(cal.date(byAdding: .day, value: -dow, to: d)!)
    }
    static func clave(modo: String, fecha f: String) -> String { modo == "mes" ? String(f.prefix(7)) : semana(f) }
    static func lista(modo: String, primero: String, hoy: String) -> [String] {
        var out: [String] = []
        if modo == "mes" {
            var y = Int(primero.prefix(4)) ?? 2026, m = Int(primero.dropFirst(5).prefix(2)) ?? 1
            let hy = Int(hoy.prefix(4)) ?? 2026, hm = Int(hoy.dropFirst(5).prefix(2)) ?? 1
            while y < hy || (y == hy && m <= hm) { out.append(String(format: "%04d-%02d", y, m)); m += 1; if m > 12 { m = 1; y += 1 } }
        } else {
            var w = semana(primero); let fin = semana(hoy)
            while w <= fin { out.append(w); w = iso(cal.date(byAdding: .day, value: 7, to: fecha(w)!)!) }
        }
        return out.isEmpty ? [clave(modo: modo, fecha: hoy)] : out
    }
    static func titulo(modo: String, clave: String, meses: [String]) -> String {
        if modo == "mes" {
            let m = (Int(clave.dropFirst(5).prefix(2)) ?? 1) - 1
            let n = meses.indices.contains(m) ? meses[m] : ""
            return "\(n.prefix(1).uppercased())\(n.dropFirst()) \(clave.prefix(4))"
        }
        guard let d = fecha(clave) else { return clave }
        return "\(Fmt.dia(clave)) – \(Fmt.dia(iso(cal.date(byAdding: .day, value: 6, to: d)!)))"
    }
}

/// Tarjeta de gasto de la quincena (general o por categoría).
struct GenCardView: View {
    let c: GenCard
    let compact: Bool
    @EnvironmentObject var prefs: Prefs
    var body: some View {
        Tarjeta {
            HStack(alignment: .firstTextBaseline) {
                Text(c.titulo).font(.headline)
                Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
                Spacer()
                if let s = c.sub { Text(s).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
            StatGrid(stats: c.stats)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(.systemFill))
                    if c.plata > 0 {
                        Capsule().fill(c.over ? Paleta.bad : Paleta.ok).frame(width: max(6, g.size.width * c.plata))
                    }
                    Rectangle().fill(Color.primary.opacity(0.55)).frame(width: 2).offset(x: g.size.width * c.dias - 1)
                }
            }
            .frame(height: 10)
            if let l = c.leyenda { Text(l).font(.caption2).foregroundStyle(.secondary) }
            VStack(alignment: .leading, spacing: 6) {
                Text("Quincenas anteriores").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                if c.hist.isEmpty { Text(c.vacio).font(.caption).foregroundStyle(.secondary) }
                else { Barras(filas: c.hist) }
            }
        }
    }
}

/// Mes a mes: total de cada mes y cada categoría.
struct MesAMes: View {
    let c: MesVM.Cmp
    @EnvironmentObject var prefs: Prefs
    var body: some View {
        let n = c.meses.count
        let tono: (Int) -> Color = { i in Paleta.ok.opacity(n == 1 ? 1 : 0.3 + 0.7 * Double(i) / Double(max(n - 1, 1))) }
        let maxCat = max(1, c.cats.flatMap(\.valores).max() ?? 1)
        Tarjeta {
            Text("Mes a mes").font(.headline)
            if let nota = c.nota { Text(nota).font(.caption).foregroundStyle(.secondary) }
            if n >= 2 {
                Chart {
                    ForEach(Array(c.meses.enumerated()), id: \.offset) { i, m in
                        BarMark(x: .value("Mes", m.label), y: .value("Total", m.total))
                            .foregroundStyle(tono(i))
                            .annotation(position: .top) { Text(prefs.crc(m.total)).font(.system(size: 9)).foregroundStyle(.secondary) }
                    }
                }
                .chartYAxis(.hidden)
                .frame(height: 150)
            }
            ForEach(c.cats) { cat in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(cat.categoria).font(.subheadline)
                        Spacer()
                        Text(prefs.crc(cat.valores.last ?? 0)).font(.subheadline.bold()).monospacedDigit()
                        if n >= 2 && cat.delta != 0 {
                            Text("\(cat.delta > 0 ? "▲" : "▼") \(prefs.crc(abs(cat.delta)))").font(.caption2)
                                .foregroundStyle(cat.delta > 0 ? Paleta.bad : Paleta.ok)
                        }
                    }
                    ForEach(Array(cat.valores.enumerated()), id: \.offset) { i, v in
                        GeometryReader { g in Capsule().fill(tono(i)).frame(width: max(2, g.size.width * v / maxCat)) }.frame(height: 5)
                    }
                }
            }
            if let e = c.enCurso { Text(e).font(.caption).foregroundStyle(.secondary) }
            Link("Ver el año completo ›", destination: URL(string: "https://zeuqram-r.github.io/control-gastos/")!).font(.caption.weight(.semibold))
        }
    }
}
