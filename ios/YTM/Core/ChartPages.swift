// 차트 원본 페이지 받아 오기(데스크톱 src-tauri/src/spotify.rs·charts.rs와 같은 일).
// - Spotify: 공개 임베드 페이지의 __NEXT_DATA__에서 곡 목록을 꺼낸다(Web API는 편집 플레이리스트를 막는다).
// - 멜론·지니·벅스·FLO·VIBE·써클차트·빌보드·Apple Music: 페이지 글을 그대로 넘기고, 해석은 데이터 묶음(src/lib/charts)이 한다.
import Foundation

enum ChartPages {
    private static let maxBytes = 8 * 1024 * 1024
    private static let nextDataStart = #"<script id="__NEXT_DATA__" type="application/json">"#

    private static func get(_ url: URL, prefix: String) async throws -> String {
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.setValue(Engine.userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("ko-KR,ko;q=0.9,en;q=0.8", forHTTPHeaderField: "Accept-Language")
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw BridgeError("\(prefix)_network \(error.localizedDescription)")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 404 { throw BridgeError("\(prefix)_not_found") }
        guard status == 200 else { throw BridgeError("\(prefix)_http_\(status)") }
        guard data.count <= maxBytes, let html = String(data: data, encoding: .utf8) else { throw BridgeError("\(prefix)_read") }
        return html
    }

    /// 받을 수 있는 차트 사이트(src/lib/charts의 주소들, 데스크톱 charts.rs ALLOWED_HOSTS와 같다)
    private static let allowedHosts: Set<String> = [
        "www.melon.com", "www.genie.co.kr", "music.bugs.co.kr", "www.music-flo.com",
        "apis.naver.com", "circlechart.kr", "www.billboard.com", "rss.applemarketingtools.com",
    ]

    /// 차트 페이지 하나(JSON 문자열로 감싼 본문)
    static func chartFetch(_ req: ChartRequestInfo) async throws -> String {
        guard let url = URL(string: req.url), url.scheme == "https", let host = url.host(), allowedHosts.contains(host) else {
            throw BridgeError("chart_not_allowed \(URL(string: req.url)?.host() ?? "")")
        }
        let source = host.split(separator: ".").dropLast().last.map(String.init) ?? "chart"
        var request = URLRequest(url: url, timeoutInterval: 25)
        request.httpMethod = req.method ?? "GET"
        for (key, value) in req.headers ?? [:] { request.setValue(value, forHTTPHeaderField: key) }
        if let body = req.body { request.httpBody = Data(body.utf8) }
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw BridgeError("\(source)_network \(error.localizedDescription)")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<400).contains(status) else { throw BridgeError("\(source)_http_\(status)") }
        guard data.count <= 12 * 1024 * 1024 else { throw BridgeError("\(source)_read") }
        return jsonString(String(decoding: data, as: UTF8.self))
    }

    /// Spotify 공개 플레이리스트(spotify.rs parse_page와 같은 결과 모양, JSON 문자열)
    static func spotifyPlaylist(id: String) async throws -> String {
        guard id.count == 22, id.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }),
              let url = URL(string: "https://open.spotify.com/embed/playlist/\(id)") else {
            throw BridgeError("spotify_bad_id")
        }
        let html = try await get(url, prefix: "spotify")
        guard let start = html.range(of: nextDataStart),
              let end = html.range(of: "</script>", range: start.upperBound..<html.endIndex),
              let data = jsonObject(String(html[start.upperBound..<end.lowerBound])) as? [String: Any],
              let props = data["props"] as? [String: Any],
              let pageProps = props["pageProps"] as? [String: Any],
              let state = pageProps["state"] as? [String: Any],
              let stateData = state["data"] as? [String: Any],
              let entity = stateData["entity"] as? [String: Any] else {
            throw BridgeError("spotify_format_changed")
        }
        let tracks: [[String: Any]] = (entity["trackList"] as? [[String: Any]] ?? []).compactMap { t in
            guard let uri = t["uri"] as? String else { return nil }
            return [
                "id": uri.split(separator: ":").last.map(String.init) ?? uri,
                "title": t["title"] as? String ?? "",
                "artists": t["subtitle"] as? String ?? "",
                "durationMs": (t["duration"] as? NSNumber)?.doubleValue ?? 0,
                "explicit": (t["isExplicit"] as? Bool ?? false) || (t["isNineteenPlus"] as? Bool ?? false),
            ]
        }
        let cover = ((entity["coverArt"] as? [String: Any])?["sources"] as? [[String: Any]])?.first?["url"] as? String
        var out: [String: Any] = [
            "id": id,
            "name": entity["name"] as? String ?? "",
            "subtitle": entity["subtitle"] as? String ?? "",
            "tracks": tracks,
        ]
        if let cover { out["cover"] = cover }
        return jsonString(out)
    }
}
