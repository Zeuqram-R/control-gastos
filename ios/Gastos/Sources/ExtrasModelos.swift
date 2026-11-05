import SwiftUI
import UIKit

// Lo que devuelve ios/core/extras.js.

struct MetasVM: Decodable {
    struct T: Decodable, Identifiable { let id = UUID(); let lbl: String; let num: String; let sub: String
        private enum CodingKeys: String, CodingKey { case lbl, num, sub } }
    struct Aporte: Decodable, Identifiable { let id = UUID(); let titulo: String; let sub: String; let monto: String
        private enum CodingKeys: String, CodingKey { case titulo, sub, monto } }
    struct Meta: Decodable, Identifiable {
        let id: String; let nombre: String; let pct: Double; let lista: Bool; let vencida: Bool; let estaQ: Double
        let sub: String; let stats: [Stat]; let sugerido: String?; let aportes: [Aporte]; let quitarLbl: String
    }
    struct Archivada: Decodable, Identifiable { let id: String; let nombre: String; let sub: String }
    struct Deseo: Decodable, Identifiable {
        let id: String; let nombre: String; let foto: String?; let prioridad: Int; let precio: Double?; let para: String; let nota: String
        let precioTxt: String; let sub: String; let raw: String
    }
    struct Hecho: Decodable, Identifiable { let id: String; let nombre: String; let sub: String; let precio: String }
    struct Deseos: Decodable { let nota: String; let lista: [Deseo]; let hechos: [Hecho] }
    let tiles: [T]
    let metas: [Meta]
    let archivadas: [Archivada]
    let deseos: Deseos
}

struct NegocioVM: Decodable {
    struct Mov: Decodable { let id: String?; let venta: Bool; let titulo: String; let sub: String; let monto: String
        var uid: String { id ?? "\(titulo)\(sub)" } }
    let off: Int; let max: Int; let titulo: String; let sub: String; let stats: [Stat]; let porCat: [Barra]; let movs: [Mov]
}

struct AnioVM: Decodable {
    struct Dato: Decodable, Identifiable { var id: String { titulo }; let emoji: String; let titulo: String; let valor: String; let sub: String }
    struct Top: Decodable, Identifiable { var id: Int { rank }; let rank: Int; let producto: String; let sub: String; let monto: String }
    let vacio: String?
    let anio: Int?; let min: Int?; let max: Int?; let titulo: String?; let sub: String?
    let stats: [Stat]?; let porMes: [Barra]?; let porCat: [Barra]?; let masCats: String?; let datos: [Dato]?; let top: [Top]?
}

struct FacturasVM: Decodable {
    struct Pregunta: Decodable, Identifiable { let id: String; let pregunta: String; let detalle: String?; let opciones: [String]; let texto: Bool }
    struct Bandeja: Decodable, Identifiable { let id: String; let titulo: String; let sub: String }
    struct F: Decodable, Identifiable { let id = UUID(); let estado: String; let titulo: String; let sub: String; let total: String?
        private enum CodingKeys: String, CodingKey { case estado, titulo, sub, total } }
    let preguntas: [Pregunta]
    let lugares: [String]
    let bandeja: [Bandeja]
    let lista: [F]
}

struct Armado2: Decodable {
    let error: String?; let recText: String?; let summary: String?
    let deseoText: String?; let deseoSummary: String?
    let fondoText: String?; let fondoSummary: String?
    let toast: String?; let id: String?; let nombre: String?
    let texto: String?; let resumen: String?; let message: String?
}

extension UIImage {
    /// Achica la foto (lado mayor `max` px) y la pasa a JPEG, como la web.
    func jpeg(max: CGFloat, calidad: CGFloat) -> Data? {
        let k = min(1, max / Swift.max(size.width, size.height))
        let nuevo = CGSize(width: (size.width * k).rounded(), height: (size.height * k).rounded())
        let f = UIGraphicsImageRendererFormat.default(); f.scale = 1
        let img = UIGraphicsImageRenderer(size: nuevo, format: f).image { _ in draw(in: CGRect(origin: .zero, size: nuevo)) }
        return img.jpegData(compressionQuality: calidad)
    }
}

/// Cámara del iPhone (para la foto de la factura o del deseo).
struct Camara: UIViewControllerRepresentable {
    let tomada: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coord { Coord(self) }
    final class Coord: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let p: Camara
        init(_ p: Camara) { self.p = p }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { p.tomada(img) }
            p.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { p.dismiss() }
    }
}

func nuevoId(_ prefijo: String) -> String { "\(prefijo)\(SyncEngine.b36(Date().timeIntervalSince1970 * 1000))" }

/// Corre una vista de core.js y la decodifica (para acciones rápidas en el hilo principal).
func armar(_ nombre: String, _ d: String, _ args: [Any]) -> Armado2? {
    guard let data = try? Core.shared.vista(nombre, d: d, args: args) else { return nil }
    return try? JSONDecoder().decode(Armado2.self, from: data)
}

/// Lo mismo pero en segundo plano, para las vistas grandes.
func vistaAsync<T: Decodable>(_ tipo: T.Type, _ nombre: String, _ d: String, _ args: [Any], ocultar: Bool) async -> Result<T, Error> {
    await Task.detached(priority: .userInitiated) {
        do { return .success(try JSONDecoder().decode(T.self, from: try Core.shared.vista(nombre, d: d, args: args, ocultar: ocultar))) }
        catch { return .failure(error) }
    }.value
}
