// YTM iOS — 데스크톱판(YTM Desktop)과 같은 기능의 iOS 음악 플레이어(SwiftUI).
//
// - 화면: SwiftUI(이 폴더의 Views).
// - 데이터: 데스크톱과 같은 TypeScript 코드(../src/lib)를 JavaScriptCore로 돌린다(Core/JSCore.swift).
// - 재생: 숨은 WKWebView에 music.youtube.com을 띄우고 데스크톱과 같은 engine.js를 넣는다(Core/Engine.swift).
//   소리는 YouTube Music 공식 플레이어가 낸다(음원 주소를 따로 뽑거나 광고를 막지 않는다).
import AVFoundation
import SwiftUI

@main
struct YTMApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // 무음 스위치와 상관없이 소리를 내고, 화면을 꺼도 계속 재생한다(Info.plist UIBackgroundModes audio와 함께).
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        } catch {
            log("오디오 세션 설정 실패: \(error)")
        }
        // 표지 이미지가 목록을 오갈 때마다 다시 받지 않게 넉넉히 기억한다.
        URLCache.shared = URLCache(memoryCapacity: 64 * 1024 * 1024, diskCapacity: 256 * 1024 * 1024)
        return true
    }
}

/// 화면·데이터 명령의 실패. 메시지는 짧은 코드(engine_timeout 등)이고 AppModel.describe가 문장으로 바꾼다.
struct BridgeError: Error, CustomStringConvertible {
    let message: String
    init(_ message: String) { self.message = message }
    var description: String { message }
}

/// 기록. 개발 빌드는 Documents/debug/log.txt에도 남긴다(시뮬레이터에서 바로 읽을 수 있게).
func log(_ text: String) {
    print("[ytm] \(text)")
    #if DEBUG
    DebugInbox.append(log: text)
    #endif
}

/// 값 하나를 JSON 문자열로
func jsonString(_ value: Any?) -> String {
    guard let value, !(value is NSNull) else { return "null" }
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]) else { return "null" }
    return String(decoding: data, as: UTF8.self)
}

/// JSON 문자열을 Foundation 값으로
func jsonObject(_ text: String) -> Any? {
    try? JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed])
}
