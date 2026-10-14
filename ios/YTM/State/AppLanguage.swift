// 앱 화면 언어. 번역은 문자열 카탈로그(Localizable.xcstrings, 한국어 문구가 키)에 있다.
// 설정에서 고르면 앱을 다시 열지 않아도 바로 바뀐다: 화면의 Text는 .environment(\.locale)로(RootView),
// 코드에서 String으로 만드는 문구(알림·오류 문장 등)는 L(…)로 고른 언어의 번역을 찾는다.
// 고른 언어는 AppleLanguages(다음 실행·iOS 설정 앱의 앱별 언어와 같은 값)와 App Group(위젯)에도 남긴다.
import Foundation

enum AppLanguage {
    struct Option: Identifiable, Hashable {
        /// iOS 번역 코드(Localizable.xcstrings의 언어)
        let code: String
        /// 그 언어로 쓴 이름
        let name: String
        var id: String { code }
    }

    static let options: [Option] = [
        Option(code: "ko", name: "한국어"),
        Option(code: "en", name: "English"),
        Option(code: "ja", name: "日本語"),
        Option(code: "zh-Hans", name: "简体中文"),
        Option(code: "zh-Hant", name: "繁體中文"),
        Option(code: "es", name: "Español"),
        Option(code: "pt-BR", name: "Português (Brasil)"),
        Option(code: "fr", name: "Français"),
        Option(code: "de", name: "Deutsch"),
        Option(code: "id", name: "Bahasa Indonesia"),
    ]

    /// 지금 화면에 쓰는 번역(처음에는 iOS가 앱을 열 때 고른 것)
    private(set) static var current = Bundle.main.preferredLocalizations.first ?? "ko"

    static var locale: Locale { Locale(identifier: current) }

    static var isKorean: Bool { current.hasPrefix("ko") }

    /// 이 앱에만 따로 정한 언어(이 설정 화면이나 iOS 설정 앱의 앱별 언어). nil이면 기기 언어를 따른다.
    static var chosen: String? {
        guard let id = Bundle.main.bundleIdentifier,
              let list = UserDefaults.standard.persistentDomain(forName: id)?["AppleLanguages"] as? [String],
              !list.isEmpty else { return nil }
        return Bundle.preferredLocalizations(from: options.map(\.code), forPreferences: list).first
    }

    /// 언어 고르기(nil이면 기기 언어). 바뀐 뒤의 번역 코드를 돌려준다.
    @discardableResult
    static func choose(_ code: String?) -> String {
        let defaults = UserDefaults.standard
        if let code {
            defaults.set([code], forKey: "AppleLanguages")
        } else {
            defaults.removeObject(forKey: "AppleLanguages")
        }
        // 앱 것을 지우면 기기(전역) 설정이 보인다.
        let preferred = code.map { [$0] } ?? defaults.stringArray(forKey: "AppleLanguages") ?? Locale.preferredLanguages
        current = Bundle.preferredLocalizations(from: Bundle.main.localizations, forPreferences: preferred).first ?? "ko"
        share()
        return current
    }

    /// 위젯도 같은 언어로 그리게 App Group에 남긴다.
    static func share() {
        SharedNowPlaying.defaults?.set(current, forKey: SharedNowPlaying.languageKey)
    }

    /// 공용 TypeScript 데이터 코드(src/lib)가 쓰는 언어 코드
    static var coreCode: String {
        let code = current
        if code.hasPrefix("zh-Hans") || code == "zh-CN" { return "zh-CN" }
        if code.hasPrefix("zh-Hant") || code == "zh-TW" || code == "zh-HK" { return "zh-TW" }
        if code.hasPrefix("pt") { return "pt-BR" }
        return String(code.prefix(2))
    }
}

/// 고른 언어로 문구를 만든다. 코드에서 String으로 만드는 화면 문구는 String(localized:) 대신 이것을 써야
/// 언어를 바꿨을 때 앱을 다시 열지 않아도 바뀐다.
func L(_ resource: LocalizedStringResource) -> String {
    var resource = resource
    resource.locale = AppLanguage.locale
    return String(localized: resource)
}
