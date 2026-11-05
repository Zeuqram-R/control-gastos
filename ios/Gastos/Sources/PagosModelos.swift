import SwiftUI

// Lo que devuelve ios/core/pagos.js.

struct PayRow: Decodable, Identifiable {
    var id: String { key }
    let key: String
    let recId: String?
    let quien: String
    let pagado: Bool
    let nombre: String
    let sub: String
    let monto: String
    let usd: String?
    let pago: String?
    let pagoSummary: String?
    let despagoSummary: String?
    let despagoToast: String?
    let cuenta: Bool?
    let deuda: Bool?
}

struct Tile: Decodable, Identifiable { var id: String { k }; let k: String; let lbl: String; let num: String; let sub: String; let color: String? }

struct RecurrentesVM: Decodable {
    struct Panel: Decodable { let titulo: String; let filas: [PayRow]; let pie: String; let total: String }
    struct Cuentas: Decodable {
        struct Cobro: Decodable, Identifiable { let id = UUID(); let nombre: String; let off: Bool; let sub: String; let monto: String; let bad: Bool
            private enum CodingKeys: String, CodingKey { case nombre, off, sub, monto, bad } }
        struct Cuenta: Decodable, Identifiable {
            let id: String; let nombre: String; let moneda: String; let sub: String; let saldo: String; let bad: Bool
            let aprox: String?; let cobros: [Cobro]; let proy: String; let proyBad: Bool; let nota: String?
        }
        let nota: String
        let lista: [Cuenta]
    }
    struct Dia: Decodable, Identifiable {
        struct Chip: Decodable, Identifiable { let id = UUID(); let nombre: String; let quien: String; let pagado: Bool; let deuda: Bool
            private enum CodingKeys: String, CodingKey { case nombre, quien, pagado, deuda } }
        var id: String { fecha }
        let fecha: String; let dia: Int; let chips: [Chip]; let porPagar: String?; let filas: [PayRow]
    }
    struct Cal: Decodable { let titulo: String; let mes: String; let lead: Int; let dias: [Dia]; let inicial: String; let meses: [String] }
    struct Otro: Decodable, Identifiable {
        struct F: Decodable, Identifiable { let id = UUID(); let off: Bool; let quien: String; let nombre: String; let sub: String; let monto: String
            private enum CodingKeys: String, CodingKey { case off, quien, nombre, sub, monto } }
        var id: String { titulo }; let titulo: String; let filas: [F]
    }
    let tiles: [Tile]
    let paneles: [String: Panel]
    let cuentas: Cuentas?
    let cal: Cal
    let sinFecha: String?
    let otros: [Otro]
}

struct DeudasVM: Decodable {
    struct Item: Decodable, Identifiable {
        let id: String; let moneda: String; let persona: String; let concepto: String; let monto: String
        let nota: String?; let abonado: String?; let abonoMini: String?; let abonoLbl: String; let pago: String; let pagoSummary: String
    }
    struct Fija: Decodable { let cuotas: String; let monto: String; let abonado: String?; let nota: String }
    struct Grupo: Decodable, Identifiable {
        var id: String { gk }
        let gk: String; let persona: String; let debemos: Bool; let pill: String; let total: String; let multi: Bool
        let fija: Fija?; let items: [Item]; let mas: String
    }
    struct Hecho: Decodable, Identifiable { let id: String; let debemos: Bool; let titulo: String; let sub: String; let monto: String; let otro: String?; let summary: String }
    let tiles: [Tile]
    let titulo: String
    let grupos: [Grupo]
    let abonos: [Hecho]
    let pagadas: [Hecho]
    let personas: [String]
}

func colorQuien(_ q: String?) -> Color {
    switch q {
    case "Ali": return Color(red: 0.831, green: 0.435, blue: 0.706)
    case "Jose": return Color(red: 0.310, green: 0.561, blue: 0.910)
    default: return Paleta.ok
    }
}

/// Tachar con 5 segundos para deshacer (como en la web): tocar otra vez lo cancela; al llegar a 0 se guarda.
@MainActor
final class Tachador: ObservableObject {
    @Published private(set) var pendientes: [String: Int] = [:]
    private var tareas: [String: Task<Void, Never>] = [:]

    func segundos(_ key: String) -> Int? { pendientes[key] }

    func toggle(_ key: String, commit: @escaping () -> Void) {
        if tareas[key] != nil {
            tareas[key]?.cancel(); tareas[key] = nil; pendientes[key] = nil
            UISelectionFeedbackGenerator().selectionChanged()
            return
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        pendientes[key] = 5
        tareas[key] = Task { [weak self] in
            for n in stride(from: 4, through: 0, by: -1) {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                self?.pendientes[key] = n
            }
            guard let self, !Task.isCancelled else { return }
            self.tareas[key] = nil
            self.pendientes[key] = nil
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            commit()
        }
    }
}

let CLAVES_PAGOS = CLAVES_RESUMEN
