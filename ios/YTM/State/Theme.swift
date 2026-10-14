// 테마 8종. 색 값은 데스크톱 src/styles.css의 :root[data-theme] 묶음·src/lib/theme.ts와 같다.
import SwiftUI

enum ThemeID: String, CaseIterable, Identifiable {
    case system, dark, light, midnight, forest, sunset, mono, sakura

    var id: String { rawValue }

    var label: LocalizedStringResource {
        switch self {
        case .system: "시스템 설정"
        case .dark: "다크"
        case .light: "라이트"
        case .midnight: "미드나잇"
        case .forest: "숲"
        case .sunset: "노을"
        case .mono: "모노"
        case .sakura: "벚꽃"
        }
    }

    var description: LocalizedStringResource {
        switch self {
        case .system: "기기의 화면 모드를 따라 다크와 라이트를 바꿉니다"
        case .dark: "밤에 듣기 좋은 짙은 자주색 (기본)"
        case .light: "밝은 곳에서 보기 편한 흰 바탕"
        case .midnight: "남색 바탕에 청록 강조"
        case .forest: "짙은 초록 바탕에 연두 강조"
        case .sunset: "따뜻한 갈색 바탕에 주황·산호 강조"
        case .mono: "색을 뺀 검정·회색"
        case .sakura: "연분홍 라이트"
        }
    }

    func palette(system: ColorScheme) -> Palette {
        switch self {
        case .system: system == .light ? .light : .dark
        case .dark: .dark
        case .light: .light
        case .midnight: .midnight
        case .forest: .forest
        case .sunset: .sunset
        case .mono: .mono
        case .sakura: .sakura
        }
    }
}

struct Palette {
    /// 바탕
    var night: Color
    /// 한 단 올라온 면(목록 묶음·미니 플레이어)
    var dusk: Color
    /// 메뉴·카드 면
    var plum: Color
    /// 글자 3단계
    var ink: Color
    var mist: Color
    var faint: Color
    /// 강조 그라데이션 두 색
    var rose: Color
    var violet: Color
    /// 강조 글자
    var roseSoft: Color
    /// 강조 위 글자
    var onAccent: Color
    var isLight: Bool

    var accent: LinearGradient {
        LinearGradient(colors: [rose, violet], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    static let dark = Palette(night: Color(hex: 0x140E1C), dusk: Color(hex: 0x1C1526), plum: Color(hex: 0x2A2036), ink: Color(hex: 0xF4EFF8), mist: Color(hex: 0xAB9FBB), faint: Color(hex: 0x75697F), rose: Color(hex: 0xFF4D6D), violet: Color(hex: 0x7B3FF2), roseSoft: Color(hex: 0xFF8FA6), onAccent: .white, isLight: false)
    static let light = Palette(night: Color(hex: 0xF6F3F9), dusk: Color(hex: 0xFFFFFF), plum: Color(hex: 0xECE6F2), ink: Color(hex: 0x1D1426), mist: Color(hex: 0x5F5370), faint: Color(hex: 0x9A90A6), rose: Color(hex: 0xE8335A), violet: Color(hex: 0x6A2FE0), roseSoft: Color(hex: 0xC92A50), onAccent: .white, isLight: true)
    static let midnight = Palette(night: Color(hex: 0x0B1120), dusk: Color(hex: 0x111A2E), plum: Color(hex: 0x1A2540), ink: Color(hex: 0xEAF1FF), mist: Color(hex: 0x9AA8C4), faint: Color(hex: 0x63708B), rose: Color(hex: 0x14A3C7), violet: Color(hex: 0x3B5BDB), roseSoft: Color(hex: 0x5FD4F0), onAccent: .white, isLight: false)
    static let forest = Palette(night: Color(hex: 0x0E1512), dusk: Color(hex: 0x141E19), plum: Color(hex: 0x1D2A23), ink: Color(hex: 0xECF5EE), mist: Color(hex: 0x9DB3A4), faint: Color(hex: 0x66796C), rose: Color(hex: 0x8BD450), violet: Color(hex: 0x1FA37A), roseSoft: Color(hex: 0xA9E27A), onAccent: Color(hex: 0x08130C), isLight: false)
    static let sunset = Palette(night: Color(hex: 0x17100E), dusk: Color(hex: 0x1F1613), plum: Color(hex: 0x2C1F1A), ink: Color(hex: 0xFBF1EC), mist: Color(hex: 0xC4A99D), faint: Color(hex: 0x85695E), rose: Color(hex: 0xFFB547), violet: Color(hex: 0xFF5A5F), roseSoft: Color(hex: 0xFFC879), onAccent: Color(hex: 0x24110A), isLight: false)
    static let mono = Palette(night: Color(hex: 0x101112), dusk: Color(hex: 0x17181A), plum: Color(hex: 0x222326), ink: Color(hex: 0xF2F2F3), mist: Color(hex: 0xA2A4A8), faint: Color(hex: 0x6B6D72), rose: Color(hex: 0xF2F2F3), violet: Color(hex: 0xB9BBC0), roseSoft: Color(hex: 0xFFFFFF), onAccent: Color(hex: 0x111214), isLight: false)
    static let sakura = Palette(night: Color(hex: 0xFFF6F8), dusk: Color(hex: 0xFFFFFF), plum: Color(hex: 0xFBE7EC), ink: Color(hex: 0x2B1520), mist: Color(hex: 0x7A5866), faint: Color(hex: 0xB49AA5), rose: Color(hex: 0xFF6F9C), violet: Color(hex: 0xE0457B), roseSoft: Color(hex: 0xC93A6B), onAccent: .white, isLight: true)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

extension EnvironmentValues {
    @Entry var palette: Palette = .dark
}
