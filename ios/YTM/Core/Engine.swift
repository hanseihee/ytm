// 숨은 YouTube Music 웹 화면(엔진). 데스크톱의 engine 창과 같은 일을 한다(src-tauri/src/engine.rs).
//
// - music.youtube.com을 데스크톱 Safari로 띄우고, 데스크톱과 같은 engine.js를 페이지보다 먼저 넣는다.
// - 앱이 call()로 요청하면 번호를 붙여 window.__ytmEngine.handle(...)을 실행하고, engine.js가
//   engine_reply로 같은 번호의 답을 돌려줄 때까지 기다린다.
// - engine.js는 engine_event로 연결 상태(status)·재생 상태(state)·EQ 알림을 보낸다.
import UIKit
import WebKit

@MainActor
final class Engine: NSObject {
    static let homeURL = URL(string: "https://music.youtube.com/")!
    /// music.youtube.com 첫 화면의 ytcfg.SIGNIN_URL (데스크톱 lib.rs와 같은 값, 2026-10-14 관찰)
    static let signInURL = URL(string: "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26hl%3Dko%26next%3Dhttps%253A%252F%252Fmusic.youtube.com%252F&hl=ko")!
    /// 데스크톱판 맥 엔진과 같은 Safari 식별 문자열. 휴대폰용 YouTube Music은 화면 구조가 달라 engine.js가 맞지 않는다.
    nonisolated static let userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
    /// engine.js가 제공하는 요청 이름(engine.rs METHODS와 같다).
    /// YouTube Music 페이지 바탕색(#030303)
    static let background = UIColor(red: 3 / 255, green: 3 / 255, blue: 3 / 255, alpha: 1)

    static let methods: Set<String> = ["api", "status", "state", "play", "queueAdd", "queue", "queueJump", "control", "eq", "eqStream", "avSwitch", "videoView", "pip"]

    private static let readyTimeout: Double = 25
    private static let callTimeout: Double = 30

    let webView: WKWebView
    private(set) var status = EngineStatus()
    private(set) var lastState: PlayerState?
    var loginInProgress = false

    var onStatus: ((EngineStatus) -> Void)?
    var onState: ((PlayerState) -> Void)?
    /// "spectrum"·"eq" 이벤트(JSON 문자열)
    var onEvent: ((String, String) -> Void)?
    var onLoginFinished: (() -> Void)?

    private var nextId = 1
    private var pending: [Int: CheckedContinuation<String, Error>] = [:]
    private var readyWaiters: [UUID: CheckedContinuation<Bool, Never>] = [:]

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        // 숨은 화면이 사용자 동작 없이 소리를 내야 한다.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true
        // 지금 재생 화면의 영상 모드에서 화면 속 화면(PiP)으로 띄울 수 있게
        config.allowsPictureInPictureMediaPlayback = true
        config.defaultWebpagePreferences.preferredContentMode = .desktop
        let content = WKUserContentController()
        config.userContentController = content
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        super.init()

        content.addScriptMessageHandler(WeakReplyHandler(self), contentWorld: .page, name: "ytmEngine")
        content.addUserScript(WKUserScript(source: Self.prelude, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if let url = Bundle.main.url(forResource: "engine", withExtension: "js"), let source = try? String(contentsOf: url, encoding: .utf8) {
            content.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        } else {
            log("engine.js를 앱에서 찾지 못했습니다")
        }
        webView.customUserAgent = Self.userAgent
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // 안전 영역만큼 페이지를 줄이지 않는다(가로 전체 화면에서 영상이 화면 폭을 다 쓰게).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.backgroundColor = Self.background
        webView.isOpaque = false
        #if DEBUG
        webView.isInspectable = true
        #endif
    }

    func start() {
        webView.load(URLRequest(url: Self.homeURL))
    }

    func reloadHome() {
        webView.load(URLRequest(url: Self.homeURL))
    }

    func openSignIn() {
        loginInProgress = true
        webView.load(URLRequest(url: Self.signInURL))
    }

    // MARK: 요청

    /// 엔진에 요청 하나를 보내고 답(JSON 문자열)을 기다린다.
    func call(_ method: String, argsJSON: String = "null") async throws -> String {
        #if DEBUG
        let allowed = Self.methods.contains(method) || method == "debugEval"
        #else
        let allowed = Self.methods.contains(method)
        #endif
        guard allowed else { throw BridgeError("unknown_method \(method)") }
        if !status.ready {
            guard await waitReady() else { throw BridgeError("engine_not_ready") }
        }
        let id = nextId
        nextId += 1
        return try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            webView.callAsyncJavaScript(
                "window.__ytmEngine ? void window.__ytmEngine.handle(id, method, JSON.parse(args)) : void 0",
                arguments: ["id": id, "method": method, "args": argsJSON],
                in: nil,
                in: .page
            ) { [weak self] result in
                if case .failure(let error) = result {
                    self?.finish(id, .failure(BridgeError("engine_eval_failed \(error.localizedDescription)")))
                }
            }
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(Self.callTimeout))
                self?.finish(id, .failure(BridgeError("engine_timeout")))
            }
        }
    }

    /// 미디어 키·잠금 화면에서 오는 재생 제어(답을 기다리지 않는다).
    func control(_ command: String, _ value: Double? = nil) {
        webView.callAsyncJavaScript(
            "try { window.__ytmEngine && window.__ytmEngine.control(command, value === null ? undefined : value); } catch (e) { console.warn('[ytm-engine]', e); }",
            arguments: ["command": command, "value": value.map { NSNumber(value: $0) } ?? NSNull()],
            in: nil,
            in: .page,
            completionHandler: nil
        )
    }

    #if DEBUG
    /// 개발용 조사: 엔진 페이지에서 코드를 실행하고 결과를 JSON 문자열로.
    func evaluate(_ body: String) async throws -> String {
        let wrapped = "const __v = await (async () => { \(body) })(); return JSON.stringify(__v === undefined ? null : __v);"
        let value = try await webView.callAsyncJavaScript(wrapped, arguments: [:], in: nil, contentWorld: .page)
        return value as? String ?? "null"
    }
    #endif

    private func finish(_ id: Int, _ result: Result<String, Error>) {
        guard let continuation = pending.removeValue(forKey: id) else { return }
        continuation.resume(with: result)
    }

    private func failAll(_ reason: String) {
        let waiting = pending
        pending.removeAll()
        for (_, continuation) in waiting {
            continuation.resume(throwing: BridgeError(reason))
        }
    }

    private func waitReady() async -> Bool {
        if status.ready { return true }
        let key = UUID()
        return await withCheckedContinuation { continuation in
            readyWaiters[key] = continuation
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(Self.readyTimeout))
                if let self, let waiter = self.readyWaiters.removeValue(forKey: key) {
                    waiter.resume(returning: self.status.ready)
                }
            }
        }
    }

    // MARK: engine.js → 앱

    fileprivate func receive(_ body: [String: Any]) {
        switch body["cmd"] as? String {
        case "engine_reply":
            let id = (body["id"] as? NSNumber)?.intValue ?? -1
            if (body["ok"] as? Bool) == true {
                finish(id, .success(body["data"] as? String ?? "null"))
            } else {
                finish(id, .failure(BridgeError(body["error"] as? String ?? "engine_error")))
            }
        case "engine_event":
            handleEvent(kind: body["kind"] as? String ?? "", json: body["data"] as? String ?? "null")
        default:
            break
        }
    }

    private func handleEvent(kind: String, json: String) {
        switch kind {
        case "status":
            guard let next = try? JSONDecoder().decode(EngineStatus.self, from: Data(json.utf8)) else {
                log("엔진 상태 해석 실패: \(json.prefix(200))")
                return
            }
            setStatus(next)
            if next.ready && next.loggedIn && loginInProgress {
                loginInProgress = false
                onLoginFinished?()
            }
        case "state":
            guard let state = try? JSONDecoder().decode(PlayerState.self, from: Data(json.utf8)) else {
                log("재생 상태 해석 실패: \(json.prefix(200))")
                return
            }
            lastState = state
            onState?(state)
        case "spectrum", "eq", "ambient":
            onEvent?(kind, json)
        default:
            log("알 수 없는 엔진 이벤트: \(kind)")
        }
    }

    private func setStatus(_ next: EngineStatus) {
        status = next
        if next.ready {
            let waiters = readyWaiters
            readyWaiters.removeAll()
            for (_, waiter) in waiters { waiter.resume(returning: true) }
        }
        onStatus?(next)
    }

    /// engine.js가 쓰는 통로(window.__ytmIpc). 큰 응답은 JSON 문자열로 넘겨 앱이 다시 만들지 않고 그대로 전달한다.
    private static let prelude = """
    (() => {
      if (window.top !== window || window.__ytmIpc) return;
      const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ytmEngine;
      if (!handler) return;
      const json = (v) => JSON.stringify(v === undefined ? null : v);
      Object.defineProperty(window, '__ytmIpc', {
        configurable: false,
        writable: false,
        value: Object.freeze({
          invoke(cmd, args) {
            if (cmd === 'engine_reply') {
              const r = (args && args.reply) || {};
              return handler.postMessage({ cmd, id: r.id, ok: !!r.ok, error: r.error == null ? null : String(r.error), data: json(r.data) });
            }
            if (cmd === 'engine_event') {
              return handler.postMessage({ cmd, kind: String(args && args.kind), data: json(args && args.data) });
            }
            return Promise.reject(new Error('unknown_command ' + cmd));
          },
        }),
      });
    })();
    """
}

// MARK: 웹 화면 이벤트

extension Engine: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        // 페이지가 새로 뜨면 엔진 스크립트도 새로 시작한다. 기다리던 요청은 답을 받을 수 없다.
        var next = status
        next.ready = false
        setStatus(next)
        failAll("engine_navigating")
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return .cancel }
        if ["http", "https", "about", "blob", "data"].contains(scheme) { return .allow }
        return .cancel
    }

    /// 새 창 요청: YouTube Music·Google 로그인은 같은 화면에서, 나머지는 Safari로.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        let host = url.host() ?? ""
        if host == "music.youtube.com" || host == "accounts.youtube.com" || host.hasPrefix("accounts.google.") {
            webView.load(URLRequest(url: url))
        } else if url.scheme == "https" || url.scheme == "http" {
            UIApplication.shared.open(url)
        }
        return nil
    }

    /// 메모리가 모자라 웹 화면 프로세스가 끝나면 다시 띄운다(백그라운드에서 일어날 수 있다).
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        log("엔진 웹 화면이 종료되어 다시 불러옵니다")
        var next = status
        next.ready = false
        setStatus(next)
        failAll("engine_navigating")
        reloadHome()
    }
}

/// WKUserContentController는 처리기를 강하게 붙잡아서 약한 참조로 한 번 감싼다.
private final class WeakReplyHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var engine: Engine?
    init(_ engine: Engine) { self.engine = engine }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        // YouTube Music 최상위 페이지가 보낸 것만 받는다(광고·로그인 하위 프레임 제외).
        let host = message.frameInfo.securityOrigin.host
        guard message.frameInfo.isMainFrame, host == "music.youtube.com" || host == "www.youtube.com",
              let body = message.body as? [String: Any] else {
            replyHandler(nil, "rejected")
            return
        }
        MainActor.assumeIsolated {
            engine?.receive(body)
        }
        replyHandler(nil, nil)
    }
}
