import Foundation
import JavaScriptCore

/// Corre el mismo calc.js de la app web (empaquetado en core.js) dentro de JavaScriptCore,
/// así los números del iPhone son exactamente los de la web.
final class Core {
    static let shared = Core()
    private let ctx: JSContext
    private(set) var loadError: String?

    private init() {
        ctx = JSContext()!
        ctx.exceptionHandler = { _, exc in
            Core.lastException = exc?.toString()
        }
        if let url = Bundle.main.url(forResource: "core", withExtension: "js"),
           let src = try? String(contentsOf: url, encoding: .utf8) {
            ctx.evaluateScript(src, withSourceURL: url)
            if ctx.objectForKeyedSubscript("Core").isUndefined { loadError = Core.lastException ?? "core.js no cargó" }
        } else {
            loadError = "Falta core.js en la app"
        }
    }

    private static var lastException: String?

    private func invoke(_ fn: String, _ args: [Any]) throws -> String {
        Core.lastException = nil
        let core = ctx.objectForKeyedSubscript("Core")
        guard let core, !core.isUndefined else { throw CoreError.message(loadError ?? "core.js no cargó") }
        let r = core.invokeMethod(fn, withArguments: args)
        if let e = Core.lastException { throw CoreError.message(e) }
        guard let s = r?.toString() else { throw CoreError.message("Sin respuesta de \(fn)") }
        return s
    }

    /// Archivo + cambios pendientes → texto formateado igual que la web.
    func aplicar(base: String, ops: String) throws -> String { try invoke("aplicar", [base, ops]) }
    /// Archivo + cambios pendientes → JSON compacto.
    func datos(base: String, ops: String) throws -> String { try invoke("datos", [base, ops]) }
    /// Llama una función de calc.js: calc("balanceQuincena", D, ["2026-11-03"]).
    func calc(_ nombre: String, d: String, args: [Any]) throws -> Data {
        let a = String(data: try JSONSerialization.data(withJSONObject: args), encoding: .utf8) ?? "[]"
        return Data(try invoke("calc", [nombre, d, a]).utf8)
    }
}

enum CoreError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
}
