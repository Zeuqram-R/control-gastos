import SwiftUI

/// Productos: por vencerse, catálogo, comparar lugares y análisis del súper.
struct ProductosView: View {
    @EnvironmentObject var sync: SyncEngine
    @EnvironmentObject var prefs: Prefs
    @State private var vm: ProductosVM?
    @State private var error: String?
    @State private var buscar = ""
    @State private var dueno = ""
    @State private var orden = "nombre"
    @State private var todoVenc = false
    @State private var buscarCompras = ""
    @State private var todoCompras = false

    private struct Clave: Equatable { let v: Int; let o: Bool; let h: String }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let vm {
                        chips(proxy)
                        vencer(vm).id("venc")
                        if !vm.comparar.isEmpty { comparar(vm).id("comparar") }
                        catalogo(vm).id("prods")
                        if vm.comparar.isEmpty { comparar(vm).id("comparar") }
                        Titulo(texto: "Análisis del súper").id("super")
                        Tarjeta {
                            Text("Súper por categoría").font(.headline)
                            Text("Todo lo comprado en supermercados, por tipo de producto.").font(.caption).foregroundStyle(.secondary)
                            Barras(filas: vm.porCategoria)
                        }
                        Tarjeta {
                            Text("Súper por persona").font(.headline)
                            Text("Casa es lo compartido; Ali y Jose, lo que es de cada uno.").font(.caption).foregroundStyle(.secondary)
                            Barras(filas: vm.porDueno, color: Paleta.warn)
                        }
                        iva(vm).id("iva")
                        compras(vm).id("compras")
                    } else if let error { Tarjeta { Text(error).foregroundStyle(Paleta.bad) } }
                    else { HStack { Spacer(); ProgressView(); Spacer() }.padding(.top, 60) }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
                .frame(maxWidth: 820).frame(maxWidth: .infinity)
            }
            .background(Color(.systemGroupedBackground))
            .espacioBarra()
            .refreshable { await sync.runSync() }
        }
        .task(id: Clave(v: sync.version, o: prefs.ocultar, h: Fmt.hoyCR())) {
            guard sync.hasData else { return }
            let d = sync.D(CLAVES_PRODUCTOS), hoy = Fmt.hoyCR(), oc = prefs.ocultar
            let r: Result<ProductosVM, Error> = await Task.detached {
                do { return .success(try JSONDecoder().decode(ProductosVM.self, from: try Core.shared.vista("productos", d: d, args: [hoy], ocultar: oc))) }
                catch { return .failure(error) }
            }.value
            switch r {
            case .success(let v): vm = v; error = nil
            case .failure(let e): error = "No se pudo armar Productos: \(e.localizedDescription)"
            }
        }
    }

    private func chips(_ proxy: ScrollViewProxy) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach([("venc", "Por vencerse"), ("prods", "Productos"), ("comparar", "Comparar lugares"), ("super", "Súper"), ("iva", "IVA"), ("compras", "Compras")], id: \.0) { id, t in
                    Button(t) { withAnimation { proxy.scrollTo(id, anchor: .top) } }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Capsule().fill(Color(.secondarySystemGroupedBackground)))
                        .buttonStyle(.plain)
                }
            }
        }.padding(.top, 4)
    }

    private func vencer(_ vm: ProductosVM) -> some View {
        Tarjeta {
            Text("Perecederos en casa").font(.headline)
            Text("Vencimiento estimado desde la última compra (o desde que lo guardaron en la refri). En el perfil de cada producto avisás si se acabó, lo guardaron en la refri, lo congelaron, lo cocinaron o lo botaron.")
                .font(.caption).foregroundStyle(.secondary)
            if vm.venc.isEmpty { Text("No hay perecederos pendientes.").foregroundStyle(.secondary) }
            ForEach(todoVenc ? vm.venc : Array(vm.venc.prefix(6))) { r in
                NavigationLink { ProductoView(clave: r.clave) } label: {
                    HStack(spacing: 10) {
                        FotoView(path: r.foto, size: 40)
                        VStack(alignment: .leading, spacing: 2) { Text(r.producto).multilineTextAlignment(.leading); Text(r.sub).font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        Text(r.cuando).font(.caption.weight(.semibold)).foregroundStyle(colorDe(r.nivel) ?? .secondary).multilineTextAlignment(.trailing)
                    }.contentShape(Rectangle())
                }.buttonStyle(.plain)
            }
            if !todoVenc && vm.venc.count > 6 { Button("Ver \(vm.venc.count - 6) más") { todoVenc = true }.font(.subheadline) }
        }
    }

    private func comparar(_ vm: ProductosVM) -> some View {
        Tarjeta {
            Text("Súper vs. chino vs. feria vs. pulpería").font(.headline)
            if vm.comparar.isEmpty {
                Text("Todavía todo viene de Walmart. Cuando compren en el chino, la feria o una pulpería algo que ya compraron en el súper (plátanos, huevos, ajo…), aquí sale cuál conviene y cuánto se ahorran.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                Text("Productos comprados en más de un tipo de lugar, por kilo, litro o unidad. En verde, dónde sale más barato.").font(.caption).foregroundStyle(.secondary)
                ForEach(vm.comparar) { r in
                    NavigationLink { ProductoView(clave: r.clave) } label: {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(r.producto)
                                FlowLayout(spacing: 6) { ForEach(r.tipos) { t in Text(t.texto).font(.caption).foregroundStyle(t.mejor ? Paleta.ok : .secondary) } }
                            }
                            Spacer()
                            Text(r.ahorro).bold().foregroundStyle(Paleta.ok)
                        }.contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private func catalogo(_ vm: ProductosVM) -> some View {
        let q = normal(buscar.trimmingCharacters(in: .whitespaces))
        var rows = vm.lista.filter { (dueno.isEmpty || $0.dueno == dueno) && (q.isEmpty || normal($0.buscar).contains(q)) }
        switch orden {
        case "ref": rows.sort { ($0.orden.ref ?? 0) > ($1.orden.ref ?? 0) }
        case "cambio": rows.sort { ($0.orden.cambio ?? 0) > ($1.orden.cambio ?? 0) }
        case "gasto": rows.sort { ($0.orden.gasto ?? 0) > ($1.orden.gasto ?? 0) }
        default: rows.sort { $0.producto.localizedCompare($1.producto) == .orderedAscending }
        }
        return Tarjeta {
            Text("Productos").font(.headline)
            Text("Precio del empaque y por kilo, litro o unidad (el que sirve para comparar tamaños y lugares). Tocá uno para ver su perfil.")
                .font(.caption).foregroundStyle(.secondary)
            CampoBuscar(texto: $buscar, placeholder: "Buscar producto…")
            HStack {
                Picker("De", selection: $dueno) { Text("Todos").tag(""); Text("Casa").tag("Casa"); Text("Ali").tag("Ali"); Text("Jose").tag("Jose") }
                    .pickerStyle(.segmented)
                Menu {
                    Picker("Ordenar", selection: $orden) {
                        Text("Por nombre").tag("nombre"); Text("Más caros por kg/L").tag("ref"); Text("Más subieron de precio").tag("cambio"); Text("Más gastado").tag("gasto")
                    }
                } label: { Image(systemName: "arrow.up.arrow.down").padding(8) }
                    .accessibilityLabel("Ordenar")
            }
            Text("\(rows.count) de \(vm.total) productos").font(.caption).foregroundStyle(.secondary)
            if rows.isEmpty { Text("Nada coincide.").foregroundStyle(.secondary) }
            LazyVStack(spacing: 0) {
                ForEach(rows) { p in
                    NavigationLink { ProductoView(clave: p.clave) } label: {
                        HStack(spacing: 10) {
                            FotoView(path: p.foto, size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(marcado(p.producto, buscar)).multilineTextAlignment(.leading)
                                Text(p.sub).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 4)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(p.precio).font(.subheadline).monospacedDigit()
                                if let c = p.cambio { Text(c.texto).font(.caption2).foregroundStyle(c.dir == "up" ? Paleta.bad : c.dir == "down" ? Paleta.ok : .secondary) }
                            }
                            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 7).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                    Divider()
                }
            }
        }
    }

    private func iva(_ vm: ProductosVM) -> some View {
        let i = vm.iva
        return Tarjeta {
            Text(i.titulo).font(.headline)
            Text("La canasta básica paga 1% de IVA y todo lo demás 13%.").font(.caption).foregroundStyle(.secondary)
            StatGrid(stats: i.stats)
            GeometryReader { g in
                HStack(spacing: 0) {
                    Rectangle().fill(Paleta.ok).frame(width: g.size.width * (1 - i.pct13))
                    Rectangle().fill(Paleta.warn)
                }.clipShape(Capsule())
            }.frame(height: 10)
            HStack(spacing: 14) {
                Label("1% canasta básica", systemImage: "circle.fill").foregroundStyle(Paleta.ok)
                Label("13%", systemImage: "circle.fill").foregroundStyle(Paleta.warn)
            }.font(.caption).labelStyle(.titleAndIcon)
            DisclosureGroup("Productos del 13% (\(i.prods.count))") {
                VStack(spacing: 6) {
                    ForEach(i.prods) { p in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.producto).font(.subheadline)
                                if let a = p.alternativa { Text(a).font(.caption).foregroundStyle(Paleta.ok) }
                            }
                            Spacer(); Text(p.monto).font(.subheadline).monospacedDigit()
                        }
                    }
                }.padding(.top, 6)
            }.font(.subheadline.weight(.semibold))
        }
    }

    private func compras(_ vm: ProductosVM) -> some View {
        let q = normal(buscarCompras.trimmingCharacters(in: .whitespaces))
        let match = vm.compras.filter { q.isEmpty || normal($0.buscar).contains(q) }
        let vis = (!q.isEmpty || todoCompras) ? match : Array(match.prefix(12))
        return Tarjeta {
            Text("Detalle de compras").font(.headline)
            Text("Cada artículo de cada factura, con su precio por kilo, litro o unidad.").font(.caption).foregroundStyle(.secondary)
            CampoBuscar(texto: $buscarCompras, placeholder: "Buscar artículo, categoría o súper…")
            if vis.isEmpty { Text("Nada coincide con la búsqueda.").foregroundStyle(.secondary) }
            LazyVStack(spacing: 0) {
                ForEach(vis) { r in
                    NavigationLink { ProductoView(clave: r.clave ?? "") } label: {
                        HStack(spacing: 10) {
                            FotoView(path: r.foto, size: 40)
                            VStack(alignment: .leading, spacing: 2) { Text(r.producto).multilineTextAlignment(.leading); Text(r.sub).font(.caption).foregroundStyle(.secondary) }
                            Spacer(minLength: 4)
                            Text(r.monto).font(.subheadline).monospacedDigit()
                        }.padding(.vertical, 7).contentShape(Rectangle())
                    }.buttonStyle(.plain).disabled(r.clave == nil)
                    Divider()
                }
            }
            if match.count > vis.count { Button("Ver \(match.count - vis.count) más") { todoCompras = true }.font(.subheadline) }
        }
    }
}

/// Campo de búsqueda con ✕ para borrar.
struct CampoBuscar: View {
    @Binding var texto: String
    let placeholder: String
    var body: some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(placeholder, text: $texto).textInputAutocapitalization(.never).autocorrectionDisabled()
            if !texto.isEmpty {
                Button { texto = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }.accessibilityLabel("Borrar búsqueda")
            }
        }
        .padding(9)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemGroupedBackground)))
    }
}
