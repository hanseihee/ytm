// 데스크톱과 같은 TypeScript 데이터 코드(src/lib: YouTube Music 응답 해석·Spotify 짝짓기·가사 찾기)를 돌리는 JavaScriptCore.
// 묶음은 `npm run build:ios-core`가 만든 ios/build/ytm-core.js (src/platform/jsc/index.ts가 입구).
//
// JS 쪽이 앱에 바라는 것(__native): 앱 명령(send), https 요청(fetch), 저장소, 타이머, 기록, 결과 전달(done).
// 모든 JavaScriptCore 접근은 전용 줄(queue) 하나에서만 한다.
import Foundation
import JavaScriptCore

final class JSCore: @unchecked Sendable {
    /// JS의 invoke(cmd, args)를 처리한다(engine_call, spotify_playlist). JSON 문자열로 답한다.
    var commandHandler: (@MainActor (String, [String: Any]) async throws -> String)?

    private let queue = DispatchQueue(label: "dev.seihee.ytm.core", qos: .userInitiated)
    private var context: JSContext?
    private var calls: [Int: CheckedContinuation<Data, Error>] = [:]
    private var nextCall = 0
    /// 데스크톱 화면의 localStorage에 해당(Spotify 짝 기억·저장한 재생목록 id 등)
    private let storage = UserDefaults(suiteName: "dev.seihee.ytm.core") ?? .standard
    private static let storagePrefix = "ls:"

    init() {
        queue.sync { setUp() }
    }

    private func setUp() {
        guard let context = JSContext(),
              let url = Bundle.main.url(forResource: "ytm-core", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            log("[core] 데이터 묶음(ytm-core.js)을 불러오지 못했습니다")
            return
        }
        context.name = "YTM core"
        context.exceptionHandler = { _, exception in
            log("[core] 예외: \(exception?.toString() ?? "?")")
        }
        guard let native = JSValue(newObjectIn: context) else { return }

        let send: @convention(block) (JSValue, JSValue, JSValue) -> Void = { [weak self] id, cmd, args in
            self?.send(id: Int(id.toInt32()), cmd: cmd.toString(), argsJSON: args.toString())
        }
        let fetch: @convention(block) (JSValue, JSValue, JSValue) -> Void = { [weak self] id, url, initJSON in
            self?.fetch(id: Int(id.toInt32()), url: url.toString(), initJSON: initJSON.toString())
        }
        let storageGet: @convention(block) (JSValue) -> Any = { [weak self] key in
            self?.storage.string(forKey: Self.storagePrefix + key.toString()) ?? NSNull()
        }
        let storageSet: @convention(block) (JSValue, JSValue) -> Void = { [weak self] key, value in
            self?.storage.set(value.toString(), forKey: Self.storagePrefix + key.toString())
        }
        let storageRemove: @convention(block) (JSValue) -> Void = { [weak self] key in
            self?.storage.removeObject(forKey: Self.storagePrefix + key.toString())
        }
        let timer: @convention(block) (JSValue, JSValue) -> Void = { [weak self] id, ms in
            let timerId = Int(id.toInt32())
            self?.queue.asyncAfter(deadline: .now() + max(0, ms.toDouble()) / 1000) {
                self?.context?.objectForKeyedSubscript("__timerFire")?.call(withArguments: [timerId])
            }
        }
        let logFn: @convention(block) (JSValue, JSValue) -> Void = { level, message in
            log("[core:\(level.toString() ?? "")] \(message.toString() ?? "")")
        }
        let done: @convention(block) (JSValue, JSValue, JSValue) -> Void = { [weak self] id, ok, payload in
            self?.complete(id: Int(id.toInt32()), ok: ok.toBool(), payload: payload.toString() ?? "")
        }
        for (name, block) in [
            ("send", unsafeBitCast(send, to: AnyObject.self)),
            ("fetch", unsafeBitCast(fetch, to: AnyObject.self)),
            ("storageGet", unsafeBitCast(storageGet, to: AnyObject.self)),
            ("storageSet", unsafeBitCast(storageSet, to: AnyObject.self)),
            ("storageRemove", unsafeBitCast(storageRemove, to: AnyObject.self)),
            ("timer", unsafeBitCast(timer, to: AnyObject.self)),
            ("log", unsafeBitCast(logFn, to: AnyObject.self)),
            ("done", unsafeBitCast(done, to: AnyObject.self)),
        ] {
            native.setObject(block, forKeyedSubscript: name as NSString)
        }
        context.setObject(native, forKeyedSubscript: "__native" as NSString)
        context.evaluateScript(source, withSourceURL: url)
        self.context = context
    }

    // MARK: 앱 → JS

    /// JS 데이터 함수 하나를 부르고 결과를 T로 해석한다.
    func call<T: Decodable>(_ name: String, _ args: [any Encodable] = [], as type: T.Type = T.self) async throws -> T {
        let argsJSON = try Self.encode(args)
        let data: Data = try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard let fn = self.context?.objectForKeyedSubscript("__coreCall"), fn.isObject else {
                    continuation.resume(throwing: BridgeError("core_unavailable"))
                    return
                }
                self.nextCall += 1
                let id = self.nextCall
                self.calls[id] = continuation
                fn.call(withArguments: [id, name, argsJSON])
            }
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            log("[core] \(name) 결과 해석 실패: \(error)")
            throw BridgeError("decode_failed \(name)")
        }
    }

    /// 결과를 쓰지 않는 호출
    func run(_ name: String, _ args: [any Encodable] = []) async throws {
        _ = try await call(name, args, as: JSONValue.self)
    }

    private static func encode(_ args: [any Encodable]) throws -> String {
        let encoder = JSONEncoder()
        let parts = try args.map { String(decoding: try encoder.encode($0), as: UTF8.self) }
        return "[" + parts.joined(separator: ",") + "]"
    }

    // MARK: JS → 앱 (모두 queue 위에서 불린다)

    private func complete(id: Int, ok: Bool, payload: String) {
        guard let continuation = calls.removeValue(forKey: id) else { return }
        if ok {
            continuation.resume(returning: Data(payload.utf8))
        } else {
            continuation.resume(throwing: BridgeError(payload))
        }
    }

    private func send(id: Int, cmd: String, argsJSON: String) {
        let args = (jsonObject(argsJSON) as? [String: Any]) ?? [:]
        let handler = commandHandler
        Task { @MainActor in
            let result: Result<String, Error>
            do {
                guard let handler else { throw BridgeError("ipc_unavailable") }
                result = .success(try await handler(cmd, args))
            } catch {
                result = .failure(error)
            }
            self.queue.async { self.resolve(id, result) }
        }
    }

    private func fetch(id: Int, url: String, initJSON: String) {
        guard let target = URL(string: url), target.scheme == "https" else {
            queue.async { self.resolve(id, .failure(BridgeError("bad_url"))) }
            return
        }
        var request = URLRequest(url: target, timeoutInterval: 20)
        if let options = jsonObject(initJSON) as? [String: Any] {
            request.httpMethod = options["method"] as? String ?? "GET"
            for (key, value) in options["headers"] as? [String: String] ?? [:] {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }
        URLSession.shared.dataTask(with: request) { data, response, error in
            let result: Result<String, Error>
            if let error {
                result = .failure(BridgeError("fetch_failed \(error.localizedDescription)"))
            } else {
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                result = .success(jsonString(["status": status, "body": String(decoding: data ?? Data(), as: UTF8.self)]))
            }
            self.queue.async { self.resolve(id, result) }
        }.resume()
    }

    private func resolve(_ id: Int, _ result: Result<String, Error>) {
        guard let fn = context?.objectForKeyedSubscript("__nativeResolve"), fn.isObject else { return }
        switch result {
        case .success(let json):
            fn.call(withArguments: [id, true, json])
        case .failure(let error):
            fn.call(withArguments: [id, false, (error as? BridgeError)?.message ?? error.localizedDescription])
        }
    }
}
