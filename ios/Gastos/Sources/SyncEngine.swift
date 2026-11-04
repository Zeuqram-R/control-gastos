import Foundation
import Network
import UIKit

// Motor de sincronización: la misma lógica que js/sync.js.
// Copia local de los datos + cola de cambios que se suben a GitHub cuando hay internet.

struct AppConfig: Codable, Equatable {
    var persona: String
    var dispositivo: String
}

/// Un cambio hecho en este aparato, esperando subir. `record` es el JSON del registro tal cual (para no cambiar el orden de los campos).
struct Op: Codable, Equatable {
    var kind: String        // upsert | patch | delete
    var file: String        // data/<nombre>.json
    var uid: String
    var at: String
    var by: String
    var summary: String
    var recId: String?      // solo para delete
    var record: String?     // JSON del registro (upsert / patch)

    var jsText: String {
        var s = "{\"kind\":\(jsonStr(kind))"
        if kind == "delete" { s += ",\"id\":\(jsonStr(recId ?? ""))" }
        if let record { s += ",\"record\":\(record)" }
        return s + "}"
    }
}

struct Upload: Codable {
    struct File: Codable { var path: String; var b64: String }
    var id: String
    var at: String
    var files: [File]
    var message: String
    var resumen: String
}

struct LogEntry: Codable, Identifiable, Equatable {
    var id: String
    var at: String
    var ok: Bool
    var tipo: String
    var titulo: String
    var detalle: String
    var veces: Int?
}

enum SyncState: String { case idle, checking, downloading, uploading, offline, error }

func jsonStr(_ s: String) -> String {
    (try? String(data: JSONSerialization.data(withJSONObject: s, options: .fragmentsAllowed), encoding: .utf8)) ?? "\"\""
}

let isoFmt: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

@MainActor
final class SyncEngine: ObservableObject {
    static let dataPrefix = "data/"

    @Published private(set) var config: AppConfig?
    @Published private(set) var state: SyncState = .idle
    @Published private(set) var message = ""
    @Published private(set) var lastSync: Date?
    @Published private(set) var log: [LogEntry] = []
    @Published private(set) var queue: [Op] = []
    @Published private(set) var uploads: [Upload] = []
    /// Sube cada vez que cambian los datos (las vistas se recalculan).
    @Published private(set) var version = 0

    var pending: Int { queue.count + uploads.count }
    var hasData: Bool { !files.isEmpty }
    var tokenExp: String? { client?.tokenExp }

    private var files: [String: String] = [:]   // data/*.json -> sha
    private var shas: [String: String] = [:]    // todo el repo (incluye fotos)
    private var client: GitHubClient?
    private var syncing = false
    private var again = false
    private var retryTask: Task<Void, Never>?
    private var retryDelay: Double = 4
    private var cache: [String: String] = [:]
    private let store = LocalStore()
    private let monitor = NWPathMonitor()

    init() {
        config = store.load("config.json", as: AppConfig.self)
        if config != nil, let t = Keychain.get("token") { client = GitHubClient(token: t) }
        if config != nil && client == nil { config = nil } // sin token no hay conexión
        files = store.load("index.json", as: [String: String].self) ?? [:]
        shas = store.load("shas.json", as: [String: String].self) ?? [:]
        queue = store.load("queue.json", as: [Op].self) ?? []
        uploads = store.load("uploads.json", as: [Upload].self) ?? []
        log = store.load("log.json", as: [LogEntry].self) ?? []
        if let s = UserDefaults.standard.string(forKey: "lastSync") { lastSync = isoFmt.date(from: s) }
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in
                if let self, self.state == .offline || self.state == .error { self.sync() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "red"))
    }

    var connected: Bool { config != nil && client != nil }

    // MARK: Conexión

    func connect(token: String, persona: String, dispositivo: String) async throws {
        let c = GitHubClient(token: token)
        let access = try await c.checkAccess()
        if !access.canWrite { throw GitHubError(status: 403, message: "El token puede leer pero no escribir. Revisá que tenga Contents: Read and write.") }
        guard Keychain.set("token", token) else { throw GitHubError(status: -1, message: "No se pudo guardar el token en el Keychain.") }
        let cfg = AppConfig(persona: persona, dispositivo: dispositivo)
        store.save("config.json", cfg)
        client = c
        config = cfg
        sync()
    }

    func updateConfig(persona: String? = nil, dispositivo: String? = nil) {
        guard var c = config else { return }
        if let persona { c.persona = persona }
        if let dispositivo { c.dispositivo = dispositivo }
        config = c
        store.save("config.json", c)
    }

    func replaceToken(_ token: String) async throws {
        let c = GitHubClient(token: token)
        let access = try await c.checkAccess()
        if !access.canWrite { throw GitHubError(status: 403, message: "El token puede leer pero no escribir.") }
        Keychain.set("token", token)
        client = c
        sync()
    }

    func disconnect() {
        retryTask?.cancel()
        Keychain.delete("token")
        store.clearAll()
        UserDefaults.standard.removeObject(forKey: "lastSync")
        config = nil; client = nil; files = [:]; shas = [:]; queue = []; uploads = []; log = []; lastSync = nil
        state = .idle; message = ""
        invalidate()
    }

    /// Borra la copia local y la vuelve a bajar (la cola de cambios no se toca).
    func redownload() {
        store.clearData()
        files = [:]; shas = [:]
        invalidate()
        sync()
    }

    func clearLog() { log = []; store.save("log.json", log) }

    func storageInfo() -> (archivos: Int, bytes: Int, fotos: Int, fotosBytes: Int) {
        let a = store.sizeOf("files"), b = store.sizeOf("blobs")
        return (a.count, a.bytes, b.count, b.bytes)
    }

    // MARK: Datos

    private func invalidate() { cache = [:]; version += 1 }

    /// Datos de un archivo (data/<name>.json) con los cambios pendientes aplicados, en JSON compacto.
    func data(_ name: String) -> String {
        if let c = cache[name] { return c }
        let path = "\(Self.dataPrefix)\(name).json"
        var base = store.readFile(path).map { String(decoding: $0, as: UTF8.self) } ?? "[]"
        if base.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { base = "[]" }
        let ops = queue.filter { $0.file == path }
        var out = base
        if !ops.isEmpty, let r = try? Core.shared.datos(base: base, ops: opsText(ops)) { out = r }
        cache[name] = out
        return out
    }

    /// Objeto D para calc.js: {"gastos": [...], "cuentas": [...], ...}
    func D(_ names: [String]) -> String {
        "{" + names.map { "\(jsonStr($0)):\(data($0))" }.joined(separator: ",") + "}"
    }

    func photoExists(_ path: String) -> Bool { shas[path] != nil }

    /// Ids con cambios todavía sin subir (para mostrarlos un poco apagados).
    func pendingIds(_ name: String) -> Set<String> {
        let path = "\(Self.dataPrefix)\(name).json"
        return Set(queue.filter { $0.file == path }.compactMap { $0.recId })
    }

    // MARK: Fotos (se bajan por su sha y quedan guardadas en el aparato)

    private let fotoMem = NSCache<NSString, UIImage>()
    private var fotoTasks: [String: Task<UIImage?, Never>] = [:]

    func photo(_ path: String) async -> UIImage? {
        guard let sha = shas[path] else { return nil }
        let k = "\(path)#\(sha)" as NSString
        if let i = fotoMem.object(forKey: k) { return i }
        if let t = fotoTasks[path] { return await t.value }
        let url = store.blobURL(path), shaURL = store.blobURL(path + ".sha")
        let client = self.client
        let t = Task<UIImage?, Never>.detached(priority: .utility) {
            let guardada = try? Data(contentsOf: url)
            if let s = try? String(contentsOf: shaURL, encoding: .utf8), s == sha, let d = guardada, let i = UIImage(data: d) { return i }
            guard let client, let d = try? await client.blob(sha), let i = UIImage(data: d) else {
                return guardada.flatMap { UIImage(data: $0) }
            }
            try? d.write(to: url, options: .atomic)
            try? sha.write(to: shaURL, atomically: true, encoding: .utf8)
            return i
        }
        fotoTasks[path] = t
        let i = await t.value
        fotoTasks[path] = nil
        if let i { fotoMem.setObject(i, forKey: k) }
        return i
    }

    private func opsText(_ ops: [Op]) -> String { "[" + ops.map(\.jsText).joined(separator: ",") + "]" }

    /// Un cambio hecho en este aparato: queda en la cola y se intenta subir.
    func mutate(_ name: String, kind: String, record: String? = nil, id: String? = nil, summary: String) {
        let cfg = config
        var id = id
        if id == nil, let r = record, let o = try? JSONSerialization.jsonObject(with: Data(r.utf8)) as? [String: Any] {
            id = (o["id"] as? String) ?? (o["id"] as? NSNumber)?.stringValue
        }
        queue.append(Op(kind: kind, file: "\(Self.dataPrefix)\(name).json",
                        uid: "\(Self.b36(Date().timeIntervalSince1970 * 1000))-\(Self.rand(6))",
                        at: isoFmt.string(from: Date()),
                        by: cfg.map { "\($0.persona) (\($0.dispositivo))" } ?? "desconocido",
                        summary: summary, recId: id, record: record))
        store.save("queue.json", queue)
        invalidate()
        sync()
    }

    static func b36(_ v: Double) -> String { String(Int64(v), radix: 36) }
    static func rand(_ n: Int) -> String { String((0..<n).map { _ in "abcdefghijklmnopqrstuvwxyz0123456789".randomElement()! }) }

    // MARK: Sincronizar

    func sync() { Task { await runSync() } }

    func runSync() async {
        guard let client else { return }
        if syncing { again = true; return }
        syncing = true
        retryTask?.cancel()
        let wasOffline = state == .offline
        state = .checking; message = wasOffline ? "reintento" : ""
        do {
            try await flush(client)
            state = .checking; message = ""
            try await pull(client)
            let now = Date()
            lastSync = now
            UserDefaults.standard.set(isoFmt.string(from: now), forKey: "lastSync")
            retryDelay = 4
            state = .idle; message = ""
        } catch {
            let ge = error as? GitHubError
            let offline = ge?.offline ?? false
            let auth = ge?.auth ?? false
            message = auth ? "El token ya no sirve. Creá uno nuevo en Ajustes." : (offline ? "" : error.localizedDescription)
            state = offline ? .offline : .error
            addLog(ok: false, tipo: offline ? "conexion" : "error",
                   titulo: offline ? "Sin conexión" : "No se pudo sincronizar",
                   detalle: (offline ? "No se pudo llegar a GitHub." : message) + (queue.isEmpty ? "" : " \(queue.count) cambio(s) esperan para subir."))
            if !auth {
                let delay = retryDelay
                retryTask = Task { [weak self] in
                    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                    if Task.isCancelled { return }
                    await self?.runSync()
                }
                retryDelay = min(retryDelay * 2, 60)
            }
        }
        syncing = false
        if again { again = false; await runSync() }
    }

    private func nombre(_ path: String) -> String {
        path.replacingOccurrences(of: Self.dataPrefix, with: "").replacingOccurrences(of: ".json", with: "").replacingOccurrences(of: "_", with: " ")
    }

    private func addLog(ok: Bool, tipo: String, titulo: String, detalle: String) {
        let now = isoFmt.string(from: Date())
        if !ok, var last = log.first, !last.ok, last.titulo == titulo {
            last.at = now; last.veces = (last.veces ?? 1) + 1; last.detalle = detalle
            log[0] = last
        } else {
            log.insert(LogEntry(id: "L\(Self.b36(Date().timeIntervalSince1970 * 1000))\(Self.rand(3))", at: now, ok: ok, tipo: tipo, titulo: titulo, detalle: detalle), at: 0)
            if log.count > 300 { log = Array(log.prefix(300)) }
        }
        store.save("log.json", log)
    }

    private func flush(_ client: GitHubClient) async throws {
        while let u = uploads.first {
            state = .uploading; message = "Subiendo factura (\(u.files.count) archivo\(u.files.count == 1 ? "" : "s"))"
            try await client.commitFiles(u.files.map { ($0.path, $0.b64) }, message: u.message)
            uploads.removeFirst()
            store.save("uploads.json", uploads)
            addLog(ok: true, tipo: "subida", titulo: "Subió una factura", detalle: u.resumen.isEmpty ? u.message : u.resumen)
        }
        while let first = queue.first {
            state = .uploading; message = queue.count > 1 ? "Subiendo \(queue.count) cambios" : "Subiendo 1 cambio"
            let path = first.file
            let ops = queue.filter { $0.file == path }
            var done = false
            var attempt = 0
            while attempt < 4 && !done {
                attempt += 1
                var current = "[]"
                var sha: String? = nil
                do {
                    let f = try await client.getFile(path)
                    sha = f.sha
                    current = String(decoding: f.data, as: UTF8.self)
                } catch let e as GitHubError where e.status == 404 {
                    current = "[]"
                }
                // Nunca se sube encima de un archivo que no se pudo leer bien.
                guard (try? JSONSerialization.jsonObject(with: Data(current.utf8))) != nil else {
                    throw GitHubError(status: -1, message: "No se pudo leer \(nombre(path)) de GitHub.")
                }
                let next = try Core.shared.aplicar(base: current, ops: opsText(ops))
                let who = ops.last?.by ?? "desconocido"
                let what = ops.map(\.summary).filter { !$0.isEmpty }.prefix(3).joined(separator: "; ")
                do {
                    let newSha = try await client.putFile(path, data: Data(next.utf8), sha: sha, message: "\(who): \(what.isEmpty ? "\(ops.count) cambio(s)" : what)")
                    store.writeFile(path, Data(next.utf8))
                    files[path] = newSha
                    store.save("index.json", files)
                    done = true
                } catch let e as GitHubError where e.status == 409 || e.status == 422 {
                    // Alguien más cambió el archivo: se vuelve a leer y se reintenta.
                }
            }
            if !done { throw GitHubError(status: 409, message: "No se pudo guardar por cambios al mismo tiempo; se reintenta luego.") }
            let uids = Set(ops.map(\.uid))
            queue.removeAll { uids.contains($0.uid) }
            store.save("queue.json", queue)
            invalidate()
            addLog(ok: true, tipo: "subida", titulo: "Subió \(ops.count == 1 ? "1 cambio" : "\(ops.count) cambios") en \(nombre(path))",
                   detalle: ops.map(\.summary).filter { !$0.isEmpty }.joined(separator: " · "))
        }
    }

    private func pull(_ client: GitHubClient) async throws {
        let first = files.isEmpty
        let tree = try await client.tree()
        var shaMap: [String: String] = [:]
        var toGet: [TreeEntry] = []
        var seen = Set<String>()
        for f in tree {
            shaMap[f.path] = f.sha
            guard f.path.hasPrefix(Self.dataPrefix), f.path.hasSuffix(".json") else { continue }
            seen.insert(f.path)
            if files[f.path] != f.sha { toGet.append(f) }
        }
        var changed = false
        for (i, f) in toGet.enumerated() {
            state = .downloading
            message = toGet.count > 1 ? "Bajando \(i + 1) de \(toGet.count)" : "Bajando \(nombre(f.path))"
            let d = try await client.blob(f.sha)
            _ = try JSONSerialization.jsonObject(with: d) // que sea JSON válido
            store.writeFile(f.path, d)
            files[f.path] = f.sha
            store.save("index.json", files)
            changed = true
        }
        var removed: [String] = []
        for path in files.keys where !seen.contains(path) {
            files[path] = nil; store.deleteFile(path); removed.append(path); changed = true
        }
        store.save("index.json", files)
        shas = shaMap
        store.save("shas.json", shas)
        if first && !toGet.isEmpty {
            addLog(ok: true, tipo: "bajada", titulo: "Bajó todos los datos", detalle: "\(toGet.count) archivos")
        } else {
            for f in toGet {
                let quien = try? await client.lastCommit(f.path)
                addLog(ok: true, tipo: "bajada", titulo: "Bajó cambios en \(nombre(f.path))", detalle: quien ?? "")
            }
            for p in removed { addLog(ok: true, tipo: "bajada", titulo: "Se quitó \(nombre(p))", detalle: "") }
        }
        if changed { invalidate() }
    }
}
