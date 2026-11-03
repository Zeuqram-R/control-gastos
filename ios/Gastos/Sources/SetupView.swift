import SwiftUI

struct SetupView: View {
    @EnvironmentObject var sync: SyncEngine
    @State private var token = ""
    @State private var persona = "Jose"
    @State private var dispositivo = UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
    @State private var error: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "dollarsign.circle.fill").font(.system(size: 40)).foregroundStyle(Paleta.moneda, Paleta.marca)
                        VStack(alignment: .leading) {
                            Text("Control de gastos").font(.title3.bold())
                            Text("App de iPhone").foregroundStyle(.secondary).font(.subheadline)
                        }
                    }.padding(.vertical, 4)
                }
                Section {
                    Text("Se hace una sola vez por aparato. El token se queda guardado solo en el Keychain de este aparato.")
                        .font(.footnote).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 8) {
                        paso(1, Text("Entrá a [crear un token de GitHub](https://github.com/settings/personal-access-tokens/new)."))
                        paso(2, Text("En **Repository access** elegí **Only select repositories** → `control-gastos-datos`."))
                        paso(3, Text("En **Permissions → Contents** elegí **Read and write**."))
                        paso(4, Text("Generalo, copialo y pegalo aquí."))
                    }.font(.subheadline)
                } header: { Text("Conectá este aparato") }

                Section("Token de GitHub") {
                    SecureField("github_pat_…", text: $token)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .font(.system(.body, design: .monospaced))
                }
                Section("¿Quién usa este aparato?") {
                    Picker("Persona", selection: $persona) {
                        Text("Jose").tag("Jose"); Text("Ali").tag("Ali")
                    }.pickerStyle(.segmented)
                    TextField("iPhone, iPad…", text: $dispositivo)
                }
                if let error {
                    Section { Text(error).foregroundStyle(Paleta.bad) }
                }
                Section {
                    Button {
                        Task { await conectar() }
                    } label: {
                        HStack { Spacer(); if working { ProgressView().padding(.trailing, 6) }; Text(working ? "Revisando…" : "Conectar").bold(); Spacer() }
                    }
                    .disabled(working)
                }
            }
            .navigationTitle("Bienvenidos")
        }
    }

    private func paso(_ n: Int, _ t: Text) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(n)").font(.caption.bold()).frame(width: 20, height: 20).background(Circle().fill(Paleta.ok.opacity(0.18)))
            t
        }
    }

    private func conectar() async {
        error = nil
        let t = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { error = "Pegá el token primero."; return }
        working = true
        defer { working = false }
        do {
            try await sync.connect(token: t, persona: persona, dispositivo: dispositivo.trimmingCharacters(in: .whitespaces).isEmpty ? "iPhone" : dispositivo)
            token = ""
        } catch let e as GitHubError {
            error = e.status == 401 ? "Ese token no es válido. Revisá que lo copiaste completo."
                : e.status == 404 ? "Ese token no tiene acceso al repo control-gastos-datos."
                : e.status == 0 ? "No hay conexión. Para conectar la primera vez se necesita internet."
                : e.message
        } catch {
            self.error = error.localizedDescription
        }
    }
}
