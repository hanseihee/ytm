// 데이터 함수 모음: src/lib/ytm/client.ts·spotify.ts·lyrics.ts를 JavaScriptCore로 부른다(src/platform/jsc/index.ts).
import Foundation

struct API {
    let core: JSCore

    // MARK: 둘러보기
    func home() async throws -> HomePage { try await core.call("home") }
    func homeMore(_ c: Continuation) async throws -> MorePage { try await core.call("homeMore", [c]) }
    func search(_ query: String, params: String? = nil) async throws -> SearchResult {
        try await core.call("search", params.map { [query, $0] } ?? [query])
    }
    func searchMore(_ c: Continuation) async throws -> MorePage { try await core.call("searchMore", [c]) }
    func suggestions(_ input: String) async throws -> Suggestions { try await core.call("suggestions", [input]) }
    func album(_ id: String) async throws -> CollectionPage { try await core.call("album", [id]) }
    func playlist(_ id: String) async throws -> CollectionPage { try await core.call("playlist", [id]) }
    func playlistMore(_ c: Continuation) async throws -> MorePage { try await core.call("playlistMore", [c]) }
    func artist(_ id: String) async throws -> ArtistPage { try await core.call("artist", [id]) }
    func browse(_ id: String, params: String? = nil) async throws -> BrowsePage {
        try await core.call("browse", params.map { [id, $0] } ?? [id])
    }

    // MARK: 보관함
    func likedSongs() async throws -> CollectionPage { try await core.call("likedSongs") }
    func libraryPlaylists() async throws -> LibraryPlaylists { try await core.call("libraryPlaylists") }
    func account() async throws -> Account? { try await core.call("account", as: Account?.self) }
    func setTrackLiked(_ videoId: String, _ liked: Bool) async throws { try await core.run("setTrackLiked", [videoId, liked]) }
    func setCollectionSaved(_ playlistId: String, _ saved: Bool) async throws { try await core.run("setCollectionSaved", [playlistId, saved]) }
    func addToPlaylistOptions(_ videoIds: [String]) async throws -> [PlaylistOption] { try await core.call("addToPlaylistOptions", [videoIds]) }
    /// 새 플레이리스트 id
    func createPlaylist(_ title: String, _ description: String, privacy: String, videoIds: [String]) async throws -> String {
        try await core.call("createPlaylist", [title, description, privacy, videoIds])
    }
    func addToPlaylist(_ playlistId: String, _ videoIds: [String]) async throws { try await core.run("addToPlaylist", [playlistId, videoIds]) }
    func removeFromPlaylist(_ playlistId: String, _ tracks: [Track]) async throws { try await core.run("removeFromPlaylist", [playlistId, tracks]) }
    func renamePlaylist(_ playlistId: String, _ name: String, _ description: String?) async throws {
        try await core.run("renamePlaylist", description.map { [playlistId, name, $0] } ?? [playlistId, name])
    }
    func deletePlaylist(_ playlistId: String) async throws { try await core.run("deletePlaylist", [playlistId]) }

    // MARK: 재생
    func play(_ endpoint: JSONValue) async throws { try await core.run("play", [endpoint]) }
    func playTrack(_ track: Track) async throws { try await core.run("playTrack", [track]) }
    func queueAdd(videoId: String? = nil, videoIds: [String]? = nil, playlistId: String? = nil, position: String) async throws {
        var target: [String: JSONValue] = [:]
        if let videoId { target["videoId"] = .string(videoId) }
        if let videoIds { target["videoIds"] = .array(videoIds.map { .string($0) }) }
        if let playlistId { target["playlistId"] = .string(playlistId) }
        try await core.run("queueAdd", [JSONValue.object(target), position])
    }
    func queue() async throws -> QueueData { try await core.call("queue") }
    func queueJump(_ index: Int) async throws { try await core.run("queueJump", [index]) }

    // MARK: 가사
    func lyrics(_ q: LyricsQuery) async throws -> Lyrics? { try await core.call("lyrics", [q], as: Lyrics?.self) }

    // MARK: 차트(멜론 TOP 100·Spotify)
    func charts() async throws -> [ChartInfo] { try await core.call("charts") }
    func chartPlaylist(_ id: String) async throws -> ChartPlaylist { try await core.call("spotifyPlaylist", [id]) }
    func matchTrack(_ t: ChartTrack, useCache: Bool = true) async throws -> ChartMatch { try await core.call("matchTrack", [t, useCache]) }
    func playlistIdFrom(_ input: String) async throws -> String? { try await core.call("playlistIdFrom", [input], as: String?.self) }
    func savedPlaylistId(_ id: String) async throws -> String? { try await core.call("savedPlaylistId", [id], as: String?.self) }
    func isSynced(_ id: String, _ tracks: [Track]) async throws -> Bool { try await core.call("isSynced", [id, tracks]) }
    func chartTitle(id: String, name: String) async throws -> String {
        try await core.call("chartTitle", [JSONValue.object(["id": .string(id), "name": .string(name)])])
    }
    func chartKind(_ id: String) async throws -> String { try await core.call("chartKind", [id]) }
    func todayLabel() async throws -> String { try await core.call("todayLabel") }
    /// 대기열에 넣은 곡 수
    func playInChartOrder(_ id: String, ordered: [Track], found: [Track]) async throws -> Int {
        try await core.call("playInChartOrder", [id, ordered, found])
    }
    /// 내 YouTube Music 재생목록 id
    func syncToYouTubeMusic(_ playlist: ChartPlaylist, _ tracks: [Track]) async throws -> String {
        try await core.call("syncToYouTubeMusic", [playlist, tracks])
    }
    func describeChartError(_ message: String) async -> String {
        (try? await core.call("describeSpotifyError", [message], as: String.self)) ?? message
    }
}
