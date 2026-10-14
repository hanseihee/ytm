// 차트 원본 페이지 받아 오기(데스크톱 src-tauri/src/spotify.rs·melon.rs와 같은 일).
// - Spotify: 공개 임베드 페이지의 __NEXT_DATA__에서 곡 목록을 꺼낸다(Web API는 편집 플레이리스트를 막는다).
// - 멜론: 차트 페이지 HTML을 그대로 넘기고, 해석은 데이터 묶음(src/lib/melon.ts)이 한다.
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

    /// 멜론 TOP 100 페이지(JSON 문자열로 감싼 HTML)
    static func melonPage() async throws -> String {
        jsonString(try await get(URL(string: "https://www.melon.com/chart/index.htm")!, prefix: "melon"))
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
