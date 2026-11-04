import SwiftUI

struct AjustesView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var lock: LockManager
    @State private var dispositivo = ""
    @State private var nuevoToken = ""
    @State private var tokenMsg: String?
    @State private var confirmarDesconectar = false
    @State private var confirmarRebajar = false

    var body: some View {
        Form {
            if let c = sync.config {
                Section("Este aparato") {
                    Picker("Persona", selection: Binding(get: { c.persona }, set: { sync.updateConfig(persona: $0) })) {
                        Text("Jose").tag("Jose"); Text("Ali").tag("Ali")
                    }
                    HStack {
                        Text("Nombre")
                        TextField("iPhone", text: $dispositivo)
                            .multilineTextAlignment(.trailing)
                            .onSubmit { guardarNombre() }
                    }
                    Text("Los cambios que hagás se anotan en GitHub como «\(c.persona) (\(c.dispositivo))».")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }

            Section {
                if LockManager.available {
                    Toggle("Bloquear con \(LockManager.biometryName)", isOn: $lock.enabled)
                    if lock.enabled {
                        Picker("Volver a pedirlo después de", selection: $lock.espera) {
                            Text("Al salir").tag(0); Text("1 min").tag(1); Text("5 min").tag(5); Text("30 min").tag(30)
                        }
                    }
                } else {
                    Text("Este aparato no tiene Face ID ni código configurado.").foregroundStyle(.secondary)
                }
            } header: { Text("Bloqueo") } footer: {
                Text("Al abrir la app sale \(LockManager.biometryName) de una vez, sin tocar nada.")
            }

            Section("Sincronización") {
                LabeledContent("Estado", value: estado)
                LabeledContent("Última vez", value: Fmt.hace(sync.lastSync))
                LabeledContent("Cambios por subir", value: "\(sync.pending)")
                if !sync.message.isEmpty { Text(sync.message).font(.footnote).foregroundStyle(sync.state == .error ? Paleta.bad : .secondary) }
                Button("Sincronizar ahora") { sync.sync() }
                NavigationLink("Historial de este aparato") { HistorialView() }
            }

            Section {
                SecureField("github_pat_…", text: $nuevoToken)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Cambiar el token") {
                    Task {
                        let t = nuevoToken.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !t.isEmpty else { tokenMsg = "Pegá el token nuevo primero."; return }
                        do { try await sync.replaceToken(t); nuevoToken = ""; tokenMsg = "Listo, token nuevo guardado." }
                        catch { tokenMsg = error.localizedDescription }
                    }
                }
                if let tokenMsg { Text(tokenMsg).font(.footnote) }
            } header: { Text("Token de GitHub") } footer: {
                Text(sync.tokenExp.map { "El token actual vence: \($0)." } ?? "El token está guardado en el Keychain de este aparato.")
            }

            Section("Datos en este aparato") {
                let i = sync.storageInfo()
                LabeledContent("Archivos", value: "\(i.archivos) · \(ByteCountFormatter.string(fromByteCount: Int64(i.bytes), countStyle: .file))")
                Button("Volver a bajar todo") { confirmarRebajar = true }
                    .confirmationDialog("Se borra la copia de este aparato y se baja de nuevo de GitHub. Los cambios por subir se conservan.", isPresented: $confirmarRebajar, titleVisibility: .visible) {
                        Button("Volver a bajar") { sync.redownload() }
                    }
            }

            Section {
                Button("Desconectar este aparato", role: .destructive) { confirmarDesconectar = true }
                    .disabled(sync.pending > 0)
                    .confirmationDialog("Se borra el token y la copia de los datos de este aparato. En GitHub no se borra nada.", isPresented: $confirmarDesconectar, titleVisibility: .visible) {
                        Button("Desconectar", role: .destructive) { sync.disconnect() }
                    }
            } footer: {
                if sync.pending > 0 { Text("Primero tienen que subir los \(sync.pending) cambio(s) pendientes.") }
                else {
                    Text("Gastos \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") (\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""))")
                }
            }
        }
        .espacioBarra()
        .navigationTitle("Ajustes")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { dispositivo = sync.config?.dispositivo ?? "" }
        .onDisappear { guardarNombre() }
    }

    private func guardarNombre() {
        let d = dispositivo.trimmingCharacters(in: .whitespaces)
        if !d.isEmpty && d != sync.config?.dispositivo { sync.updateConfig(dispositivo: d) }
    }

    private var estado: String {
        switch sync.state {
        case .idle: return "Al día"
        case .checking: return "Revisando"
        case .downloading: return "Bajando"
        case .uploading: return "Subiendo"
        case .offline: return "Sin internet"
        case .error: return "Error"
        }
    }
}

struct HistorialView: View {
    @EnvironmentObject var sync: SyncEngine
    var body: some View {
        List {
            if sync.log.isEmpty {
                Text("Todavía no hay nada.").foregroundStyle(.secondary)
            }
            ForEach(sync.log) { e in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: e.ok ? (e.tipo == "subida" ? "arrow.up.circle.fill" : "arrow.down.circle.fill") : "exclamationmark.circle.fill")
                        .foregroundStyle(e.ok ? Paleta.ok : Paleta.bad)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.titulo + ((e.veces ?? 1) > 1 ? " (×\(e.veces!))" : "")).font(.subheadline.weight(.semibold))
                        if !e.detalle.isEmpty { Text(e.detalle).font(.caption).foregroundStyle(.secondary) }
                        Text(Fmt.hace(iso: e.at)).font(.caption2).foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .espacioBarra()
        .navigationTitle("Historial")
        .toolbar {
            if !sync.log.isEmpty { Button("Borrar") { sync.clearLog() } }
        }
    }
}
