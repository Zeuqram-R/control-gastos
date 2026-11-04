import Foundation

// Lo que devuelve ios/core/productos.js.

struct Cambio: Decodable { let texto: String; let dir: String? }

struct ListaVM: Decodable {
    struct Fila: Decodable, Identifiable {
        var id: String { key }
        let key: String
        let clave: String?
        let foto: String?
        let producto: String
        let pedidoId: String?
        let marcado: Bool
        let motivo: String
        let why: String
        let precio: String
        let tachar: String
        let pedido: String?
    }
    struct Grupo: Decodable, Identifiable { var id: String { lugar }; let lugar: String; let total: String?; let filas: [Fila] }
    struct Manual: Decodable { let pedidoId: String; let key: String; let producto: String }
    struct Cmp: Decodable {
        struct F: Decodable, Identifiable { var id: String { titulo }; let titulo: String; let sub: String; let monto: String; let bueno: Bool }
        let nota: String
        let filas: [F]
        let unLugar: String?
    }
    let nota: String
    let vacia: Bool
    let pendientes: Int
    let grupos: [Grupo]
    let marcados: [Fila]
    let manualesTachados: [Manual]
    let texto: String
    let cmp: Cmp?
    let sugerencias: [String]
}

struct ProductosVM: Decodable {
    struct Venc: Decodable, Identifiable { var id: String { clave }; let clave: String; let foto: String?; let producto: String; let sub: String; let cuando: String; let nivel: String? }
    struct Comp: Decodable, Identifiable {
        struct T: Decodable, Identifiable { var id: String { texto }; let texto: String; let mejor: Bool }
        var id: String { clave }; let clave: String; let producto: String; let ahorro: String; let tipos: [T]
    }
    struct Prod: Decodable, Identifiable {
        struct Orden: Decodable { let ref: Double?; let cambio: Double?; let gasto: Double? }
        var id: String { clave }
        let clave: String; let foto: String?; let producto: String; let dueno: String; let sub: String; let precio: String
        let cambio: Cambio?; let buscar: String; let orden: Orden
    }
    struct Compra: Decodable, Identifiable {
        let id = UUID()
        let clave: String?; let foto: String?; let producto: String; let sub: String; let monto: String; let buscar: String
        private enum CodingKeys: String, CodingKey { case clave, foto, producto, sub, monto, buscar }
    }
    struct Iva: Decodable {
        struct P: Decodable, Identifiable { let id = UUID(); let producto: String; let alternativa: String?; let monto: String
            private enum CodingKeys: String, CodingKey { case producto, alternativa, monto } }
        let titulo: String; let stats: [Stat]; let pct13: Double; let prods: [P]
    }
    let venc: [Venc]
    let comparar: [Comp]
    let lista: [Prod]
    let total: Int
    let compras: [Compra]
    let porCategoria: [Barra]
    let porDueno: [Barra]
    let iva: Iva
}

struct ProductoVM: Decodable {
    struct Nombre: Decodable, Identifiable { var id: String { lugar }; let lugar: String; let nombres: String }
    struct Fila: Decodable, Identifiable { let id = UUID(); let titulo: String; let sub: String
        private enum CodingKeys: String, CodingKey { case titulo, sub } }
    struct Punto: Decodable, Identifiable { let id = UUID(); let fecha: String; let precio: Double; let lugar: String
        private enum CodingKeys: String, CodingKey { case fecha, precio, lugar } }
    struct Lugar: Decodable, Identifiable { var id: String { lugar }; let lugar: String; let sub: String; let cambio: Cambio? }
    struct Otra: Decodable, Identifiable { var id: String { clave }; let clave: String; let titulo: String; let este: Bool; let monto: String; let mejor: Bool }
    struct Hist: Decodable, Identifiable { let id = UUID(); let titulo: String; let sub: String; let monto: String
        private enum CodingKeys: String, CodingKey { case titulo, sub, monto } }
    struct Refri: Decodable { let sugerido: Int; let conocido: Bool; let nota: String }
    let error: String?
    let clave: String?
    let id: String?
    let producto: String?
    let foto: String?
    let mini: String?
    let tags: [String]?
    let nombres: [Nombre]?
    let stats: [Stat]?
    let eventos: [Fila]?
    let evTxt: [String: String]?
    let enLista: Bool?
    let refri: Refri?
    let puntos: [Punto]?
    let porLugar: [Lugar]?
    let dueno: String?
    let ubicacion: String?
    let ubicaciones: [String]?
    let duraciones: [Fila]?
    let otras: [Otra]?
    let otrasVacio: String?
    let historial: [Hist]?
}

struct Armado: Decodable { let error: String?; let recText: String?; let summary: String? }

let CLAVES_PRODUCTOS = ["compras", "productos", "eventos", "lugares", "lista"]

/// JSON con los campos en el orden dado (como lo escribe la web).
func jsonObj(_ campos: [(String, Any?)]) -> String {
    "{" + campos.map { k, v in "\(jsonStr(k)):\(jsonVal(v))" }.joined(separator: ",") + "}"
}

func jsonVal(_ v: Any?) -> String {
    switch v {
    case nil, is NSNull: return "null"
    case let s as String: return jsonStr(s)
    case let b as Bool: return b ? "true" : "false"
    case let i as Int: return String(i)
    case let d as Double: return d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : String(d)
    default: return "null"
    }
}
