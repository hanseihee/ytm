// 앱 상태와 동작. 데스크톱 화면의 state/(player·library·nav·ui)와 같은 일을 한다.
import MediaPlayer
import Observation
import SwiftUI

enum AppTab: Hashable {
    case home, explore, search, charts, library
}

/// 보관함 안 묶음(src/state/nav.ts LibraryTab과 같다)
enum LibraryTab: String, CaseIterable, Identifiable {
    case playlists, albums, artists, subscriptions, history
    var id: String { rawValue }
    var label: String {
        switch self {
        case .playlists: "재생목록"
        case .albums: "앨범"
        case .artists: "아티스트"
        case .subscriptions: "구독"
        case .history: "최근 재생"
        }
    }
}

/// 수면 타이머(src/state/sleep.ts와 같다)
enum SleepMode: Equatable {
    case off
    /// 이 시각에 멈춘다(마지막 10초는 소리를 줄인다)
    case time(Date)
    /// 이 곡이 끝나면 멈춘다
    case track(String)
}

enum Route: Hashable {
    case album(String)
    case playlist(String)
    case liked
    case artist(String)
    case browse(id: String, params: String?, title: String?)
    /// 차트 탭 밖에서 여는 Spotify 플레이리스트(붙여 넣은 링크)
    case chart(String)
    case settings
    case stats
}

/// browseId 종류에 맞는 화면(src/state/nav.ts routeForBrowse와 같다)
func routeForBrowse(_ browseId: String, params: String? = nil, title: String? = nil) -> Route {
    if browseId == "VLLM" || browseId == "LM" { return .liked }
    if browseId.hasPrefix("MPREb_") { return .album(browseId) }
    if ["VL", "PL", "RDCLAK", "OLAK"].contains(where: browseId.hasPrefix) { return .playlist(browseId) }
    if browseId.hasPrefix("UC") && params == nil { return .artist(browseId) }
    return .browse(id: browseId, params: params, title: title)
}

struct Toast: Identifiable, Equatable {
    let id = UUID()
    let text: String
    let isError: Bool
}

enum AppSheet: Identifiable {
    case addToPlaylist([Track])
    case newPlaylist([Track], openAfter: Bool)
    case renamePlaylist(id: String, title: String, description: String?)

    var id: String {
        switch self {
        case .addToPlaylist(let t): "add-\(t.map(\.videoId).joined())"
        case .newPlaylist(let t, _): "new-\(t.map(\.videoId).joined())"
        case .renamePlaylist(let id, _, _): "rename-\(id)"
        }
    }
}

/// YouTube Music 재생 명령 만들기
enum Endpoints {
    static func mix(_ videoId: String) -> JSONValue {
        .object(["watchEndpoint": .object(["videoId": .string(videoId), "playlistId": .string("RDAMVM\(videoId)"), "params": .string("wAEB")])])
    }
    static func playlist(_ playlistId: String, shuffle: Bool = false) -> JSONValue {
        var body: [String: JSONValue] = ["playlistId": .string(playlistId)]
        if shuffle { body["params"] = .string("wAEB8gECKAE%3D") }
        return .object(["watchPlaylistEndpoint": .object(body)])
    }
}

@MainActor
@Observable
final class AppModel {
    /// 단축어(App Intents)가 쓰는 지금 앱 상태
    @ObservationIgnored static weak var shared: AppModel?

    @ObservationIgnored let engine = Engine()
    @ObservationIgnored let core = JSCore()
    @ObservationIgnored let nowPlayingCenter = NowPlayingCenter()
    @ObservationIgnored var api: API { API(core: core) }
    #if DEBUG
    @ObservationIgnored private let debugInbox = DebugInbox()
    #endif

    // 엔진·재생
    var status = EngineStatus()
    var player = PlayerState()
    var playerReceivedAt = Date()
    /// 영상 모드에서 영상 색(지금 재생 배경이 따라간다)
    var ambient: AmbientColors?
    /// 영상 전체 화면(가로)
    private(set) var videoFullscreen = false

    // 보관함
    var account: Account?
    var liked: Set<String> = []
    var playlists: [Card] = []
    var playlistsLoaded = false
    /// 플레이리스트 화면 등이 다시 불러와야 할 때 올라가는 숫자
    var revision = 0

    // 화면
    var toasts: [Toast] = []
    var tab: AppTab = .home
    var paths: [AppTab: [Route]] = [:]
    var showNowPlaying = false
    /// 지금 재생 화면을 열 때 처음 보일 것("artwork"·"lyrics"·"queue")
    var nowPlayingMode = "artwork"
    /// 대기열 화면의 탭("queue"·"related"·"comments"), 다시 열어도 유지
    var upNextTab = "queue"
    var engineVisible = false
    var sheet: AppSheet?
    var libraryTab: LibraryTab = .playlists
    /// 수면 타이머
    var sleep: SleepMode = .off
    @ObservationIgnored private var sleepTask: Task<Void, Never>?
    @ObservationIgnored private var fadeFrom: Double?
    var searchText = ""
    /// 바깥(차트의 "직접 검색" 등)에서 검색을 시킬 때
    var searchRequest: String?

    // 설정(다음 실행에도 유지)
    var theme: ThemeID {
        didSet { UserDefaults.standard.set(theme.rawValue, forKey: Keys.theme) }
    }
    var lyricScale: Double {
        didSet { UserDefaults.standard.set(lyricScale, forKey: Keys.lyricScale) }
    }
    /// 차트 탭에서 마지막으로 본 차트
    var chartId: String {
        didSet { UserDefaults.standard.set(chartId, forKey: Keys.chart) }
    }

    static let lyricScales: [Double] = [0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.75]
    static let koreaTop50 = "37i9dQZEVXbNxXF4SkHj9F"
    private enum Keys {
        static let theme = "ytm:theme"
        static let lyricScale = "ytm:lyrics-scale"
        static let chart = "ytm:last-chart"
    }

    init() {
        let defaults = UserDefaults.standard
        theme = ThemeID(rawValue: defaults.string(forKey: Keys.theme) ?? "") ?? .dark
        let scale = defaults.double(forKey: Keys.lyricScale)
        lyricScale = Self.lyricScales.contains(scale) ? scale : 1
        chartId = defaults.string(forKey: Keys.chart) ?? Self.koreaTop50
        Self.shared = self
        WidgetBridge.handler = { [weak self] action in
            guard let self else { return }
            if action == "toggle" { self.togglePlay() } else { self.control(action) }
        }

        core.commandHandler = { [weak self] cmd, args in
            guard let self else { throw BridgeError("ipc_unavailable") }
            return try await self.handleCommand(cmd, args)
        }
        engine.onStatus = { [weak self] s in
            #if DEBUG
            if DebugRemote.url != nil { return }
            #endif
            self?.applyStatus(s)
        }
        engine.onState = { [weak self] s in self?.applyState(s) }
        engine.onEvent = { [weak self] kind, json in
            guard kind == "ambient", let colors = try? JSONDecoder().decode(AmbientColors.self, from: Data(json.utf8)) else { return }
            self?.ambient = colors
        }
        engine.onLoginFinished = { [weak self] in
            self?.engineVisible = false
            self?.toast("로그인했습니다")
        }
        nowPlayingCenter.onCommand = { [weak self] name, value in self?.engineControl(name, value) }
        engine.start()
        #if DEBUG
        debugInbox.start(model: self)
        if DebugRemote.url != nil { startRemoteEngine() }
        #endif
    }

    #if DEBUG
    /// 시뮬레이터 시험: 맥 시험 엔진의 상태를 1초마다 받아 온다.
    private func startRemoteEngine() {
        log("[dev] 원격 시험 엔진 사용: \(DebugRemote.url?.absoluteString ?? "")")
        applyStatus(EngineStatus(ready: true, host: "music.youtube.com", path: "/", loggedIn: true, subscriber: true))
        Task { [weak self] in
            while !Task.isCancelled {
                if let json = try? await DebugRemote.send("engine_call", ["method": "state", "args": [String: Any]()]),
                   let state = try? JSONDecoder().decode(PlayerState.self, from: Data(json.utf8)) {
                    self?.applyState(state)
                }
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }
    #endif

    /// 엔진 요청(개발판은 원격 시험 엔진으로 보낼 수 있다)
    func engineCall(_ method: String, argsJSON: String = "null") async throws -> String {
        #if DEBUG
        if DebugRemote.url != nil {
            return try await DebugRemote.send("engine_call", ["method": method, "args": jsonObject(argsJSON) ?? NSNull()])
        }
        #endif
        return try await engine.call(method, argsJSON: argsJSON)
    }

    /// 답을 기다리지 않는 재생 제어(잠금 화면·수면 타이머)
    func engineControl(_ command: String, _ value: Double? = nil) {
        #if DEBUG
        if DebugRemote.url != nil {
            var args: [String: Any] = ["command": command]
            if let value { args["value"] = value }
            Task { _ = try? await engineCall("control", argsJSON: jsonString(args)) }
            return
        }
        #endif
        engine.control(command, value)
    }

    /// 데이터 묶음(JS)이 부르는 앱 명령
    private func handleCommand(_ cmd: String, _ args: [String: Any]) async throws -> String {
        switch cmd {
        case "engine_call":
            return try await engineCall(args["method"] as? String ?? "", argsJSON: jsonString(args["args"]))
        case "spotify_playlist":
            return try await ChartPages.spotifyPlaylist(id: args["id"] as? String ?? "")
        case "chart_fetch":
            let raw = try JSONSerialization.data(withJSONObject: args["req"] ?? [:])
            return try await ChartPages.chartFetch(try JSONDecoder().decode(ChartRequestInfo.self, from: raw))
        default:
            throw BridgeError("unknown_command \(cmd)")
        }
    }

    private func applyState(_ s: PlayerState) {
        player = s
        playerReceivedAt = Date()
        nowPlayingCenter.update(s)
        // 청취 통계(이 기기): 30초 이상 또는 절반 넘게 들은 곡을 기록한다(src/lib/stats.ts).
        let api = api
        Task { await api.recordState(s) }
    }

    /// 앱이 뒤로 갈 때 지금 곡까지 기록을 남긴다.
    func flushPlays() {
        let api = api
        Task { await api.flushPlays() }
    }

    // MARK: 엔진 상태 → 보관함

    private var loadedFor = ""

    private func applyStatus(_ s: EngineStatus) {
        status = s
        let key = s.ready && s.loggedIn ? "in" : "out"
        guard key != loadedFor else { return }
        loadedFor = key
        if key == "in" {
            Task { await loadAccount() }
            Task { await loadLiked() }
            Task { await loadPlaylists() }
        } else {
            account = nil
            liked = []
            playlists = []
            playlistsLoaded = false
        }
    }

    /// 개발 빌드: Documents/debug/skip-login 파일이 있으면 로그인 안내를 건너뛴다(시뮬레이터에서 화면 시험용).
    #if DEBUG
    let devSkipLogin = FileManager.default.fileExists(atPath: DebugInbox.directory.appendingPathComponent("skip-login").path)
    #else
    let devSkipLogin = false
    #endif

    var needsLogin: Bool {
        !status.host.isEmpty && (!status.loggedIn || status.host != "music.youtube.com")
    }

    func loadAccount() async {
        do { account = try await api.account() } catch { log("[library] 계정 정보 실패: \(error)") }
    }

    /// 좋아요 목록은 처음 몇 쪽만 미리 읽어 하트 표시에 쓴다.
    func loadLiked() async {
        do {
            let first = try await api.likedSongs()
            var ids = Set(first.tracks.map(\.videoId))
            liked = ids
            var next = first.continuation
            var page = 1
            while let c = next, page < 10 {
                let more = try await api.playlistMore(c)
                more.tracks.forEach { ids.insert($0.videoId) }
                next = more.continuation
                page += 1
            }
            liked = ids
        } catch {
            log("[library] 좋아요 목록 실패: \(error)")
        }
    }

    func loadPlaylists() async {
        do {
            let result = try await api.libraryPlaylists()
            playlists = result.cards.filter { $0.kind == "playlist" && $0.browseId != "VLLM" }
        } catch {
            log("[library] 플레이리스트 목록 실패: \(error)")
        }
        playlistsLoaded = true
    }

    // MARK: 이동

    func pathBinding(_ tab: AppTab) -> Binding<[Route]> {
        Binding(get: { self.paths[tab] ?? [] }, set: { self.paths[tab] = $0 })
    }

    func go(_ route: Route) {
        showNowPlaying = false
        sheet = nil
        paths[tab, default: []].append(route)
    }

    func openLibrary(_ tab: LibraryTab) {
        showNowPlaying = false
        self.tab = .library
        paths[.library] = []
        libraryTab = tab
    }

    func openCharts(_ id: String? = nil) {
        showNowPlaying = false
        if let id { chartId = id }
        tab = .charts
        paths[.charts] = []
    }

    func search(_ query: String) {
        showNowPlaying = false
        tab = .search
        paths[.search] = []
        searchRequest = query
    }

    // MARK: 알림

    func toast(_ text: String, error: Bool = false) {
        let item = Toast(text: text, isError: error)
        toasts = Array(toasts.suffix(2)) + [item]
        Task {
            try? await Task.sleep(for: .seconds(error ? 6 : 3.2))
            toasts.removeAll { $0.id == item.id }
        }
    }

    func toastError(_ error: Error, _ prefix: String? = nil) {
        let message = Self.describe(error)
        log("[ytm] \(prefix ?? "") \(error)")
        toast(prefix.map { "\($0): \(message)" } ?? message, error: true)
    }

    /// 엔진 오류를 사람이 읽을 문장으로(src/lib/tauri.ts describeError와 같다).
    static func describe(_ error: Error) -> String {
        let message = (error as? BridgeError)?.message ?? error.localizedDescription
        if message.hasPrefix("engine_not_ready") { return "YouTube Music 연결을 기다리는 중입니다. 잠시 뒤 다시 시도하세요." }
        if message.hasPrefix("engine_timeout") { return "YouTube Music이 응답하지 않습니다. 인터넷 연결을 확인하세요." }
        if message.hasPrefix("engine_navigating") { return "YouTube Music 페이지를 다시 불러오는 중이었습니다. 다시 시도하세요." }
        if message.hasPrefix("not_on_music") { return "YouTube Music에 로그인해야 합니다." }
        if message.hasPrefix("http_401") || message.hasPrefix("http_403") { return "로그인이 만료됐습니다. 다시 로그인하세요." }
        if message.hasPrefix("http_4"), message.count >= 8 {
            return "YouTube Music이 요청을 거절했습니다 (\(message.dropFirst(5).prefix(3)))."
        }
        if message.hasPrefix("http_5") { return "YouTube Music 서버 오류입니다. 잠시 뒤 다시 시도하세요." }
        return message
    }

    // MARK: 재생

    /// 지금 재생 위치(엔진이 알려 준 값 + 그 뒤 흐른 시간)
    func position(at date: Date = Date()) -> Double {
        guard player.playing, !player.buffering else { return player.position }
        let pos = player.position + date.timeIntervalSince(playerReceivedAt)
        return player.duration > 0 ? min(pos, player.duration) : pos
    }

    func control(_ command: String, _ value: Double? = nil, failure: String = "재생을 바꾸지 못했습니다") {
        Task {
            do {
                var args: [String: Any] = ["command": command]
                if let value { args["value"] = value }
                _ = try await engineCall("control", argsJSON: jsonString(args))
            } catch {
                toastError(error, failure)
            }
        }
    }

    func togglePlay() {
        player.playing.toggle()
        player.position = position()
        playerReceivedAt = Date()
        control("toggle")
    }

    func seek(_ seconds: Double) {
        player.position = seconds
        playerReceivedAt = Date()
        control("seek", seconds, failure: "이동하지 못했습니다")
    }

    func playTrack(_ track: Track) {
        guard track.available else {
            toast("이 곡은 지금 계정으로 재생할 수 없습니다", error: true)
            return
        }
        Task {
            do { try await api.playTrack(track) } catch { toastError(error, "재생하지 못했습니다") }
        }
    }

    func playEndpoint(_ endpoint: JSONValue, what: String = "재생") {
        Task {
            do { try await api.play(endpoint) } catch { toastError(error, "\(what)하지 못했습니다") }
        }
    }

    func enqueue(videoId: String? = nil, playlistId: String? = nil, title: String, position: String) {
        Task {
            do {
                try await api.queueAdd(videoId: videoId, playlistId: playlistId, position: position)
                toast(position == "next" ? "\(Korean.object(title)) 다음에 재생합니다" : "\(Korean.object(title)) 대기열 끝에 추가했습니다")
            } catch {
                toastError(error, "대기열에 추가하지 못했습니다")
            }
        }
    }

    /// 노래(음원) ↔ 영상(뮤직비디오) 바꾸기
    func setAVMode(video: Bool) {
        guard player.avAvailable, player.avVideo != video else { return }
        player.avVideo = video
        Task {
            do {
                try await api.avSwitch(video)
            } catch {
                player.avVideo = !video
                toastError(error, video ? "영상으로 바꾸지 못했습니다" : "노래로 바꾸지 못했습니다")
            }
        }
    }

    /// 영상 전체 화면 켜고 끄기: 화면을 가로로 돌리고, 끄면 세로로 되돌린다.
    func setVideoFullscreen(_ on: Bool) {
        guard videoFullscreen != on else { return }
        videoFullscreen = on
        guard UIDevice.current.userInterfaceIdiom != .pad else { return }
        AppDelegate.orientationMask = on ? .landscape : .portrait
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        var controller = scene.keyWindow?.rootViewController
        while let current = controller {
            current.setNeedsUpdateOfSupportedInterfaceOrientations()
            controller = current.presentedViewController
        }
        // 기기를 이미 가로로 들고 있으면 그 방향으로
        let device = UIDevice.current.orientation
        let landscape: UIInterfaceOrientationMask = device == .landscapeRight ? .landscapeLeft : .landscapeRight
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: on ? landscape : .portrait)) { error in
            log("[video] 화면 방향 바꾸기 실패: \(error)")
        }
    }

    /// 화면 속 화면(영상 모드에서만)
    func togglePictureInPicture() {
        Task {
            do { _ = try await engineCall("pip") } catch { toastError(error, "화면 속 화면으로 띄우지 못했습니다") }
        }
    }

    // MARK: 수면 타이머

    static let sleepMinutes = [5, 10, 15, 30, 45, 60, 90, 120]
    private static let fadeSeconds = 10.0

    func startSleep(minutes: Int) {
        restoreVolume()
        sleep = .time(Date().addingTimeInterval(Double(minutes) * 60))
        runSleep()
        toast("\(minutes)분 뒤에 재생을 멈춥니다")
    }

    func startSleepAfterTrack() {
        guard !player.videoId.isEmpty else { return }
        restoreVolume()
        sleep = .track(player.videoId)
        runSleep()
        toast("지금 곡이 끝나면 멈춥니다")
    }

    func cancelSleep(quiet: Bool = false) {
        sleepTask?.cancel()
        sleepTask = nil
        restoreVolume()
        sleep = .off
        if !quiet { toast("수면 타이머를 껐습니다") }
    }

    /// 남은 시간 "12:30" 또는 "곡 끝"
    func sleepLabel(at now: Date = Date()) -> String {
        switch sleep {
        case .off: return ""
        case .track: return "곡 끝"
        case .time(let end):
            let left = max(0, Int((end.timeIntervalSince(now)).rounded()))
            return String(format: "%d:%02d", left / 60, left % 60)
        }
    }

    private func restoreVolume() {
        guard let v = fadeFrom else { return }
        fadeFrom = nil
        engineControl("volume", v)
    }

    private func runSleep() {
        sleepTask?.cancel()
        sleepTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self, !Task.isCancelled else { return }
                if self.sleepTick() { return }
            }
        }
    }

    /// 멈출 때가 되면 true
    private func sleepTick() -> Bool {
        let p = player
        switch sleep {
        case .off:
            return true
        case .time(let end):
            let left = end.timeIntervalSinceNow
            if left <= 0 {
                stopForSleep()
                return true
            }
            if left <= Self.fadeSeconds && p.playing {
                if fadeFrom == nil { fadeFrom = p.muted ? 0 : p.volume }
                engineControl("volume", ((fadeFrom ?? 0) * left / Self.fadeSeconds).rounded())
            }
        case .track(let videoId):
            // 곡이 바뀌었거나(자동으로 다음 곡이 시작됨) 끝나기 직전이면 멈춘다.
            if !p.videoId.isEmpty && p.videoId != videoId || p.duration > 0 && position() >= p.duration - 1.2 {
                stopForSleep()
                return true
            }
        }
        return false
    }

    private func stopForSleep() {
        sleep = .off
        sleepTask = nil
        engineControl("pause")
        player.playing = false
        // 다음에 틀 때는 원래 음량으로
        Task {
            try? await Task.sleep(for: .milliseconds(1200))
            restoreVolume()
        }
        toast("수면 타이머로 재생을 멈췄습니다")
    }

    // MARK: 보관함 동작

    func toggleLike(videoId: String, title: String) {
        let was = liked.contains(videoId)
        if was { liked.remove(videoId) } else { liked.insert(videoId) }
        Task {
            do {
                try await api.setTrackLiked(videoId, !was)
                toast(was ? "'\(title)' 좋아요를 취소했습니다" : "\(Korean.object(title)) 좋아요 표시한 곡에 추가했습니다")
                revision += 1
            } catch {
                if was { liked.insert(videoId) } else { liked.remove(videoId) }
                toastError(error, "좋아요를 바꾸지 못했습니다")
            }
        }
    }

    func addTracks(to option: PlaylistOption, _ tracks: [Track]) async {
        do {
            try await api.addToPlaylist(option.playlistId, tracks.map(\.videoId))
            toast(tracks.count == 1 ? "'\(option.title)'에 \(Korean.object(tracks[0].title)) 추가했습니다" : "'\(option.title)'에 \(tracks.count)곡을 추가했습니다")
            revision += 1
        } catch {
            toastError(error, "플레이리스트에 추가하지 못했습니다")
        }
    }

    func removeTracks(from playlistId: String, _ tracks: [Track]) async -> Bool {
        do {
            try await api.removeFromPlaylist(playlistId, tracks)
            toast(tracks.count == 1 ? "\(Korean.object(tracks[0].title)) 플레이리스트에서 뺐습니다" : "\(tracks.count)곡을 플레이리스트에서 뺐습니다")
            return true
        } catch {
            toastError(error, "플레이리스트에서 빼지 못했습니다")
            return false
        }
    }

    func createPlaylist(title: String, description: String, privacy: String, tracks: [Track]) async -> String? {
        do {
            let id = try await api.createPlaylist(title, description, privacy: privacy, videoIds: tracks.map(\.videoId))
            toast("'\(title)' 플레이리스트를 만들었습니다")
            await loadPlaylists()
            revision += 1
            return id
        } catch {
            toastError(error, "플레이리스트를 만들지 못했습니다")
            return nil
        }
    }

    func renamePlaylist(_ id: String, title: String, description: String?) async -> Bool {
        do {
            try await api.renamePlaylist(id, title, description)
            toast("플레이리스트 정보를 바꿨습니다")
            await loadPlaylists()
            revision += 1
            return true
        } catch {
            toastError(error, "플레이리스트 정보를 바꾸지 못했습니다")
            return false
        }
    }

    func deletePlaylist(_ id: String, title: String) async -> Bool {
        do {
            try await api.deletePlaylist(id)
            toast("'\(title)' 플레이리스트를 삭제했습니다")
            await loadPlaylists()
            revision += 1
            return true
        } catch {
            toastError(error, "플레이리스트를 삭제하지 못했습니다")
            return false
        }
    }

    func setSubscribed(_ channelId: String, name: String, on: Bool, params: String?) async -> Bool {
        do {
            try await api.setSubscribed(channelId, on, params: params)
            toast(on ? "\(name) 구독했습니다" : "\(name) 구독을 취소했습니다")
            revision += 1
            return true
        } catch {
            toastError(error, "구독을 바꾸지 못했습니다")
            return false
        }
    }

    func movePlaylistItem(_ playlistId: String, setVideoId: String, before: String?) async -> Bool {
        do {
            try await api.movePlaylistItem(playlistId, setVideoId: setVideoId, before: before)
            return true
        } catch {
            toastError(error, "순서를 바꾸지 못했습니다")
            return false
        }
    }

    func setSaved(_ playlistId: String, title: String, saved: Bool) async -> Bool {
        do {
            try await api.setCollectionSaved(playlistId, saved)
            toast(saved ? "\(Korean.object(title)) 보관함에 저장했습니다" : "\(Korean.object(title)) 보관함에서 뺐습니다")
            await loadPlaylists()
            revision += 1
            return true
        } catch {
            toastError(error, "보관함을 바꾸지 못했습니다")
            return false
        }
    }

    // MARK: 로그인·엔진 화면

    func showEngine(_ mode: String) {
        switch mode {
        case "login":
            engine.openSignIn()
            engineVisible = true
        case "web":
            engineVisible = true
        case "reload":
            engine.reloadHome()
        default:
            break
        }
    }

    func hideEngine() {
        engine.loginInProgress = false
        engineVisible = false
    }

    func stepLyricScale(_ dir: Int) {
        let scales = Self.lyricScales
        let base = scales.firstIndex(of: 1) ?? 2
        let cur = scales.firstIndex(of: lyricScale) ?? base
        let next = dir == 0 ? base : max(0, min(scales.count - 1, cur + dir))
        lyricScale = scales[next]
    }

    #if DEBUG
    /// 개발용 조사(DebugInbox "app" 대상)
    func debugAction(_ action: String, _ item: [String: Any]) async -> Any {
        switch action {
        case "summary":
            return [
                "status": ["ready": status.ready, "host": status.host, "loggedIn": status.loggedIn],
                "player": ["videoId": player.videoId, "title": player.title, "artist": player.artist, "playing": player.playing, "position": position(), "duration": player.duration],
                "tab": "\(tab)", "paths": paths.mapValues { $0.map { "\($0)" } }.reduce(into: [String: Any]()) { $0["\($1.key)"] = $1.value },
                "toasts": toasts.map(\.text), "showNowPlaying": showNowPlaying, "engineVisible": engineVisible,
                "account": account?.name ?? NSNull(), "liked": liked.count, "playlists": playlists.count,
            ] as [String: Any]
        case "tab":
            switch item["value"] as? String {
            case "home": tab = .home
            case "explore": tab = .explore
            case "search": tab = .search
            case "charts": tab = .charts
            case "settings":
                tab = .home
                paths[.home] = [.settings]
            case "stats":
                tab = .library
                paths[.library] = [.stats]
            default:
                tab = .library
                libraryTab = LibraryTab(rawValue: item["library"] as? String ?? "") ?? .playlists
            }
            return true
        case "go":
            if let id = item["browseId"] as? String { go(routeForBrowse(id, params: item["params"] as? String)) }
            return true
        case "back":
            if !(paths[tab] ?? []).isEmpty { paths[tab]?.removeLast() }
            return true
        case "nowPlaying":
            nowPlayingMode = item["mode"] as? String ?? "artwork"
            if let t = item["upNext"] as? String { upNextTab = t }
            showNowPlaying = item["value"] as? Bool ?? true
            return true
        case "fakePlayer":
            // 로그인 없는 시뮬레이터에서 지금 재생·가사 화면을 그려 보기 위한 가짜 재생 상태
            var p = PlayerState()
            p.videoId = item["videoId"] as? String ?? "fake"
            p.title = item["title"] as? String ?? ""
            p.artist = item["artist"] as? String ?? ""
            p.album = item["album"] as? String ?? ""
            p.artwork = item["artwork"] as? String ?? ""
            p.duration = item["duration"] as? Double ?? 0
            p.position = item["position"] as? Double ?? 0
            p.playing = item["playing"] as? Bool ?? true
            p.avAvailable = item["avAvailable"] as? Bool ?? false
            player = p
            playerReceivedAt = Date()
            return true
        case "search":
            search(item["value"] as? String ?? "")
            return true
        case "theme":
            theme = ThemeID(rawValue: item["value"] as? String ?? "") ?? .dark
            return true
        case "chart":
            openCharts(item["value"] as? String)
            return true
        case "engine":
            if item["value"] as? Bool == false { hideEngine() } else { showEngine(item["mode"] as? String ?? "web") }
            return true
        case "av":
            setAVMode(video: item["value"] as? Bool ?? false)
            return true
        case "sleep":
            if let minutes = item["minutes"] as? Int { startSleep(minutes: minutes) }
            else if item["track"] as? Bool == true { startSleepAfterTrack() }
            else { cancelSleep() }
            return sleepLabel()
        case "pip":
            togglePictureInPicture()
            return true
        case "fullscreen":
            setVideoFullscreen(item["value"] as? Bool ?? !videoFullscreen)
            return videoFullscreen
        case "nowPlaying.system":
            // 잠금 화면에 실제로 쓰이는 재생 정보 + 우리 앱이 넣은 정보
            let mine = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            return [
                "system": await SystemNowPlaying.read(),
                "app": [
                    "title": mine[MPMediaItemPropertyTitle] as? String ?? NSNull(),
                    "hasArtwork": mine[MPMediaItemPropertyArtwork] != nil,
                    "artworkSize": "\(nowPlayingCenter.artworkSize)",
                ] as [String: Any],
            ] as [String: Any]
        case "snapshot":
            // 앱 창만 그림으로 남긴다(Documents/debug/shot.png). 전체 화면·다른 앱은 찍지 않는다.
            guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap(\.windows).first(where: \.isKeyWindow) else { return "no_window" }
            let format = UIGraphicsImageRendererFormat(for: window.traitCollection)
            format.scale = item["scale"] as? Double ?? 1
            let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: item["update"] as? Bool ?? false)
            }
            let file = DebugInbox.directory.appendingPathComponent(item["file"] as? String ?? "shot.png")
            try? image.pngData()?.write(to: file)
            return ["file": file.lastPathComponent, "size": "\(image.size)", "stage": "\(ambient.map { "\($0.top) \($0.bottom)" } ?? "none")"]
        case "scroll":
            // 화면에서 가장 큰 스크롤 영역을 내린다(시뮬레이터 화면 시험용).
            let dy = item["by"] as? Double ?? 600
            let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
            func scrollViews(_ v: UIView) -> [UIScrollView] {
                (v as? UIScrollView).map { [$0] }.map { $0 + v.subviews.flatMap(scrollViews) } ?? v.subviews.flatMap(scrollViews)
            }
            let visible = windows.flatMap { w in scrollViews(w).filter { !$0.isHidden && $0.alpha > 0 && $0.window != nil && $0.contentSize.height > $0.bounds.height && $0.bounds.width > 200 } }
            let target = item["index"] as? Int
            let candidates = visible.filter { sv in
                let frame = sv.convert(sv.bounds, to: nil)
                return frame.intersects(sv.window?.bounds ?? .zero)
            }.sorted { $0.bounds.height * $0.bounds.width > $1.bounds.height * $1.bounds.width }
            guard let sv = target.map({ $0 < candidates.count ? candidates[$0] : nil }) ?? candidates.first else { return "no_scroll" }
            let maxY = max(0, sv.contentSize.height - sv.bounds.height + sv.adjustedContentInset.bottom)
            let y = item["to"] as? Double ?? min(maxY, max(-sv.adjustedContentInset.top, sv.contentOffset.y + dy))
            sv.setContentOffset(CGPoint(x: sv.contentOffset.x, y: y), animated: false)
            return ["y": y, "max": maxY, "count": candidates.count]
        default:
            return "unknown_action"
        }
    }
    #endif
}

/// 한국어 조사(src/lib/ko.ts와 같다)
enum Korean {
    private static func hasBatchim(_ word: String) -> Bool? {
        guard let last = word.trimmingCharacters(in: .whitespaces).unicodeScalars.last else { return nil }
        let code = last.value
        if code >= 0xAC00 && code <= 0xD7A3 { return (code - 0xAC00) % 28 != 0 }
        if let digit = Int(String(last)) { return [0, 1, 3, 6, 7, 8].contains(digit) }
        return nil
    }

    /// '밤편지'를 / 'Celebrity'을(를)
    static func object(_ title: String) -> String {
        switch hasBatchim(title) {
        case .none: "'\(title)'을(를)"
        case .some(true): "'\(title)'을"
        case .some(false): "'\(title)'를"
        }
    }
}

func formatTime(_ seconds: Double?) -> String {
    guard let seconds, seconds.isFinite, seconds >= 0 else { return "-:--" }
    let s = Int(seconds)
    let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
}
