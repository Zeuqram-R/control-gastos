import SwiftUI

/// Fase 1: la quincena actual calculada con el mismo calc.js de la web (para comprobar que los números coinciden).
struct ResumenView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @State private var balance: Balance?
    @State private var error: String?

    var body: some View {
        List {
            if !sync.hasData {
                Section {
                    HStack { ProgressView(); Text("Bajando los datos…").padding(.leading, 8) }
                }
            } else if let b = balance {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Queda libre esta quincena").font(.subheadline).foregroundStyle(.secondary)
                        Text(prefs.crc(b.queda))
                            .font(.system(size: 40, weight: .bold, design: .rounded))
                            .foregroundStyle(b.queda < 0 ? Paleta.bad : Paleta.ok)
                            .contentTransition(.numericText())
                        Text("Del \(Fmt.dia(b.q.inicio)) al \(Fmt.dia(b.q.fin))").font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                }
                Section("De dónde sale") {
                    if let a = b.arrastre, a != 0 { fila("Lo que venía de antes", a) }
                    fila("Entró (salario neto)", b.neto ?? 0, color: Paleta.ok)
                    if let s = b.saldo, s != 0 { fila("Saldos a favor", s, color: Paleta.ok) }
                    fila("Gastado", -((b.gastado ?? 0) - (b.wink ?? 0) - (b.otraCuenta ?? 0)))
                    if let a = b.apartado, a != 0 { fila("Apartado para metas", -a) }
                    if let w = b.winkPagado, w != 0 { fila("Pago de la Wink", -w) }
                    fila("Pagos por hacer", -(b.fijos ?? 0))
                    if let d = b.deu, d != 0 { fila("Deudas que vencen", -d) }
                }
                if let pp = b.porPagar, !pp.isEmpty {
                    Section("Por pagar en esta quincena") {
                        ForEach(Array(pp.enumerated()), id: \.offset) { _, p in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.nombre)
                                    Text(p.atrasado ? "Atrasado · \(Fmt.dia(p.prox))" : Fmt.dia(p.prox))
                                        .font(.caption).foregroundStyle(p.atrasado ? Paleta.bad : .secondary)
                                }
                                Spacer()
                                Text(prefs.crc(p.monto)).monospacedDigit()
                            }
                        }
                    }
                }
                Section {
                    Text("Vista de prueba (fase 1). El Resumen completo y el botón Gasto llegan en la fase 2.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            } else if let error {
                Section { Text(error).foregroundStyle(Paleta.bad) }
            }
        }
        .refreshable { await sync.runSync() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { prefs.ocultar.toggle() } label: { Image(systemName: prefs.ocultar ? "eye.slash" : "eye") }
                    .accessibilityLabel(prefs.ocultar ? "Mostrar montos" : "Ocultar montos")
            }
        }
        .task(id: sync.version) { calcular() }
    }

    private func fila(_ t: String, _ v: Double, color: Color? = nil) -> some View {
        HStack {
            Text(t)
            Spacer()
            Text(prefs.crc(v)).monospacedDigit().foregroundStyle(color ?? (v < 0 ? Color.primary : Color.primary))
        }
    }

    private func calcular() {
        guard sync.hasData else { return }
        do {
            let d = sync.D(CLAVES_BALANCE)
            let data = try Core.shared.calc("balanceQuincena", d: d, args: [Fmt.hoyCR()])
            balance = try JSONDecoder().decode(Balance.self, from: data)
            error = nil
        } catch {
            self.error = "No se pudo calcular: \(error.localizedDescription)"
        }
    }
}
