// 데이터 모양. src/lib/ytm/types.ts·src/lib/spotify.ts·src/lib/lyrics.ts·src/lib/tauri.ts와 같은 이름·구조다
// (JavaScriptCore 데이터 묶음이 JSON으로 넘겨준다).
import Foundation

/// 모양이 정해지지 않은 JSON 값(YouTube Music 재생 명령 원본 등). 받은 그대로 다시 JS로 돌려보낸다.
enum JSONValue: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }

    var string: String? {
        if case .string(let s) = self { return s }
        return nil
    }
}

struct Ref: Codable, Hashable {
    var name: String
    var id: String?
}

struct Track: Codable, Hashable {
    var videoId: String
    var title: String
    var artists: [Ref]
    var album: Ref?
    /// 초
    var duration: Double?
    var thumbnail: String?
    /// 플레이리스트 안 자리(빼기에 필요)
    var setVideoId: String?
    var play: JSONValue?
    var isVideo: Bool
    var available: Bool
    var index: Int?
    var extra: String?

    var artistLine: String { artists.map(\.name).joined(separator: ", ") }
}

struct Card: Codable, Hashable {
    var kind: String
    var title: String
    var subtitle: String
    var thumbnail: String?
    var browseId: String?
    var params: String?
    var videoId: String?
    var play: JSONValue?
    var playlistId: String?

    var isRound: Bool { kind == "artist" || kind == "profile" }
}

struct MoreLink: Codable, Hashable {
    var title: String?
    var browseId: String
    var params: String?
}

struct Continuation: Codable, Hashable {
    var token: String
    var style: String
}

struct Shelf: Codable, Hashable {
    var title: String
    var tracks: [Track]
    var cards: [Card]
    var more: MoreLink?
    var continuation: Continuation?
}

struct SearchChip: Codable, Hashable {
    var label: String
    var params: String?
    var selected: Bool
}

struct TopResult: Codable, Hashable {
    var card: Card?
    var track: Track?
    var tracks: [Track]
}

struct SearchResult: Codable {
    var chips: [SearchChip]
    var top: TopResult?
    var shelves: [Shelf]
}

struct Suggestions: Codable {
    var queries: [String]
    var tracks: [Track]
    var cards: [Card]
}

struct CollectionHeader: Codable {
    var kind: String
    var title: String
    var typeLabel: String
    var year: String?
    var artists: [Ref]
    var stats: String?
    var description: String?
    var thumbnail: String?
    var play: JSONValue?
    var shuffle: JSONValue?
    var radio: JSONValue?
    var playlistId: String?
    var saved: Bool?
    var editable: Bool
    var privacy: String?
    var author: Ref?
}

struct CollectionPage: Codable {
    var header: CollectionHeader
    var tracks: [Track]
    var continuation: Continuation?
    var shelves: [Shelf]
    /// 내 재생목록 아래 "추천" 곡 묶음을 부르는 값
    var sectionsContinuation: Continuation?
}

struct ArtistPage: Codable {
    var name: String
    var thumbnail: String?
    var description: String?
    var subscribers: String?
    var shuffle: JSONValue?
    var radio: JSONValue?
    var channelId: String?
    var subscribed: Bool?
    var subscribeParams: String?
    var shelves: [Shelf]
}

struct HomePage: Codable {
    var shelves: [Shelf]
    var continuation: Continuation?
}

/// 이어받기 결과(parseContinuationItems)
struct MorePage: Codable {
    var tracks: [Track]
    var cards: [Card]
    var shelves: [Shelf]
    var continuation: Continuation?
}

struct BrowsePage: Codable {
    var title: String
    var shelves: [Shelf]
    var continuation: Continuation?
}

struct LibraryPlaylists: Codable {
    var cards: [Card]
    var continuation: Continuation?
}

struct QueueItem: Codable, Hashable {
    var track: Track
    var selected: Bool
}

struct QueueData: Codable {
    var items: [QueueItem?]
    var automix: [Track]
}

struct PlaylistOption: Codable, Hashable, Identifiable {
    var playlistId: String
    var title: String
    var thumbnail: String?
    var contains: Bool
    var id: String { playlistId }
}

struct Account: Codable, Hashable {
    var name: String
    var handle: String?
    var photo: String?
}

// MARK: 차트

struct ChartInfo: Codable, Hashable, Identifiable {
    var code: String
    var label: String
    var id: String
    /// "spotify" 또는 멜론·지니 등(src/lib/charts)
    var source: String
    /// 고르기 화면의 묶음 이름
    var group: String

    var shortLabel: String { source == "spotify" ? "Spotify \(label)" : label }
}

/// 차트 곡 요청 하나(src/lib/charts ChartRequest)
struct ChartRequestInfo: Codable {
    var url: String
    var method: String?
    var headers: [String: String]?
    var body: String?
}

struct ChartTrack: Codable, Hashable, Identifiable {
    var id: String
    var title: String
    var artists: String
    var durationMs: Double
    var explicit: Bool
}

struct ChartPlaylist: Codable {
    var id: String
    var name: String
    var subtitle: String
    var cover: String?
    var tracks: [ChartTrack]
}

struct ChartMatch: Codable, Hashable {
    var track: Track?
    /// "good" | "unsure" | "none"
    var quality: String
}

// MARK: 가사

struct LyricLine: Codable, Hashable {
    /// 초
    var time: Double
    var text: String
}

struct Lyrics: Codable {
    var synced: [LyricLine]?
    var plain: String?
    var source: String
}

struct LyricsQuery: Codable {
    var videoId: String
    var title: String
    var artist: String
    var album: String?
    var duration: Double
}

// MARK: 엔진

struct EngineStatus: Codable, Equatable {
    var ready = false
    var host = ""
    var path = ""
    var loggedIn = false
    var subscriber = false
}

/// engine.js readState()가 보내는 재생 상태
struct PlayerState: Codable, Equatable {
    var videoId = ""
    var title = ""
    var artist = ""
    var album = ""
    var artwork = ""
    var duration: Double = 0
    var position: Double = 0
    var playing = false
    var buffering = false
    var ad = false
    var likeStatus = "INDIFFERENT"
    var `repeat` = "NONE"
    var volume: Double = 100
    var muted = false
    /// 노래(음원)↔영상(뮤직비디오) 짝이 있는지
    var avAvailable = false
    /// 지금 영상 쪽인지
    var avVideo = false
    /// 실제 영상 화면이 나오는지(노래 쪽은 소리만 받는다)
    var hasPicture = false
    /// 짝 버전 videoId와 시간 차이(짝 버전 위치 = 지금 위치 + avShift초)
    var avOther = ""
    var avShift = 0.0
    /// 엔진이 상태를 읽은 시각(ms, 엔진 시계). 앱은 받은 시각(receivedAt)으로 위치를 이어서 계산한다.
    var at: Double = 0

    enum CodingKeys: String, CodingKey {
        case videoId, title, artist, album, artwork, duration, position, playing, buffering, ad, likeStatus, `repeat`, volume, muted, avAvailable, avVideo, hasPicture, avOther, avShift, at
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        videoId = try c.decodeIfPresent(String.self, forKey: .videoId) ?? ""
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        artist = try c.decodeIfPresent(String.self, forKey: .artist) ?? ""
        album = try c.decodeIfPresent(String.self, forKey: .album) ?? ""
        artwork = (try? c.decodeIfPresent(String.self, forKey: .artwork)) ?? ""
        duration = try c.decodeIfPresent(Double.self, forKey: .duration) ?? 0
        position = try c.decodeIfPresent(Double.self, forKey: .position) ?? 0
        playing = try c.decodeIfPresent(Bool.self, forKey: .playing) ?? false
        buffering = try c.decodeIfPresent(Bool.self, forKey: .buffering) ?? false
        ad = try c.decodeIfPresent(Bool.self, forKey: .ad) ?? false
        likeStatus = try c.decodeIfPresent(String.self, forKey: .likeStatus) ?? "INDIFFERENT"
        `repeat` = try c.decodeIfPresent(String.self, forKey: .repeat) ?? "NONE"
        volume = try c.decodeIfPresent(Double.self, forKey: .volume) ?? 100
        muted = try c.decodeIfPresent(Bool.self, forKey: .muted) ?? false
        avAvailable = try c.decodeIfPresent(Bool.self, forKey: .avAvailable) ?? false
        avVideo = try c.decodeIfPresent(Bool.self, forKey: .avVideo) ?? false
        hasPicture = try c.decodeIfPresent(Bool.self, forKey: .hasPicture) ?? false
        avOther = try c.decodeIfPresent(String.self, forKey: .avOther) ?? ""
        avShift = try c.decodeIfPresent(Double.self, forKey: .avShift) ?? 0
        at = try c.decodeIfPresent(Double.self, forKey: .at) ?? 0
    }
}

// MARK: 둘러보기·댓글·통계

struct MoodItem: Codable, Hashable {
    var label: String
    var browseId: String
    var params: String?
    /// "#rrggbb"
    var color: String?
}

struct MoodSection: Codable, Hashable {
    var title: String
    var items: [MoodItem]
}

struct MoodsPage: Codable {
    var title: String
    var sections: [MoodSection]
}

struct Comment: Codable, Hashable, Identifiable {
    var id: String
    var author: String
    var avatar: String?
    var text: String
    var published: String
    var likes: String
    var replies: String
    var isArtist: Bool
}

struct CommentsPage: Codable {
    var countText: String?
    var comments: [Comment]
    var continuation: String?
}

struct StatsTrack: Codable, Hashable, Identifiable {
    var id: String
    var title: String
    var artist: String
    var artwork: String
    var count: Int
    var seconds: Double
}

struct StatsArtist: Codable, Hashable, Identifiable {
    var name: String
    var count: Int
    var seconds: Double
    var id: String { name }
}

struct StatsDay: Codable, Hashable {
    var label: String
    var seconds: Double
}

struct StatsSummary: Codable {
    var range: String
    var totalSeconds: Double
    var playCount: Int
    var topTracks: [StatsTrack]
    var topArtists: [StatsArtist]
    var days: [StatsDay]
}

/// 영상 모드에서 엔진이 알려 주는 영상 위·아래 평균색(0~255, RGB)
struct AmbientColors: Codable, Equatable {
    var top: [Int]
    var bottom: [Int]
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
