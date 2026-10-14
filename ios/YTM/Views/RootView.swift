// 뼈대: 아래 탭 5개(홈·둘러보기·차트·보관함·검색) + 탭 위 미니 플레이어 + "지금 재생" 화면.
// 숨은 엔진 웹 화면은 맨 뒤에 깔아 두고, 로그인·웹 화면 열기 때만 앞으로 꺼낸다.
// 영상 모드에서는 그 웹 화면을 지금 재생 화면의 표지 자리로 옮겨 붙였다가, 닫히면 제자리로 돌려놓는다.
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
            // 언어를 바꾸면 탭 화면을 새로 만들어 YouTube Music 데이터도 새 언어로 다시 받는다
            // (엔진 웹 화면은 그대로라 재생은 끊기지 않는다).
            MainTabs()
                .id(model.language)
                .zIndex(1)
            if !model.engineVisible && !model.devSkipLogin && (!model.status.ready || !model.status.loggedIn) {
                LoginGate()
                    .zIndex(2)
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .top) { ToastStack() }
        .environment(\.palette, palette)
        .environment(\.locale, Locale(identifier: model.language))
        .preferredColorScheme(model.theme == .system ? nil : (palette.isLight ? .light : .dark))
        .tint(palette.rose)
        .animation(.easeInOut(duration: 0.25), value: model.engineVisible)
        // 지금 재생 화면이 떠 있으면 그 화면이 시트를 띄운다(겹쳐 띄울 수 없다).
        .sheet(item: Binding(get: { model.showNowPlaying ? nil : model.sheet }, set: { model.sheet = $0 })) { sheet in
            SheetContent(sheet: sheet)
                .environment(\.palette, palette)
                .environment(\.locale, Locale(identifier: model.language))
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
            Tab("둘러보기", systemImage: "safari.fill", value: AppTab.explore) {
                NavigationStack(path: model.pathBinding(.explore)) { ExploreView().routes() }
            }
            Tab("차트", systemImage: "chart.bar.fill", value: AppTab.charts) {
                NavigationStack(path: model.pathBinding(.charts)) { ChartView(id: model.chartId, isRoot: true).routes() }
            }
            Tab("보관함", systemImage: "square.stack.fill", value: AppTab.library) {
                NavigationStack(path: model.pathBinding(.library)) { LibraryView().routes() }
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
                .environment(\.locale, Locale(identifier: model.language))
                .sheet(item: $model.sheet) { sheet in
                    SheetContent(sheet: sheet)
                        .environment(\.palette, palette)
                        .environment(\.locale, Locale(identifier: model.language))
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
            case .settings: SettingsView()
            case .stats: StatsView()
            }
        }
    }

    /// 홈·보관함 오른쪽 위 설정 단추
    func settingsButton(_ model: AppModel) -> some View {
        toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { model.go(.settings) } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("설정")
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

/// 엔진 웹 화면이 붙을 자리. 평소에는 맨 뒤(home), 영상 모드에서는 지금 재생 화면, 전체 화면이면 그 위(dock 쌓기).
@MainActor
enum EngineHost {
    private final class Weak {
        weak var view: UIView?
        init(_ view: UIView) { self.view = view }
    }

    private static weak var home: UIView?
    private static var docks: [Weak] = []

    static func attach(_ webView: WKWebView, to container: UIView) {
        guard webView.superview !== container else { return }
        // 자리를 옮길 때 확대 배율·스크롤을 처음으로(가로 전체 화면에서 돌아와도 작아지지 않게)
        webView.scrollView.setZoomScale(1, animated: false)
        webView.scrollView.contentOffset = .zero
        webView.removeFromSuperview()
        webView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
    }

    static func setHome(_ container: UIView, webView: WKWebView) {
        home = container
        if docks.isEmpty { attach(webView, to: container) }
    }

    static func setDock(_ container: UIView, webView: WKWebView) {
        docks.removeAll { $0.view == nil || $0.view === container }
        docks.append(Weak(container))
        // 지금 재생 화면에서는 웹 화면 바탕을 비워 앱 배경과 앰비언트 빛이 이어지게 한다.
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        attach(webView, to: container)
    }

    static func leaveDock(_ container: UIView, webView: WKWebView) {
        let wasTop = docks.last?.view === container
        docks.removeAll { $0.view == nil || $0.view === container }
        guard wasTop else { return }
        if let next = docks.last?.view {
            attach(webView, to: next)
            return
        }
        webView.backgroundColor = Engine.background
        webView.scrollView.backgroundColor = Engine.background
        if let home { attach(webView, to: home) }
    }
}

private struct WebViewHost: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.backgroundColor = .black
        EngineHost.setHome(container, webView: webView)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

/// 지금 재생 화면에 붙이는 영상(엔진 웹 화면). 손가락 입력은 받지 않는다(재생 조작은 앱 단추로).
struct EngineDock: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.backgroundColor = .clear
        container.isUserInteractionEnabled = false
        EngineHost.setDock(container, webView: webView)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        EngineHost.leaveDock(uiView, webView: coordinator.webView)
    }

    func makeCoordinator() -> Coordinator { Coordinator(webView: webView) }

    final class Coordinator {
        let webView: WKWebView
        init(webView: WKWebView) { self.webView = webView }
    }
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
