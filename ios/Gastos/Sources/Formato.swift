import Foundation
import SwiftUI

enum Fmt {
    /// ₡12,345 (igual que la web: separador de miles con coma y signo − verdadero).
    static func crc(_ v: Double, hide: Bool = false) -> String {
        if hide { return "₡•••••" }
        let n = Int((v).rounded())
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.maximumFractionDigits = 0
        return "\(n < 0 ? "−" : "")₡\(f.string(from: NSNumber(value: abs(n))) ?? "\(abs(n))")"
    }

    /// Hoy en Costa Rica (UTC−6), como todayCR() de la web.
    static func hoyCR() -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/Costa_Rica") ?? TimeZone(secondsFromGMT: -6 * 3600)
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    /// "3 nov" a partir de "2026-11-03".
    static func dia(_ s: String?) -> String {
        guard let s, s.count >= 10 else { return "—" }
        let p = s.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return "—" }
        let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"]
        return "\(p[2]) \(meses[max(0, min(11, p[1] - 1))])"
    }

    static func hace(_ d: Date?) -> String {
        guard let d else { return "nunca" }
        let s = Int(Date().timeIntervalSince(d))
        if s < 45 { return "hace un momento" }
        if s < 3600 { return "hace \(max(1, s / 60)) min" }
        if s < 86400 { return "hace \(s / 3600) h" }
        return "hace \(s / 86400) d"
    }

    static func hace(iso: String) -> String { hace(isoFmt.date(from: iso)) }
}

enum Paleta {
    static let ok = Color(red: 0.180, green: 0.616, blue: 0.357)
    static let warn = Color(red: 0.780, green: 0.416, blue: 0.071)
    static let bad = Color(red: 0.769, green: 0.239, blue: 0.239)
    static let blue = Color(red: 0.184, green: 0.416, blue: 0.659)
    static let marca = Color(red: 0.067, green: 0.227, blue: 0.204)
    static let moneda = Color(red: 0.941, green: 0.773, blue: 0.369)
}
