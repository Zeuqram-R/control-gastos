import Foundation

/// Acceso al repo privado de datos por la API de GitHub (lo mismo que js/github.js).
enum Repo {
    static let owner = "Zeuqram-R"
    static let name = "control-gastos-datos"
    static let branch = "main"
}

struct GitHubError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
    var offline: Bool { status == 0 }
    var auth: Bool { status == 401 || status == 403 }
}

struct TreeEntry { let path: String; let sha: String; let size: Int }

final class GitHubClient {
    private let token: String
    private let session: URLSession
    private(set) var tokenExp: String?
    private let base = "/repos/\(Repo.owner)/\(Repo.name)"

    init(token: String) {
        self.token = token
        let c = URLSessionConfiguration.default
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.urlCache = nil
        c.timeoutIntervalForRequest = 30
        c.waitsForConnectivity = false
        session = URLSession(configuration: c)
    }

    @discardableResult
    private func call(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> Any? {
        guard let url = URL(string: "https://api.github.com" + path) else { throw GitHubError(status: -1, message: "Dirección inválida") }
        var r = URLRequest(url: url)
        r.httpMethod = method
        r.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        r.setValue("ControlGastos-iOS", forHTTPHeaderField: "User-Agent")
        if let body {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let resp: URLResponse
        do { (data, resp) = try await session.data(for: r) }
        catch { throw GitHubError(status: 0, message: "Sin conexión") }
        guard let http = resp as? HTTPURLResponse else { throw GitHubError(status: 0, message: "Sin conexión") }
        if let exp = http.value(forHTTPHeaderField: "github-authentication-token-expiration") { tokenExp = exp }
        let json = data.isEmpty ? nil : try? JSONSerialization.jsonObject(with: data)
        guard (200..<300).contains(http.statusCode) else {
            let msg = (json as? [String: Any])?["message"] as? String ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw GitHubError(status: http.statusCode, message: msg)
        }
        return json
    }

    private static func enc(_ path: String) -> String {
        path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? path
    }

    /// Revisa que el token sirva y pueda escribir.
    func checkAccess() async throws -> (canWrite: Bool, isPrivate: Bool) {
        let r = try await call(base) as? [String: Any] ?? [:]
        let perms = r["permissions"] as? [String: Any] ?? [:]
        return ((perms["push"] as? Bool) ?? false, (r["private"] as? Bool) ?? false)
    }

    /// Todos los archivos del repo con su sha.
    func tree() async throws -> [TreeEntry] {
        let r = try await call("\(base)/git/trees/\(Repo.branch)?recursive=1") as? [String: Any] ?? [:]
        let t = r["tree"] as? [[String: Any]] ?? []
        return t.compactMap { e in
            guard e["type"] as? String == "blob", let p = e["path"] as? String, let s = e["sha"] as? String else { return nil }
            return TreeEntry(path: p, sha: s, size: e["size"] as? Int ?? 0)
        }
    }

    func blob(_ sha: String) async throws -> Data {
        let r = try await call("\(base)/git/blobs/\(sha)") as? [String: Any] ?? [:]
        guard let c = r["content"] as? String, let d = Data(base64Encoded: c, options: .ignoreUnknownCharacters) else {
            throw GitHubError(status: -1, message: "Archivo dañado")
        }
        return d
    }

    func getFile(_ path: String) async throws -> (sha: String, data: Data) {
        let r = try await call("\(base)/contents/\(Self.enc(path))?ref=\(Repo.branch)") as? [String: Any] ?? [:]
        guard let sha = r["sha"] as? String else { throw GitHubError(status: -1, message: "Archivo dañado") }
        let c = r["content"] as? String ?? ""
        // Archivos de más de 1 MB vienen sin contenido: se bajan por su sha.
        if c.isEmpty || (r["encoding"] as? String) == "none" { return (sha, try await blob(sha)) }
        guard let d = Data(base64Encoded: c, options: .ignoreUnknownCharacters) else { throw GitHubError(status: -1, message: "Archivo dañado") }
        return (sha, d)
    }

    func lastCommit(_ path: String) async throws -> String? {
        let p = path.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? path
        let r = try await call("\(base)/commits?path=\(p)&sha=\(Repo.branch)&per_page=1") as? [[String: Any]] ?? []
        let msg = ((r.first?["commit"] as? [String: Any])?["message"] as? String) ?? ""
        return msg.isEmpty ? nil : String(msg.split(separator: "\n").first ?? "")
    }

    /// Varios archivos en un solo commit (factura: fotos + ficha).
    func commitFiles(_ files: [(path: String, b64: String)], message: String) async throws {
        let ref = try await call("\(base)/git/ref/heads/\(Repo.branch)") as? [String: Any] ?? [:]
        guard let parent = (ref["object"] as? [String: Any])?["sha"] as? String else { throw GitHubError(status: -1, message: "Sin rama main") }
        let pc = try await call("\(base)/git/commits/\(parent)") as? [String: Any] ?? [:]
        guard let baseTree = (pc["tree"] as? [String: Any])?["sha"] as? String else { throw GitHubError(status: -1, message: "Commit inválido") }
        var tree: [[String: Any]] = []
        for f in files {
            let b = try await call("\(base)/git/blobs", method: "POST", body: ["content": f.b64, "encoding": "base64"]) as? [String: Any] ?? [:]
            tree.append(["path": f.path, "mode": "100644", "type": "blob", "sha": b["sha"] as? String ?? ""])
        }
        let t = try await call("\(base)/git/trees", method: "POST", body: ["base_tree": baseTree, "tree": tree]) as? [String: Any] ?? [:]
        let c = try await call("\(base)/git/commits", method: "POST", body: ["message": message, "tree": t["sha"] as? String ?? "", "parents": [parent]]) as? [String: Any] ?? [:]
        try await call("\(base)/git/refs/heads/\(Repo.branch)", method: "PATCH", body: ["sha": c["sha"] as? String ?? ""])
    }

    func putFile(_ path: String, data: Data, sha: String?, message: String) async throws -> String {
        var body: [String: Any] = ["message": message, "content": data.base64EncodedString(), "branch": Repo.branch]
        if let sha { body["sha"] = sha }
        let r = try await call("\(base)/contents/\(Self.enc(path))", method: "PUT", body: body) as? [String: Any] ?? [:]
        return ((r["content"] as? [String: Any])?["sha"] as? String) ?? ""
    }
}
