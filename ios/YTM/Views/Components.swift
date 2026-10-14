// 여러 화면이 같이 쓰는 조각: 표지, 곡 줄, 카드, 묶음(선반), 곡·카드 메뉴, 불러오기 상태.
import SwiftUI

// MARK: 표지

struct CoverImage: View {
    let url: String?
    /// nil이면 놓인 자리 폭에 맞춘 정사각형
    var size: CGFloat?
    var round = false
    var corner: CGFloat = 6
    @Environment(\.palette) private var palette

    var body: some View {
        Color.clear
            .frame(width: size, height: size)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                AsyncImage(url: url.flatMap { URL(string: $0) }, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
                    if case .success(let image) = phase {
                        image.resizable().scaledToFill()
                            // YouTube 4:3 썸네일(hqdefault 등)은 16:9 영상 위아래에 검은 띠가 들어 있어 그만큼 확대해 잘라낸다.
                            .scaleEffect(Self.isLetterboxed(url) ? 4.0 / 3.0 : 1)
                    } else {
                        ZStack {
                            palette.plum
                            Image(systemName: "music.note")
                                .font(.system(size: (size ?? 120) * 0.32))
                                .foregroundStyle(palette.faint)
                        }
                    }
                }
            }
            .clipShape(round ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: corner, style: .continuous)))
            .accessibilityHidden(true)
    }

    static func isLetterboxed(_ url: String?) -> Bool {
        guard let url, url.contains("i.ytimg.com/") else { return false }
        return url.range(of: #"/(hqdefault|sddefault|0)\.jpg"#, options: .regularExpression) != nil
    }
}

// MARK: 곡 줄

struct TrackMenuContext {
    /// 내가 만든 플레이리스트 화면이면 그 id(곡 빼기 가능)
    var editablePlaylistId: String?
    var onRemoved: ((Track) -> Void)?
}

struct NowPlayingBars: View {
    @Environment(\.palette) private var palette
    var body: some View {
        Image(systemName: "waveform")
            .symbolEffect(.variableColor.iterative, options: .repeating)
            .foregroundStyle(palette.roseSoft)
    }
}

struct TrackRow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    let track: Track
    /// 앨범처럼 수록 순서가 의미 있으면 표지 대신 번호
    var number: Int?
    var context = TrackMenuContext()
    var showDuration = true

    var body: some View {
        let current = model.player.videoId == track.videoId
        let playing = current && model.player.playing
        HStack(spacing: 12) {
            ZStack {
                if let number {
                    Text("\(number)")
                        .font(.body.monospacedDigit())
                        .foregroundStyle(palette.mist)
                        .opacity(playing ? 0 : 1)
                        .frame(width: 30)
                } else {
                    CoverImage(url: track.thumbnail, size: 48, corner: 5)
                        .overlay { if playing { Color.black.opacity(0.45).clipShape(RoundedRectangle(cornerRadius: 5)) } }
                }
                if playing { NowPlayingBars() }
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(track.title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(current ? palette.roseSoft : palette.ink)
                        .lineLimit(1)
                    if track.isVideo {
                        Text("영상")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(palette.mist)
                            .padding(.horizontal, 4)
                            .overlay(RoundedRectangle(cornerRadius: 3).stroke(palette.faint.opacity(0.6)))
                    }
                }
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(palette.mist)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            if model.liked.contains(track.videoId) {
                Image(systemName: "heart.fill")
                    .font(.caption)
                    .foregroundStyle(palette.roseSoft)
                    .accessibilityLabel("좋아요 표시함")
            }
            Menu {
                TrackMenu(track: track, context: context)
            } label: {
                Image(systemName: "ellipsis")
                    .foregroundStyle(palette.mist)
                    .frame(width: 34, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("더 보기")
        }
        .contentShape(Rectangle())
        .opacity(track.available ? 1 : 0.45)
        .onTapGesture { model.playTrack(track) }
        .contextMenu { TrackMenu(track: track, context: context) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { model.playTrack(track) }
    }

    private var subtitle: String {
        var parts = [track.artistLine]
        if let extra = track.extra, !extra.isEmpty { parts.append(extra) }
        if showDuration, let d = track.duration { parts.append(formatTime(d)) }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// 곡 메뉴(src/components/menus.ts trackMenu와 같은 항목)
struct TrackMenu: View {
    @Environment(AppModel.self) private var model
    let track: Track
    var context = TrackMenuContext()

    var body: some View {
        let liked = model.liked.contains(track.videoId)
        Button("재생", systemImage: "play") { model.playTrack(track) }
            .disabled(!track.available)
        Button("다음에 재생", systemImage: "text.line.first.and.arrowtriangle.forward") {
            model.enqueue(videoId: track.videoId, title: track.title, position: "next")
        }
        Button("대기열 끝에 추가", systemImage: "text.line.last.and.arrowtriangle.forward") {
            model.enqueue(videoId: track.videoId, title: track.title, position: "end")
        }
        Button("이 곡으로 믹스 시작", systemImage: "dot.radiowaves.left.and.right") {
            model.playEndpoint(Endpoints.mix(track.videoId), failure: "믹스를 시작하지 못했습니다")
        }
        Divider()
        Button(liked ? "좋아요 취소" : "좋아요", systemImage: liked ? "heart.slash" : "heart") {
            model.toggleLike(videoId: track.videoId, title: track.title)
        }
        Button("플레이리스트에 추가…", systemImage: "text.badge.plus") {
            model.sheet = .addToPlaylist([track])
        }
        if let playlistId = context.editablePlaylistId, track.setVideoId != nil {
            Button("이 플레이리스트에서 빼기", systemImage: "minus.circle", role: .destructive) {
                Task {
                    if await model.removeTracks(from: playlistId, [track]) { context.onRemoved?(track) }
                }
            }
        }
        let artists = track.artists.filter { $0.id != nil }.prefix(3)
        if track.album?.id != nil || !artists.isEmpty {
            Divider()
            if let albumId = track.album?.id {
                Button("앨범으로 이동", systemImage: "square.stack") { model.go(.album(albumId)) }
            }
            ForEach(Array(artists.enumerated()), id: \.offset) { _, artist in
                Button("\(artist.name) 페이지로 이동", systemImage: "person") { model.go(routeForBrowse(artist.id!)) }
            }
        }
    }
}

// MARK: 카드

private let kindLabels: [String: LocalizedStringResource] = [
    "album": "앨범", "single": "싱글", "ep": "EP", "playlist": "플레이리스트", "artist": "아티스트",
    "song": "노래", "video": "영상", "episode": "에피소드", "podcast": "팟캐스트", "profile": "프로필",
]
func kindLabel(_ kind: String) -> String { kindLabels[kind].map { L($0) } ?? "" }

struct CardTile: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    let card: Card
    var width: CGFloat? = 148

    var body: some View {
        VStack(alignment: card.isRound ? .center : .leading, spacing: 6) {
            CoverImage(url: card.thumbnail, size: width, round: card.isRound, corner: 8)
                .overlay(alignment: .bottomTrailing) {
                    if card.play != nil && !card.isRound {
                        Button {
                            if let play = card.play { model.playEndpoint(play) }
                        } label: {
                            Image(systemName: "play.fill")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(palette.onAccent)
                                .frame(width: 34, height: 34)
                                .background(Circle().fill(palette.accent))
                                .shadow(radius: 6, y: 3)
                        }
                        .padding(7)
                        .accessibilityLabel("\(card.title) 재생")
                    }
                }
            Text(card.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(palette.ink)
                .lineLimit(2)
                .multilineTextAlignment(card.isRound ? .center : .leading)
            Text(card.subtitle.isEmpty ? kindLabel(card.kind) : card.subtitle)
                .font(.caption)
                .foregroundStyle(palette.mist)
                .lineLimit(2)
                .multilineTextAlignment(card.isRound ? .center : .leading)
        }
        .frame(width: width, alignment: card.isRound ? .center : .leading)
        .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture { open() }
        .contextMenu { CardMenu(card: card) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { open() }
    }

    private func open() {
        if let id = card.browseId {
            model.go(routeForBrowse(id, params: card.params, title: card.title))
        } else if let play = card.play {
            model.playEndpoint(play)
        }
    }
}

/// 카드 메뉴(src/components/menus.ts cardMenu와 같은 항목)
struct CardMenu: View {
    @Environment(AppModel.self) private var model
    let card: Card

    var body: some View {
        let playlistId = card.playlistId ?? (card.browseId?.hasPrefix("VL") == true ? String(card.browseId!.dropFirst(2)) : nil)
        if let play = card.play {
            Button("재생", systemImage: "play") { model.playEndpoint(play) }
        }
        if let playlistId, card.kind != "artist" {
            Button("셔플 재생", systemImage: "shuffle") { model.playEndpoint(Endpoints.playlist(playlistId, shuffle: true), failure: "셔플 재생하지 못했습니다") }
            Button("다음에 재생", systemImage: "text.line.first.and.arrowtriangle.forward") {
                model.enqueue(playlistId: playlistId, title: card.title, position: "next")
            }
            Button("대기열 끝에 추가", systemImage: "text.line.last.and.arrowtriangle.forward") {
                model.enqueue(playlistId: playlistId, title: card.title, position: "end")
            }
        }
        if let videoId = card.videoId {
            Button("다음에 재생", systemImage: "text.line.first.and.arrowtriangle.forward") {
                model.enqueue(videoId: videoId, title: card.title, position: "next")
            }
            Button("대기열 끝에 추가", systemImage: "text.line.last.and.arrowtriangle.forward") {
                model.enqueue(videoId: videoId, title: card.title, position: "end")
            }
        }
        if let id = card.browseId {
            Divider()
            Button("열기", systemImage: "arrow.up.right") { model.go(routeForBrowse(id, params: card.params, title: card.title)) }
        }
    }
}

// MARK: 묶음(선반)

struct ShelfSection: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    let shelf: Shelf
    var trackLimit: Int?
    /// 곡이 많으면 4줄씩 옆으로 넘기기(홈의 빠른 선곡)
    var pagedTracks = false
    var grid = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !shelf.title.isEmpty || shelf.more != nil {
                HStack(alignment: .firstTextBaseline) {
                    Text(shelf.title)
                        .font(.title3.bold())
                        .foregroundStyle(palette.ink)
                    Spacer()
                    if let more = shelf.more {
                        Button("모두 보기") { model.go(routeForBrowse(more.browseId, params: more.params, title: shelf.title)) }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(palette.mist)
                    }
                }
                .padding(.horizontal, 16)
            }
            if !shelf.tracks.isEmpty {
                if pagedTracks && shelf.tracks.count > 4 {
                    TrackPager(tracks: shelf.tracks)
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(shelf.tracks.prefix(trackLimit ?? .max).enumerated()), id: \.offset) { _, track in
                            TrackRow(track: track)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 5)
                        }
                    }
                }
            }
            if !shelf.cards.isEmpty {
                if grid {
                    CardGrid(cards: shelf.cards)
                } else {
                    ScrollView(.horizontal) {
                        LazyHStack(alignment: .top, spacing: 14) {
                            ForEach(Array(shelf.cards.enumerated()), id: \.offset) { _, card in
                                CardTile(card: card)
                            }
                        }
                        .scrollTargetLayout()
                        .padding(.horizontal, 16)
                    }
                    .scrollIndicators(.hidden)
                    .scrollTargetBehavior(.viewAligned)
                }
            }
        }
    }
}

struct CardGrid: View {
    let cards: [Card]
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 14, alignment: .top)], alignment: .leading, spacing: 20) {
            ForEach(Array(cards.enumerated()), id: \.offset) { _, card in
                CardTile(card: card, width: nil)
            }
        }
        .padding(.horizontal, 16)
    }
}

/// 곡을 4줄씩 묶어 옆으로 넘긴다.
struct TrackPager: View {
    let tracks: [Track]
    var body: some View {
        ScrollView(.horizontal) {
            LazyHGrid(rows: Array(repeating: GridItem(.fixed(58), spacing: 2), count: 4), spacing: 16) {
                ForEach(Array(tracks.enumerated()), id: \.offset) { _, track in
                    TrackRow(track: track, showDuration: false)
                        .containerRelativeFrame(.horizontal) { width, _ in width * 0.86 }
                }
            }
            .scrollTargetLayout()
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .scrollTargetBehavior(.viewAligned)
    }
}

// MARK: 불러오기 상태

enum Loadable<T> {
    case loading
    case loaded(T)
    case failed(String)

    var value: T? {
        if case .loaded(let v) = self { return v }
        return nil
    }
}

struct LoadingView: View {
    var label: LocalizedStringKey = "불러오는 중…"
    var body: some View {
        ProgressView(label)
            .frame(maxWidth: .infinity, minHeight: 240)
    }
}

struct ErrorView: View {
    let message: String
    let retry: () -> Void
    var body: some View {
        ContentUnavailableView {
            Label("불러오지 못했습니다", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("다시 시도", action: retry).buttonStyle(.bordered)
        }
    }
}

/// 맨 아래에 닿으면 다음 쪽을 부른다.
struct LoadMoreRow: View {
    let action: () async -> Void
    var body: some View {
        ProgressView()
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .task { await action() }
    }
}

/// 둥근 큰 버튼(재생·셔플 등)
struct PillButton: View {
    @Environment(\.palette) private var palette
    let title: LocalizedStringKey
    let systemImage: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundStyle(prominent ? palette.onAccent : palette.roseSoft)
                .background {
                    Capsule().fill(prominent ? AnyShapeStyle(palette.accent) : AnyShapeStyle(palette.plum))
                }
        }
        .buttonStyle(.plain)
    }
}
