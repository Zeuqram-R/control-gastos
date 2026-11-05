import SwiftUI

/// Recurrentes: lo que se paga cada mes, las cuentas (BofA) y el calendario de pagos.
struct RecurrentesView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @EnvironmentObject var nav: AppNav
    @EnvironmentObject var tachador: Tachador
    @State private var vm: RecurrentesVM?
    @State private var error: String?
    @State private var panel: String?
    @State private var off = 0
    @State private var sel: String?
    @State private var saldos: [String: String] = [:]

    private struct Clave: Equatable { let v: Int; let o: Bool; let h: String; let off: Int }

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
        .task(id: Clave(v: sync.version, o: prefs.ocultar, h: Fmt.hoyCR(), off: off)) {
            guard sync.hasData else { return }
            let d = sync.D(CLAVES_PAGOS), hoy = Fmt.hoyCR(), oc = prefs.ocultar, quien = sync.config?.persona ?? "Jose", o = off
            let r: Result<RecurrentesVM, Error> = await Task.detached {
                do { return .success(try JSONDecoder().decode(RecurrentesVM.self, from: try Core.shared.vista("recurrentes", d: d, args: [hoy, quien, o], ocultar: oc))) }
                catch { return .failure(error) }
            }.value
            switch r {
            case .success(let v):
                if vm?.cal.mes != v.cal.mes || sel == nil || !(sel ?? "").hasPrefix(v.cal.mes) { sel = v.cal.inicial }
                vm = v; error = nil
            case .failure(let e): error = "No se pudo armar Recurrentes: \(e.localizedDescription)"
            }
        }
    }

    @ViewBuilder private func contenido(_ vm: RecurrentesVM) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8, alignment: .top), GridItem(.flexible(), spacing: 8, alignment: .top)], spacing: 8) {
            ForEach(vm.tiles) { t in
                Button { if t.k != "tc" { withAnimation { panel = panel == t.k ? nil : t.k } } } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t.lbl + (t.k != "tc" ? " ›" : "")).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        Text(t.num).font(.title3.bold()).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                        Text(t.sub).font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading).padding(12)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(panel == t.k ? Paleta.ok.opacity(0.14) : Color(.secondarySystemGroupedBackground)))
                }.buttonStyle(.plain).disabled(t.k == "tc")
            }
        }
        if let k = panel, let p = vm.paneles[k] {
            Tarjeta {
                HStack {
                    Text(p.titulo).font(.headline)
                    Spacer()
                    Button { withAnimation { panel = nil } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }.accessibilityLabel("Cerrar")
                }
                Text("Tocá uno para marcarlo como pagado (5 segundos para deshacer). Se ve igual en todos los aparatos.").font(.caption).foregroundStyle(.secondary)
                if p.filas.isEmpty { Text("Nada por aquí.").foregroundStyle(.secondary) }
                ForEach(p.filas) { FilaPago(r: $0, accion: { tocar($0) }) }
                HStack { Text(p.pie).font(.subheadline); Spacer(); Text(p.total).bold().monospacedDigit() }.padding(.top, 4)
            }
        }
        if let c = vm.cuentas { cuentas(c) }
        calendario(vm.cal)
        if let s = vm.sinFecha { Text(s).font(.caption).foregroundStyle(.secondary) }
        Tarjeta {
            Text("Anualidades, terminados y cancelados").font(.headline)
            Text("Si renuevan algo cancelado, avisame y vuelve al calendario.").font(.caption).foregroundStyle(.secondary)
            ForEach(vm.otros) { g in
                Text(g.titulo).font(.subheadline.weight(.semibold)).padding(.top, 4)
                ForEach(g.filas) { f in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Circle().fill(colorQuien(f.quien)).frame(width: 8, height: 8)
                        VStack(alignment: .leading, spacing: 2) { Text(f.nombre); if !f.sub.isEmpty { Text(f.sub).font(.caption).foregroundStyle(.secondary) } }
                        Spacer(); Text(f.monto).monospacedDigit()
                    }.opacity(f.off ? 0.5 : 1)
                }
            }
        }
    }

    private func cuentas(_ c: RecurrentesVM.Cuentas) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Titulo(texto: "Cuentas")
            Text(c.nota).font(.caption).foregroundStyle(.secondary)
            ForEach(c.lista) { cta in
                Tarjeta {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) { Text(cta.nombre).bold(); Text(cta.sub).font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(cta.saldo).font(.title3.bold()).monospacedDigit().foregroundStyle(cta.bad ? Paleta.bad : .primary)
                            if let a = cta.aprox { Text(a).font(.caption2).foregroundStyle(.secondary) }
                        }
                    }
                    if !cta.cobros.isEmpty {
                        Text("Lo que se cobra en los próximos 35 días").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        ForEach(cta.cobros) { x in
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) { Text(x.nombre).font(.subheadline); Text(x.sub).font(.caption).foregroundStyle(.secondary) }
                                Spacer(); Text(x.monto).font(.subheadline).monospacedDigit().foregroundStyle(x.bad ? Paleta.bad : .primary)
                            }.opacity(x.off ? 0.5 : 1)
                        }
                    }
                    Text(cta.proy).font(.subheadline.weight(.semibold)).foregroundStyle(cta.proyBad ? Paleta.bad : Paleta.ok)
                    if let n = cta.nota { Text(n).font(.caption).foregroundStyle(.secondary) }
                    DisclosureGroup("Actualizar saldo") {
                        HStack {
                            TextField(cta.moneda == "USD" ? "0.00" : "0", text: Binding(get: { saldos[cta.id] ?? "" }, set: { saldos[cta.id] = $0 }))
                                .keyboardType(.numbersAndPunctuation)
                                .padding(10).background(RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemGroupedBackground)))
                            Button("Guardar") { guardarSaldo(cta) }.buttonStyle(.borderedProminent).tint(Paleta.ok)
                        }.padding(.top, 6)
                        Text("Cuando marcás pagado aquí algo que sale de esta cuenta, se descuenta solo.").font(.caption).foregroundStyle(.secondary)
                    }.font(.subheadline.weight(.semibold))
                }
            }
        }
    }

    private func calendario(_ c: RecurrentesVM.Cal) -> some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: 3), count: 7)
        let elegido = c.dias.first { $0.fecha == sel }
        let hoy = Fmt.hoyCR()
        return Tarjeta {
            HStack {
                Text(c.titulo).font(.headline)
                Spacer()
                HStack(spacing: 6) {
                    Button { off -= 1 } label: { Image(systemName: "chevron.left") }.accessibilityLabel("Mes anterior")
                    Button("Hoy") { off = 0; sel = nil }
                    Button { off += 1 } label: { Image(systemName: "chevron.right") }.accessibilityLabel("Mes siguiente")
                }.buttonStyle(.bordered).controlSize(.small)
            }
            HStack(spacing: 12) {
                ForEach(["Jose", "Ali", "Ambos"], id: \.self) { k in HStack(spacing: 4) { Circle().fill(colorQuien(k)).frame(width: 8, height: 8); Text(k) } }
                Text("Borde y ✓ = pagado").foregroundStyle(.secondary)
            }.font(.caption2)
            LazyVGrid(columns: cols, spacing: 3) {
                ForEach(["L", "K", "M", "J", "V", "S", "D"], id: \.self) { Text($0).font(.caption2.bold()).foregroundStyle(.secondary) }
                ForEach(0..<c.lead, id: \.self) { _ in Color.clear.frame(height: 62) }
                ForEach(c.dias) { d in
                    Button { sel = d.fecha } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(d.dia)").font(.caption2.bold()).foregroundStyle(d.fecha == hoy ? Paleta.ok : .primary)
                            ForEach(d.chips.prefix(3)) { ch in
                                Text(ch.nombre).font(.system(size: 8, weight: .semibold)).lineLimit(1)
                                    .padding(.horizontal, 2).frame(maxWidth: .infinity, alignment: .leading)
                                    .foregroundStyle(ch.pagado ? colorQuien(ch.quien) : .white)
                                    .background(RoundedRectangle(cornerRadius: 3).fill(ch.pagado ? Color.clear : colorQuien(ch.quien).opacity(ch.deuda ? 0.7 : 1)))
                                    .overlay(RoundedRectangle(cornerRadius: 3).stroke(ch.pagado ? colorQuien(ch.quien) : .clear, lineWidth: 1))
                            }
                            if d.chips.count > 3 { Text("+\(d.chips.count - 3)").font(.system(size: 8)).foregroundStyle(.secondary) }
                            Spacer(minLength: 0)
                        }
                        .padding(3)
                        .frame(maxWidth: .infinity, minHeight: 62, alignment: .topLeading)
                        .background(RoundedRectangle(cornerRadius: 6).fill(d.fecha == sel ? Paleta.ok.opacity(0.16) : Color(.tertiarySystemGroupedBackground)))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(d.fecha == hoy ? Paleta.ok : .clear, lineWidth: 1.5))
                    }.buttonStyle(.plain)
                }
            }
            if let e = elegido {
                let p = e.fecha.split(separator: "-").compactMap { Int($0) }
                Text("\(p.count == 3 ? "\(p[2]) de \(c.meses[p[1] - 1])" : e.fecha)\(e.porPagar.map { " · \($0) por pagar" } ?? "")").font(.subheadline.weight(.semibold)).padding(.top, 6)
                if e.filas.isEmpty { Text("Nada que pagar este día.").font(.subheadline).foregroundStyle(.secondary) }
                ForEach(e.filas) { r in
                    if r.deuda == true { FilaPago(r: r, accion: nil) } else { FilaPago(r: r, accion: { tocar($0) }) }
                }
            }
        }
    }

    // MARK: Acciones

    private func tocar(_ r: PayRow) {
        if r.pagado { despagar(r); return }
        guard let pago = r.pago else { return }
        let s = sync, recId = r.recId, conCuenta = r.cuenta == true
        tachador.toggle("r:\(r.key)") {
            s.mutate("pagos_recurrentes", kind: "upsert", record: pago, summary: r.pagoSummary ?? "pagó")
            if conCuenta, let id = recId { ajustar(s, id, 1) }
        }
    }

    private func despagar(_ r: PayRow) {
        sync.mutate("pagos_recurrentes", kind: "delete", id: r.key, summary: r.despagoSummary ?? "deshace")
        if r.cuenta == true, let id = r.recId { ajustar(sync, id, -1) }
        nav.avisar(r.despagoToast ?? "Ya no está marcado como pagado")
    }

    /// El saldo de la cuenta se calcula en el momento de guardar.
    private func ajustar(_ s: SyncEngine, _ recId: String, _ signo: Int) {
        let d = s.D(["recurrentes", "cuentas", "tipo_cambio"])
        guard let data = try? Core.shared.vista("ajusteCuenta", d: d, args: [Fmt.hoyCR(), recId, signo]),
              let a = try? JSONDecoder().decode(Armado.self, from: data), let rec = a.recText else { return }
        s.mutate("cuentas", kind: "patch", record: rec, summary: a.summary ?? "saldo")
    }

    private func guardarSaldo(_ c: RecurrentesVM.Cuentas.Cuenta) {
        let d = sync.D(["cuentas"])
        guard let data = try? Core.shared.vista("saldoCuenta", d: d, args: [Fmt.hoyCR(), c.id, saldos[c.id] ?? ""]),
              let a = try? JSONDecoder().decode(Armado.self, from: data) else { return }
        if let e = a.error { nav.avisar(e); return }
        guard let rec = a.recText else { return }
        sync.mutate("cuentas", kind: "patch", record: rec, summary: a.summary ?? "saldo")
        saldos[c.id] = ""
        nav.avisar("Saldo actualizado.")
    }
}

/// Fila de un pago: barrita del color de quién es; tocar = pagar (o deshacer si ya estaba pagado).
struct FilaPago: View {
    let r: PayRow
    let accion: ((PayRow) -> Void)?
    @EnvironmentObject var tachador: Tachador
    var body: some View {
        let seg = tachador.segundos("r:\(r.key)")
        Button { accion?(r) } label: {
            HStack(alignment: .center, spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(colorQuien(r.quien)).frame(width: 4).frame(minHeight: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.nombre).strikethrough(seg != nil).foregroundStyle(r.pagado ? .secondary : .primary).multilineTextAlignment(.leading)
                    Text(r.sub).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                    if let s = seg { Text("Tachado · tocá de nuevo para deshacer (\(s))").font(.caption.weight(.semibold)).foregroundStyle(Paleta.warn) }
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(r.monto).monospacedDigit()
                    if let u = r.usd { Text(u).font(.caption2).foregroundStyle(.secondary) }
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
            .opacity(r.pagado ? 0.7 : 1)
        }
        .buttonStyle(.plain)
        .disabled(accion == nil)
    }
}
