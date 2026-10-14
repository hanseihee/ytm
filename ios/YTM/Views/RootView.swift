// 뼈대: 아래 탭 5개(홈·차트·보관함·설정·검색) + 탭 위 미니 플레이어 + "지금 재생" 시트.
// 숨은 엔진 웹 화면은 맨 뒤에 깔아 두고, 로그인·웹 화면 열기 때만 앞으로 꺼낸다.
import SwiftUI
import WebKit

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var systemScheme

    var body: some View {
        @Bindable var model = model
        let palette = model.theme.palette(system: systemScheme)
        ZStack {
            EngineLayer()
                .zIndex(model.engineVisible ? 3 : 0)
            MainTabs()
                .zIndex(1)
            if !model.engineVisible && !model.devSkipLogin && (!model.status.ready || !model.status.loggedIn) {
                LoginGate()
                    .zIndex(2)
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .top) { ToastStack() }
        .environment(\.palette, palette)
        .preferredColorScheme(model.theme == .system ? nil : (palette.isLight ? .light : .dark))
        .tint(palette.rose)
        .animation(.easeInOut(duration: 0.25), value: model.engineVisible)
        // 지금 재생 화면이 떠 있으면 그 화면이 시트를 띄운다(겹쳐 띄울 수 없다).
        .sheet(item: Binding(get: { model.showNowPlaying ? nil : model.sheet }, set: { model.sheet = $0 })) { sheet in
            SheetContent(sheet: sheet)
                .environment(\.palette, palette)
                .tint(palette.rose)
        }
    }
}

/// 플레이리스트에 추가·새로 만들기·정보 바꾸기 시트
struct SheetContent: View {
    let sheet: AppSheet
    var body: some View {
        switch sheet {
        case .addToPlaylist(let tracks): AddToPlaylistSheet(tracks: tracks)
        case .newPlaylist(let tracks, let openAfter): NewPlaylistSheet(tracks: tracks, openAfter: openAfter)
        case .renamePlaylist(let id, let title, let description): RenamePlaylistSheet(playlistId: id, title: title, description: description ?? "")
        }
    }
}

struct MainTabs: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    @Namespace private var nowPlayingSpace

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab("홈", systemImage: "house.fill", value: AppTab.home) {
                NavigationStack(path: model.pathBinding(.home)) { HomeView().routes() }
            }
            Tab("차트", systemImage: "chart.bar.fill", value: AppTab.charts) {
                NavigationStack(path: model.pathBinding(.charts)) { ChartView(id: model.chartId, isRoot: true).routes() }
            }
            Tab("보관함", systemImage: "square.stack.fill", value: AppTab.library) {
                NavigationStack(path: model.pathBinding(.library)) { LibraryView().routes() }
            }
            Tab("설정", systemImage: "gearshape.fill", value: AppTab.settings) {
                NavigationStack(path: model.pathBinding(.settings)) { SettingsView().routes() }
            }
            Tab("검색", systemImage: "magnifyingglass", value: AppTab.search, role: .search) {
                NavigationStack(path: model.pathBinding(.search)) { SearchView().routes() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tabViewBottomAccessory {
            MiniPlayer()
                .matchedTransitionSource(id: "now-playing", in: nowPlayingSpace)
        }
        // Apple 뮤직처럼 미니 플레이어에서 확대되며 열리고, 아래로 끌어내리면 닫힌다.
        .fullScreenCover(isPresented: $model.showNowPlaying) {
            NowPlayingView()
                .navigationTransition(.zoom(sourceID: "now-playing", in: nowPlayingSpace))
                .environment(\.palette, palette)
                .sheet(item: $model.sheet) { sheet in
                    SheetContent(sheet: sheet)
                        .environment(\.palette, palette)
                        .tint(palette.rose)
                }
        }
    }
}

extension View {
    /// 탭마다 같은 이동 목적지
    func routes() -> some View {
        navigationDestination(for: Route.self) { route in
            switch route {
            case .album(let id): CollectionView(kind: .album, id: id)
            case .playlist(let id): CollectionView(kind: .playlist, id: id)
            case .liked: CollectionView(kind: .liked, id: "VLLM")
            case .artist(let id): ArtistView(id: id)
            case .browse(let id, let params, let title): BrowseView(id: id, params: params, title: title)
            case .chart(let id): ChartView(id: id, isRoot: false)
            }
        }
    }
}

// MARK: 엔진 웹 화면

private struct EngineLayer: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 0) {
            if model.engineVisible {
                HStack {
                    Text(model.engine.loginInProgress ? "Google 계정으로 로그인" : "YouTube Music 웹 화면")
                        .font(.headline)
                    Spacer()
                    Button("닫기") { model.hideEngine() }
                        .fontWeight(.semibold)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .background(.bar)
            }
            WebViewHost(webView: model.engine.webView)
                .ignoresSafeArea(edges: model.engineVisible ? .bottom : .all)
        }
        .background(Color.black)
        .allowsHitTesting(model.engineVisible)
        .accessibilityHidden(!model.engineVisible)
    }
}

private struct WebViewHost: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.backgroundColor = .black
        webView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

// MARK: 로그인 안내

private struct LoginGate: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    @State private var slow = false

    var body: some View {
        ZStack {
            palette.night.ignoresSafeArea()
            VStack(spacing: 16) {
                Image("Logo")
                    .resizable()
                    .frame(width: 88, height: 88)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                if model.needsLogin {
                    Text("YouTube Music 계정으로 로그인하세요")
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    Text("음악은 내 YouTube Music 계정으로 재생되고, 좋아요와 플레이리스트도 그 계정에 저장됩니다. 로그인은 Google 화면에서 하며, 이 앱은 비밀번호를 보거나 저장하지 않습니다.")
                        .foregroundStyle(palette.mist)
                        .multilineTextAlignment(.center)
                    Button {
                        model.showEngine("login")
                    } label: {
                        Text("Google 계정으로 로그인")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                } else {
                    Text("YouTube Music에 연결하는 중…")
                        .font(.title2.bold())
                    Text("처음 실행하면 몇 초 걸립니다.")
                        .foregroundStyle(palette.mist)
                    ProgressView().padding(.top, 4)
                    if slow {
                        HStack {
                            Button("다시 연결") { model.showEngine("reload") }
                            Button("로그인 화면 열기") { model.showEngine("login") }
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
            .foregroundStyle(palette.ink)
            .padding(32)
            .frame(maxWidth: 460)
        }
        .task(id: model.status.ready) {
            slow = false
            guard !model.status.ready else { return }
            try? await Task.sleep(for: .seconds(15))
            slow = true
        }
    }
}

// MARK: 알림

private struct ToastStack: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(spacing: 8) {
            ForEach(model.toasts) { toast in
                Text(toast.text)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .foregroundStyle(toast.isError ? Color.white : palette.ink)
                    .background {
                        Capsule().fill(toast.isError ? AnyShapeStyle(Color.red.opacity(0.85)) : AnyShapeStyle(.regularMaterial))
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 6)
        .animation(.spring(duration: 0.3), value: model.toasts)
        .allowsHitTesting(false)
    }
}
