import SwiftUI

/// Foto de un producto (de fotos/mini o fotos/grande del repo). Sin foto, un cuadrito vacío.
struct FotoView: View {
    let path: String?
    var size: CGFloat = 44
    var radius: CGFloat = 10
    @EnvironmentObject var sync: SyncEngine
    @State private var img: UIImage?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color(.tertiarySystemFill))
            if let img {
                Image(uiImage: img).resizable().scaledToFit().padding(2)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .task(id: path) {
            guard let path, sync.photoExists(path) else { img = nil; return }
            img = await sync.photo(path)
        }
    }
}

/// Visor de foto a pantalla completa: pellizcar o tocar dos veces para acercar.
struct VisorFoto: View {
    let titulo: String
    let grande: String?
    let mini: String?
    @EnvironmentObject var sync: SyncEngine
    @Environment(\.dismiss) private var dismiss
    @State private var img: UIImage?
    @State private var escala: CGFloat = 1
    @State private var base: CGFloat = 1
    @State private var mover: CGSize = .zero
    @State private var moverBase: CGSize = .zero

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let img {
                Image(uiImage: img).resizable().scaledToFit()
                    .scaleEffect(escala).offset(mover)
                    .gesture(MagnifyGesture()
                        .onChanged { escala = max(1, min(5, base * $0.magnification)) }
                        .onEnded { _ in base = escala; if escala <= 1 { withAnimation { mover = .zero; moverBase = .zero } } })
                    .simultaneousGesture(DragGesture()
                        .onChanged { v in
                            if escala > 1 { mover = CGSize(width: moverBase.width + v.translation.width, height: moverBase.height + v.translation.height) }
                            else { mover = CGSize(width: 0, height: max(0, v.translation.height)) }
                        }
                        .onEnded { v in
                            if escala <= 1 && v.translation.height > 120 { dismiss() }
                            else if escala <= 1 { withAnimation { mover = .zero } }
                            moverBase = mover
                        })
                    .onTapGesture(count: 2) {
                        withAnimation(.spring) {
                            if escala > 1 { escala = 1; base = 1; mover = .zero; moverBase = .zero } else { escala = 2.5; base = 2.5 }
                        }
                    }
            } else {
                ProgressView().tint(.white)
            }
            VStack {
                HStack {
                    Text(titulo).font(.headline).foregroundStyle(.white).lineLimit(2)
                    Spacer()
                    Button { dismiss() } label: { Image(systemName: "xmark.circle.fill").font(.title).foregroundStyle(.white.opacity(0.85)) }
                        .accessibilityLabel("Cerrar")
                }
                .padding()
                Spacer()
                Text("Pellizcá o tocá dos veces para acercar").font(.caption).foregroundStyle(.white.opacity(0.6)).padding(.bottom)
            }
        }
        .task {
            if let g = grande, sync.photoExists(g) { img = await sync.photo(g) }
            else if let m = mini { img = await sync.photo(m) }
        }
    }
}
