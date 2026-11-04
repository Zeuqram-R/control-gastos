import Foundation

// Lo que devuelve ios/core/resumen.js: textos y números ya armados, igual que en la web.

/// "¿De dónde sale?": la hoja con las cuentas que forman un total.
struct Fuente: Decodable, Identifiable {
    let id = UUID()
    let titulo: String
    let nota: String?
    let grupos: [Grupo]
    let total: Double?
    let totalLbl: String?
    struct Grupo: Decodable, Identifiable {
        let id = UUID()
        let titulo: String
        let signo: String?
        let total: Double?
        let lineas: [Linea]
        let vacio: String?
        private enum CodingKeys: String, CodingKey { case titulo, signo, total, lineas, vacio }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: CodingKeys.self)
            titulo = try c.decode(String.self, forKey: .titulo)
            signo = try c.decodeIfPresent(String.self, forKey: .signo)
            total = try c.decodeIfPresent(Double.self, forKey: .total)
            lineas = (try? c.decodeIfPresent([Linea].self, forKey: .lineas)) ?? []
            vacio = try c.decodeIfPresent(String.self, forKey: .vacio)
        }
    }
    struct Linea: Decodable, Identifiable {
        let id = UUID()
        let nombre: String
        let sub: String?
        let monto: Double?
        let signo: String?
        private enum CodingKeys: String, CodingKey { case nombre, sub, monto, signo }
    }
    private enum CodingKeys: String, CodingKey { case titulo, nota, grupos, total, totalLbl }
}

struct Stat: Decodable, Identifiable {
    let id = UUID()
    let lbl: String
    let num: String
    let sub: String?
    let color: String?
    let fuente: Fuente?
    private enum CodingKeys: String, CodingKey { case lbl, num, sub, color, fuente }
}

struct LineaFondo: Decodable { let lbl: String; let num: String; let bad: Bool }

struct Pago: Decodable, Identifiable {
    let id = UUID()
    let nombre: String
    let sub: String
    let monto: Double?
    let quien: String
    private enum CodingKeys: String, CodingKey { case nombre, sub, monto, quien }
}

struct GenCard: Decodable, Identifiable {
    var id: String { cat }
    let cat: String
    let titulo: String
    let sub: String?
    let stats: [Stat]
    let dias: Double
    let plata: Double
    let over: Bool
    let leyenda: String?
    let hist: [Barra]
    let vacio: String
}

struct Barra: Decodable, Identifiable {
    let id = UUID()
    let label: String
    let total: Double
    private enum CodingKeys: String, CodingKey { case label, total }
}

struct QuincenaVM: Decodable {
    let titulo: String
    let nota: String
    let queda: Double
    let stats: [Stat]
    let fondo: LineaFondo?
    let pagos: [Pago]
    let gen: GenCard
}

struct ProyeccionVM: Decodable {
    let titulo: String
    let sub: String
    let queda: Double
    let stats: [Stat]
    let total: Stat
    let fondo: LineaFondo?
    let pagos: [Pago]
    let nota: String
}

struct CuentasVM: Decodable {
    struct Fila: Decodable, Identifiable {
        let id = UUID()
        let nombre: String; let sub: String; let subBad: Bool; let num: String; let bad: Bool
        private enum CodingKeys: String, CodingKey { case nombre, sub, subBad, num, bad }
    }
    let filas: [Fila]
    let nota: String?
}

struct MetaVM: Decodable, Identifiable {
    let id = UUID()
    let nombre: String
    let pct: Double
    let sub: String
    let estaQ: String?
    private enum CodingKeys: String, CodingKey { case nombre, pct, sub, estaQ }
}

struct TiposVM: Decodable { let cards: [GenCard]; let resto: String? }

struct MesVM: Decodable {
    struct Tile: Decodable, Identifiable {
        let id = UUID()
        let lbl: String; let num: String; let sub: String?; let dir: String?; let fuente: Fuente?
        private enum CodingKeys: String, CodingKey { case lbl, num, sub, dir, fuente }
    }
    struct Cmp: Decodable {
        struct Cat: Decodable, Identifiable {
            var id: String { categoria }
            let categoria: String; let valores: [Double]; let delta: Double
        }
        let nota: String?
        let meses: [Barra]
        let cats: [Cat]
        let enCurso: String?
    }
    let titulo: String
    let nota: String
    let tiles: [Tile]
    let cmp: Cmp?
}

struct MovVM: Decodable, Identifiable {
    let id = UUID()
    let titulo: String
    let sub: String
    let fecha: String
    let monto: Double
    let pill: String?
    let pillTipo: String?
    let buscar: String?
    private enum CodingKeys: String, CodingKey { case titulo, sub, fecha, monto, pill, pillTipo, buscar }
}

struct ResumenVM: Decodable {
    let preguntas: Int
    let anio: String?
    let quincena: QuincenaVM
    let proyecciones: [ProyeccionVM]
    let cuentas: CuentasVM?
    let metas: [MetaVM]
    let negocio: String
    let tipos: TiposVM
    let mes: MesVM
    let movs: [MovVM]
    let meses: [String]
}

struct CategoriaVM: Decodable {
    struct Grupo: Decodable, Identifiable { let id = UUID(); let titulo: String; let total: String; let items: [MovVM]
        private enum CodingKeys: String, CodingKey { case titulo, total, items } }
    let titulo: String
    let nota: String
    let total: String
    let items: [MovVM]
    let pasadas: [Grupo]
}

struct AlcanzaVM: Decodable {
    struct Fila: Decodable, Identifiable { let id = UUID(); let lbl: String; let antes: String; let despues: String; let bad: Bool
        private enum CodingKeys: String, CodingKey { case lbl, antes, despues, bad } }
    let opciones: [[String]]
    let vacio: String?
    let veredicto: String?
    let cls: String?
    let nota: String?
    let filas: [Fila]?
    let metaTxt: String?
    let pie: String?
}

struct OpcionesGasto: Decodable {
    struct Previo: Decodable { let categoria: String?; let tipo: String?; let negocio: Bool }
    let catsCasa: [String]
    let catsNeg: [String]
    let comercios: [String]
    let porComercio: [String: Previo]
    let fuentes: [String]
    let fuentesNeg: [String]
    let cajaNegocio: String
}

struct GastoArmado: Decodable {
    struct Rec: Decodable { let id: String; let comercio: String }
    let error: String?
    let campo: String?
    let rec: Rec?
    let montoCRC: Double?
    let summary: String?
    let undoSummary: String?
    let recText: String?
    let cuentaText: String?
    let undoText: String?
    let cuenta: CuentaArmada?
    struct CuentaArmada: Decodable { let summary: String; let undoSummary: String }
}

/// Todos los archivos que usa el Resumen.
let CLAVES_RESUMEN = ["gastos", "cuentas", "compras", "productos", "eventos", "presupuestos", "ingresos", "saldos", "tipo_cambio",
                      "recurrentes", "deudas", "pagos_recurrentes", "pagos_deudas", "abonos", "metas", "negocio", "pendientes"]
