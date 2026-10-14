// 개발 빌드 전용 조사 통로(데스크톱 engine.rs spawn_debug_inbox와 같은 방식).
// 앱의 Documents/debug/in/*.json을 0.5초마다 집어 실행하고 out/<이름>.json에 답을 쓴다.
//   {"name": "…", "target": "engine", "code": "return location.href"}   엔진 페이지에서 실행
//   {"name": "…", "target": "call", "method": "api", "args": {…}}       엔진 요청
//   {"name": "…", "target": "core", "fn": "search", "args": ["아이유"]} 데이터 함수
//   {"name": "…", "target": "app", "action": "…"}                      AppModel.debugAction
#if DEBUG
import Foundation

@MainActor
final class DebugInbox {
    nonisolated static let directory: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("debug", isDirectory: true)
    nonisolated private static let logQueue = DispatchQueue(label: "dev.seihee.ytm.debuglog")

    private weak var model: AppModel?
    private var timer: Timer?
    private var busy = false

    nonisolated static func append(log text: String) {
        logQueue.async {
            let file = directory.appendingPathComponent("log.txt")
            let line = "\(ISO8601DateFormatter().string(from: Date())) \(text)\n"
            if let handle = try? FileHandle(forWritingTo: file) {
                handle.seekToEndOfFile()
                handle.write(Data(line.utf8))
                try? handle.close()
            } else {
                try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try? Data(line.utf8).write(to: file)
            }
        }
    }

    func start(model: AppModel) {
        self.model = model
        let fm = FileManager.default
        try? fm.createDirectory(at: Self.directory.appendingPathComponent("in"), withIntermediateDirectories: true)
        try? fm.createDirectory(at: Self.directory.appendingPathComponent("out"), withIntermediateDirectories: true)
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.scan() }
        }
    }

    private func scan() {
        guard !busy, let model else { return }
        let inbox = Self.directory.appendingPathComponent("in")
        guard let files = try? FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil)
            .filter({ $0.pathExtension == "json" }).sorted(by: { $0.lastPathComponent < $1.lastPathComponent }), !files.isEmpty else { return }
        busy = true
        Task {
            for file in files {
                let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
                try? FileManager.default.removeItem(at: file)
                guard let item = jsonObject(text) as? [String: Any] else { continue }
                let name = item["name"] as? String ?? "unnamed"
                var body: [String: Any]
                do {
                    let json: String
                    switch item["target"] as? String {
                    case "engine":
                        json = try await model.engine.evaluate(item["code"] as? String ?? "return null")
                    case "call":
                        json = try await model.engine.call(item["method"] as? String ?? "", argsJSON: jsonString(item["args"]))
                    case "core":
                        let args = (item["args"] as? [Any] ?? []).map { AnyJSON($0) }
                        json = jsonString(try await model.core.call(item["fn"] as? String ?? "", args, as: JSONValue.self).foundation)
                    case "app":
                        json = jsonString(await model.debugAction(item["action"] as? String ?? "", item))
                    default:
                        throw BridgeError("unknown_target")
                    }
                    body = ["ok": true, "data": jsonObject(json) ?? NSNull()]
                } catch {
                    body = ["ok": false, "error": (error as? BridgeError)?.message ?? "\(error)"]
                }
                let out = Self.directory.appendingPathComponent("out/\(name).json")
                try? Data(jsonString(body).utf8).write(to: out)
            }
            busy = false
        }
    }
}

/// Foundation 값(JSON에서 읽은 것)을 그대로 Encodable로
struct AnyJSON: Encodable {
    let value: Any
    init(_ value: Any) { self.value = value }
    func encode(to encoder: Encoder) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
        try JSONDecoder().decode(JSONValue.self, from: data).encode(to: encoder)
    }
}

extension JSONValue {
    var foundation: Any {
        switch self {
        case .null: return NSNull()
        case .bool(let v): return v
        case .number(let v): return v
        case .string(let v): return v
        case .array(let v): return v.map(\.foundation)
        case .object(let v): return v.mapValues(\.foundation)
        }
    }
}
#endif
