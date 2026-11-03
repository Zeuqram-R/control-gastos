import Foundation

/// Copia local en el iPhone (Application Support/Gastos): datos del repo, cola de cambios e historial.
/// El token no va aquí: está en el Keychain.
final class LocalStore {
    let root: URL
    private let fm = FileManager.default

    init() {
        let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        root = base.appendingPathComponent("Gastos", isDirectory: true)
        try? fm.createDirectory(at: root.appendingPathComponent("files"), withIntermediateDirectories: true)
        try? fm.createDirectory(at: root.appendingPathComponent("blobs"), withIntermediateDirectories: true)
    }

    private func key(_ path: String) -> String {
        path.replacingOccurrences(of: "/", with: "__")
    }

    // Archivos del repo (data/*.json) tal cual vienen, más el sha de cada uno.
    func fileURL(_ path: String) -> URL { root.appendingPathComponent("files").appendingPathComponent(key(path)) }
    func readFile(_ path: String) -> Data? { try? Data(contentsOf: fileURL(path)) }
    func writeFile(_ path: String, _ data: Data) { try? data.write(to: fileURL(path), options: .atomic) }
    func deleteFile(_ path: String) { try? fm.removeItem(at: fileURL(path)) }

    // Fotos (por sha).
    func blobURL(_ path: String) -> URL { root.appendingPathComponent("blobs").appendingPathComponent(key(path)) }

    func load<T: Decodable>(_ name: String, as: T.Type) -> T? {
        guard let d = try? Data(contentsOf: root.appendingPathComponent(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: d)
    }

    func save<T: Encodable>(_ name: String, _ value: T) {
        guard let d = try? JSONEncoder().encode(value) else { return }
        try? d.write(to: root.appendingPathComponent(name), options: .atomic)
    }

    func remove(_ name: String) { try? fm.removeItem(at: root.appendingPathComponent(name)) }

    func clearAll() {
        try? fm.removeItem(at: root)
        try? fm.createDirectory(at: root.appendingPathComponent("files"), withIntermediateDirectories: true)
        try? fm.createDirectory(at: root.appendingPathComponent("blobs"), withIntermediateDirectories: true)
    }

    func clearData() {
        try? fm.removeItem(at: root.appendingPathComponent("files"))
        try? fm.removeItem(at: root.appendingPathComponent("blobs"))
        try? fm.createDirectory(at: root.appendingPathComponent("files"), withIntermediateDirectories: true)
        try? fm.createDirectory(at: root.appendingPathComponent("blobs"), withIntermediateDirectories: true)
        remove("index.json"); remove("shas.json")
    }

    func sizeOf(_ sub: String) -> (count: Int, bytes: Int) {
        let dir = root.appendingPathComponent(sub)
        let items = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        let bytes = items.reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
        return (items.count, bytes)
    }
}
