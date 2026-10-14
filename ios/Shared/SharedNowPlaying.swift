// 앱과 홈 화면 위젯이 함께 쓰는 것: 지금 재생 정보(App Group 저장소)와 위젯 단추 동작.
import AppIntents
import Foundation

enum SharedNowPlaying {
    static let appGroup = "group.dev.seihee.ytmmobile"
    static let widgetKind = "NowPlaying"
    private static let key = "now-playing"
    /// 앱에서 쓰는 화면 언어(번역 코드). 위젯도 이 언어로 그린다.
    static let languageKey = "language"

    struct Info: Codable, Equatable {
        var videoId = ""
        var title = ""
        var artist = ""
        var playing = false
        /// 표지 그림 파일 이름(App Group 폴더 안)
        var artworkFile: String?
    }

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
    static var folder: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) }

    static func read() -> Info? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Info.self, from: data)
    }

    static func write(_ info: Info) {
        guard let data = try? JSONEncoder().encode(info) else { return }
        defaults?.set(data, forKey: key)
    }

    /// 표지 그림은 App Group 폴더의 Library/Caches에 둔다(지워져도 다음 곡에 다시 쓴다).
    static func artworkURL(_ name: String) -> URL? {
        guard let dir = folder?.appendingPathComponent("Library/Caches", isDirectory: true) else { return nil }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent(name)
    }
}

/// 위젯 단추가 부르는 재생 제어. 앱 안에서 실행된다(AudioPlaybackIntent) — 앱이 시작할 때 handler를 넣는다.
@MainActor
enum WidgetBridge {
    static var handler: ((String) -> Void)?
}

struct WidgetTogglePlayIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "재생/일시정지"
    static let isDiscoverable = false

    @MainActor
    func perform() async throws -> some IntentResult {
        WidgetBridge.handler?("toggle")
        return .result()
    }
}

struct WidgetNextIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "다음 곡"
    static let isDiscoverable = false

    @MainActor
    func perform() async throws -> some IntentResult {
        WidgetBridge.handler?("next")
        return .result()
    }
}

struct WidgetPreviousIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "이전 곡"
    static let isDiscoverable = false

    @MainActor
    func perform() async throws -> some IntentResult {
        WidgetBridge.handler?("previous")
        return .result()
    }
}
