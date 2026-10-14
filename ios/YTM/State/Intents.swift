// 단축어·Siri(App Intents): 재생 제어, 좋아요 표시한 곡 재생, 차트 열기, 수면 타이머.
// 재생 제어는 AudioPlaybackIntent라 앱을 앞으로 띄우지 않고 실행된다(앱이 꺼져 있으면 뒤에서 켜진다).
import AppIntents

@MainActor
private func appModel() throws -> AppModel {
    guard let model = AppModel.shared else { throw IntentFailure.notRunning }
    return model
}

enum IntentFailure: Error, CustomLocalizedStringResourceConvertible {
    case notRunning
    case nothingPlaying

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notRunning: "YTM을 한 번 열어 YouTube Music에 연결한 뒤 다시 시도하세요."
        case .nothingPlaying: "재생 중인 곡이 없습니다."
        }
    }
}

struct TogglePlayIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "재생/일시정지"
    static let description = IntentDescription("YTM에서 지금 곡을 재생하거나 멈춥니다.")

    @MainActor
    func perform() async throws -> some IntentResult {
        let model = try appModel()
        guard !model.player.videoId.isEmpty else { throw IntentFailure.nothingPlaying }
        model.togglePlay()
        return .result()
    }
}

struct NextTrackIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "다음 곡"
    static let description = IntentDescription("YTM에서 다음 곡으로 넘어갑니다.")

    @MainActor
    func perform() async throws -> some IntentResult {
        try appModel().control("next", failure: "다음 곡으로 가지 못했습니다")
        return .result()
    }
}

struct PreviousTrackIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "이전 곡"
    static let description = IntentDescription("YTM에서 이전 곡으로 돌아갑니다.")

    @MainActor
    func perform() async throws -> some IntentResult {
        try appModel().control("previous", failure: "이전 곡으로 가지 못했습니다")
        return .result()
    }
}

struct PlayLikedIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "좋아요 표시한 곡 재생"
    static let description = IntentDescription("YouTube Music에서 좋아요 표시한 곡을 섞어 재생합니다.")

    @MainActor
    func perform() async throws -> some IntentResult {
        try appModel().playEndpoint(Endpoints.playlist("LM", shuffle: true), what: "좋아요 표시한 곡을 재생")
        return .result()
    }
}

struct SleepTimerIntent: AppIntent {
    static let title: LocalizedStringResource = "수면 타이머"
    static let description = IntentDescription("정한 시간이 지나면 YTM 재생을 멈춥니다(마지막 10초는 소리를 줄입니다).")

    @Parameter(title: "분", default: 30, inclusiveRange: (1, 240))
    var minutes: Int

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$minutes)분 뒤에 멈추기")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        try appModel().startSleep(minutes: minutes)
        return .result(dialog: "\(minutes)분 뒤에 재생을 멈춥니다.")
    }
}

struct OpenChartsIntent: AppIntent {
    static let title: LocalizedStringResource = "YTM 차트 열기"
    static let description = IntentDescription("멜론·지니·Spotify 등 차트 화면을 엽니다.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        try appModel().openCharts()
        return .result()
    }
}

struct YTMShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: TogglePlayIntent(), phrases: ["\(.applicationName) 재생", "\(.applicationName) 멈춰"], shortTitle: "재생/일시정지", systemImageName: "playpause.fill")
        AppShortcut(intent: NextTrackIntent(), phrases: ["\(.applicationName) 다음 곡"], shortTitle: "다음 곡", systemImageName: "forward.fill")
        AppShortcut(intent: PreviousTrackIntent(), phrases: ["\(.applicationName) 이전 곡"], shortTitle: "이전 곡", systemImageName: "backward.fill")
        AppShortcut(intent: PlayLikedIntent(), phrases: ["\(.applicationName)에서 좋아요 표시한 곡 틀어 줘"], shortTitle: "좋아요 표시한 곡", systemImageName: "heart.fill")
        AppShortcut(intent: SleepTimerIntent(), phrases: ["\(.applicationName) 수면 타이머"], shortTitle: "수면 타이머", systemImageName: "moon.zzz.fill")
        AppShortcut(intent: OpenChartsIntent(), phrases: ["\(.applicationName) 차트"], shortTitle: "차트", systemImageName: "chart.bar.fill")
    }
}
