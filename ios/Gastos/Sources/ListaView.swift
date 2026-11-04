import SwiftUI

/// Lista para el próximo súper: lo que falta, agrupado por el lugar donde salió más barato. Tachar se comparte con Ali.
struct ListaView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @EnvironmentObject var nav: AppNav
    @State private var vm: ListaVM?
    @State private var error: String?
    @State private var texto = ""
    @State private var cantidad = ""
    @FocusState private var foco: Bool
    @State private var ver: String?

    private struct Clave: Equatable { let v: Int; let o: Bool; let h: String }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let vm { contenido(vm) }
                else if let error { Tarjeta { Text(error).foregroundStyle(Paleta.bad) } }
                else { HStack { Spacer(); ProgressView(); Spacer() }.padding(.top, 60) }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
            .frame(maxWidth: 820).frame(maxWidth: .infinity)
        }
        .background(Color(.systemGroupedBackground))
        .espacioBarra()
        .refreshable { await sync.runSync() }
        .navigationDestination(item: $ver) { ProductoView(clave: $0) }
        .task(id: Clave(v: sync.version, o: prefs.ocultar, h: Fmt.hoyCR())) { await calcular() }
    }

    private func calcular() async {
        guard sync.hasData else { return }
        let d = sync.D(CLAVES_PRODUCTOS), hoy = Fmt.hoyCR(), oc = prefs.ocultar, quien = sync.config?.persona ?? "Jose"
        let r: Result<ListaVM, Error> = await Task.detached {
            do { return .success(try JSONDecoder().decode(ListaVM.self, from: try Core.shared.vista("lista", d: d, args: [hoy, quien], ocultar: oc))) }
            catch { return .failure(error) }
        }.value
        switch r {
        case .success(let v): vm = v; error = nil
        case .failure(let e): error = "No se pudo armar la lista: \(e.localizedDescription)"
        }
    }

    @ViewBuilder private func contenido(_ vm: ListaVM) -> some View {
        let pend = sync.pendingIds("lista")
        Tarjeta {
            HStack {
                Text("Lista para el próximo súper").font(.headline)
                Spacer()
                if vm.pendientes > 0 {
                    Button { whatsapp(vm.texto) } label: { Label("WhatsApp", systemImage: "message.fill") }
                        .buttonStyle(.borderedProminent).tint(Color(red: 0.15, green: 0.68, blue: 0.38)).controlSize(.small)
                    ShareLink(item: vm.texto) { Image(systemName: "square.and.arrow.up") }
                        .buttonStyle(.bordered).controlSize(.small).accessibilityLabel("Compartir de otra forma")
                }
            }
            Text(vm.nota).font(.caption).foregroundStyle(.secondary)
            VStack(spacing: 8) {
                TextField("Agregar algo a la lista…", text: $texto)
                    .focused($foco).submitLabel(.done).onSubmit { agregar() }
                    .padding(10).background(RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemGroupedBackground)))
                if foco && !sugeridas(vm).isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack { ForEach(sugeridas(vm), id: \.self) { s in Button(s) { texto = s }.buttonStyle(.bordered).controlSize(.small).lineLimit(1) } }
                    }
                }
                HStack {
                    TextField("Cantidad (opcional)", text: $cantidad).onSubmit { agregar() }
                        .padding(10).background(RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemGroupedBackground)))
                    Button("Agregar") { agregar() }.buttonStyle(.borderedProminent).tint(Paleta.ok)
                }
            }
        }
        ForEach(vm.grupos) { g in
            Tarjeta {
                HStack { Text(g.lugar).font(.headline); Spacer(); if let t = g.total { Text(t).font(.subheadline).foregroundStyle(.secondary) } }
                ForEach(g.filas) { fila($0, pend) }
            }
        }
        if let c = vm.cmp {
            Tarjeta {
                Text("¿Dónde sale más barata?").font(.headline)
                Text(c.nota).font(.caption).foregroundStyle(.secondary)
                ForEach(c.filas) { f in
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) { Text(f.titulo); Text(f.sub).font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        Text(f.monto).bold().monospacedDigit().foregroundStyle(f.bueno ? Paleta.ok : .primary)
                    }
                    Divider()
                }
                if let u = c.unLugar { Text(u).font(.caption).foregroundStyle(.secondary) }
            }
        }
        if !vm.marcados.isEmpty {
            Tarjeta {
                HStack {
                    Text("Tachado (\(vm.marcados.count))").font(.headline)
                    Spacer()
                    Button("Limpiar tachados") { limpiar(vm) }.buttonStyle(.bordered).controlSize(.small)
                }
                ForEach(vm.marcados) { fila($0, pend) }
            }
        }
        if vm.vacia { Tarjeta { Text("La lista está vacía.").foregroundStyle(.secondary) } }
        Tarjeta {
            Text("Cómo se arma").font(.headline)
            VStack(alignment: .leading, spacing: 6) {
                Text("**Se acabó:** me dijiste que se terminó y no se ha vuelto a comprar.")
                Text("**Pronto:** según cada cuánto lo compran, se acaba en los próximos 7 días; o es perecedero y vence en los próximos 3.")
                Text("**Lo pidió:** alguien lo agregó aquí o me lo pidió.")
            }.font(.subheadline)
            Text("Cuando entra una factura, lo que compraron sale solo de la lista y se quitan los tachados.").font(.caption).foregroundStyle(.secondary)
        }
    }

    private func sugeridas(_ vm: ListaVM) -> [String] {
        let q = normal(texto.trimmingCharacters(in: .whitespaces))
        guard q.count >= 2 else { return [] }
        return Array(vm.sugerencias.filter { normal($0).contains(q) && normal($0) != q }.prefix(5))
    }

    private func fila(_ r: ListaVM.Fila, _ pend: Set<String>) -> some View {
        let pendiente = pend.contains("M-\(r.key)") || (r.pedidoId.map { pend.contains($0) } ?? false)
        return HStack(spacing: 10) {
            Button { tachar(r) } label: {
                HStack(spacing: 10) {
                    Image(systemName: r.marcado ? "checkmark.circle.fill" : "circle")
                        .font(.title3).foregroundStyle(r.marcado ? Paleta.ok : .secondary)
                    FotoView(path: r.foto, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.producto).strikethrough(r.marcado).foregroundStyle(r.marcado ? .secondary : .primary).multilineTextAlignment(.leading)
                        Text(r.why).font(.caption).foregroundStyle(r.marcado ? .secondary : colorMotivo(r.motivo))
                    }
                    Spacer(minLength: 4)
                    Text(r.precio).font(.subheadline).monospacedDigit().foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(r.marcado ? "Destachar" : "Tachar") \(r.producto)")
            if r.pedidoId != nil {
                Button { quitar(r) } label: { Image(systemName: "xmark").font(.caption.bold()).frame(width: 28, height: 28).background(Circle().stroke(Color(.separator))) }
                    .buttonStyle(.plain).accessibilityLabel("Quitar \(r.producto) de la lista")
            }
        }
        .opacity(pendiente ? 0.6 : 1)
        .padding(.vertical, 4)
        .contextMenu {
            if let c = r.clave, !c.isEmpty { Button { ver = c } label: { Label("Ver producto", systemImage: "tag") } }
        }
    }

    private func colorMotivo(_ m: String) -> Color { m == "falta" ? Paleta.bad : (m == "pronto" || m == "vence") ? Paleta.warn : .secondary }

    private func tachar(_ r: ListaVM.Fila) {
        UISelectionFeedbackGenerator().selectionChanged()
        if r.marcado { sync.mutate("lista", kind: "delete", id: "M-\(r.key)", summary: "destacha \"\(r.producto)\"") }
        else { sync.mutate("lista", kind: "upsert", record: r.tachar, summary: "tacha \"\(r.producto)\"") }
    }

    private func quitar(_ r: ListaVM.Fila) {
        guard let pid = r.pedidoId else { return }
        sync.mutate("lista", kind: "delete", id: pid, summary: "quita \"\(r.producto)\" de la lista")
        if r.marcado { sync.mutate("lista", kind: "delete", id: "M-\(r.key)", summary: "") }
        let s = sync, pedido = r.pedido
        nav.avisar("Quitado: \(r.producto)", accion: pedido != nil && pedido != "null" ? "Deshacer" : nil) {
            if let pedido { s.mutate("lista", kind: "upsert", record: pedido, summary: "vuelve a agregar \"\(r.producto)\"") }
        }
    }

    private func limpiar(_ vm: ListaVM) {
        for r in vm.manualesTachados {
            sync.mutate("lista", kind: "delete", id: r.pedidoId, summary: "compró \"\(r.producto)\"")
            sync.mutate("lista", kind: "delete", id: "M-\(r.key)", summary: "")
        }
        nav.avisar(vm.manualesTachados.isEmpty ? "Lo demás tachado se quita solo cuando entre la factura." : "Listo: \(vm.manualesTachados.count) quitado(s) de la lista.")
    }

    private func agregar() {
        let t = texto.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { foco = true; return }
        let id = "P\(SyncEngine.b36(Date().timeIntervalSince1970 * 1000))"
        let d = sync.D(["productos"])
        guard let data = try? Core.shared.vista("agregarLista", d: d, args: [t, cantidad, Fmt.hoyCR(), sync.config?.persona ?? "Jose", id]),
              let r = try? JSONDecoder().decode(Armado.self, from: data), let rec = r.recText else { return }
        texto = ""; cantidad = ""
        sync.mutate("lista", kind: "upsert", record: rec, summary: r.summary ?? "agrega")
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    private func whatsapp(_ t: String) {
        var c = URLComponents(string: "https://wa.me/")!
        c.queryItems = [URLQueryItem(name: "text", value: t)]
        if let u = c.url { UIApplication.shared.open(u) }
    }
}
