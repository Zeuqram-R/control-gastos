import Foundation

/// Lo que devuelve calc.balanceQuincena (solo los campos que usa la app por ahora).
struct Quincena: Decodable { let inicio: String; let fin: String; let numero: Int?; let dias: Int? }

struct Balance: Decodable {
    let q: Quincena
    let queda: Double
    let neto: Double?
    let saldo: Double?
    let gastado: Double?
    let wink: Double?
    let otraCuenta: Double?
    let apartado: Double?
    let winkPagado: Double?
    let arrastre: Double?
    let fijos: Double?
    let deu: Double?
    let porPagar: [PorPagarRaw]?
}

/// Para que Identifiable no choque con ids repetidos (un mismo pago puede salir atrasado y por pagar).
struct PorPagarRaw: Decodable, Identifiable {
    let id: String
    let nombre: String
    let prox: String
    let monto: Double
    let atrasado: Bool

    private enum K: String, CodingKey { case id, nombre, prox, monto_crc, atrasado }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        let rid = (try? c.decode(String.self, forKey: .id)) ?? ""
        prox = (try? c.decode(String.self, forKey: .prox)) ?? ""
        id = "\(rid)_\(prox)"
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? rid
        monto = (try? c.decode(Double.self, forKey: .monto_crc)) ?? 0
        atrasado = (try? c.decode(Bool.self, forKey: .atrasado)) ?? false
    }
}

/// Archivos que necesita calc para el balance (los mismos que pasa la web).
let CLAVES_BALANCE = ["gastos", "cuentas", "presupuestos", "ingresos", "saldos", "tipo_cambio", "recurrentes", "deudas",
                      "pagos_recurrentes", "pagos_deudas", "abonos", "metas", "negocio"]
