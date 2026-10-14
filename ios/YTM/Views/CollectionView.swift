// 앨범·플레이리스트·좋아요 표시한 곡 화면(src/views/CollectionView.tsx와 같은 동작).
import SwiftUI

struct CollectionView: View {
    enum Kind { case album, playlist, liked }

    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    let kind: Kind
    let id: String
    @State private var state: Loadable<CollectionPage> = .loading
    @State private var saved: Bool?
    @State private var confirmDelete = false

    var body: some View {
        Group {
            switch state {
            case .loading:
                LoadingView()
            case .failed(let message):
                ErrorView(message: message) { Task { await load() } }
            case .loaded(let data):
                list(data)
            }
        }
        .background(palette.night)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let data = state.value {
                ToolbarItem(placement: .topBarTrailing) { moreMenu(data) }
            }
        }
        .confirmationDialog("플레이리스트 삭제", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("삭제", role: .destructive) {
                guard let pid = state.value.flatMap(playlistId) else { return }
                Task {
                    if await model.deletePlaylist(pid, title: title) {
                        model.paths[model.tab]?.removeLast()
                    }
                }
            }
        } message: {
            Text("\(Korean.object(title)) 삭제합니다. 되돌릴 수 없습니다.")
        }
        .task(id: "\(id)#\(kind == .album ? 0 : model.revision)") { await load() }
    }

    private var title: String {
        kind == .liked ? "좋아요 표시한 곡" : (state.value?.header.title ?? "")
    }

    private func playlistId(_ data: CollectionPage) -> String? {
        data.header.playlistId ?? (kind == .playlist && id.hasPrefix("VL") ? String(id.dropFirst(2)) : nil) ?? (kind == .liked ? "LM" : nil)
    }

    private func list(_ data: CollectionPage) -> some View {
        let h = data.header
        let editable = h.editable && kind == .playlist
        let pid = playlistId(data)
        let context = TrackMenuContext(editablePlaylistId: editable ? pid : nil) { removed in
            if case .loaded(var d) = state {
                d.tracks.removeAll { $0.setVideoId == removed.setVideoId }
                state = .loaded(d)
            }
        }
        return List {
            header(data)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 16, trailing: 16))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            if data.tracks.isEmpty {
                Text(kind == .liked ? "곡 옆 메뉴에서 \"좋아요\"를 누르면 여기에 모입니다." : editable ? "곡 메뉴에서 \"플레이리스트에 추가\"를 고르세요." : "곡이 없습니다.")
                    .foregroundStyle(palette.mist)
                    .listRowBackground(Color.clear)
            }
            ForEach(Array(data.tracks.enumerated()), id: \.offset) { i, track in
                TrackRow(track: track, number: kind == .album ? (track.index ?? i + 1) : nil, context: context)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 8))
                    .listRowBackground(Color.clear)
                    .swipeActions(edge: .leading) {
                        Button {
                            model.enqueue(videoId: track.videoId, title: track.title, position: "next")
                        } label: {
                            Label("다음에 재생", systemImage: "text.line.first.and.arrowtriangle.forward")
                        }
                        .tint(palette.violet)
                    }
                    .swipeActions(edge: .trailing) {
                        if editable, let pid, track.setVideoId != nil {
                            Button(role: .destructive) {
                                Task {
                                    if await model.removeTracks(from: pid, [track]) { context.onRemoved?(track) }
                                }
                            } label: {
                                Label("빼기", systemImage: "minus.circle")
                            }
                        } else {
                            Button {
                                model.enqueue(videoId: track.videoId, title: track.title, position: "end")
                            } label: {
                                Label("대기열 끝에", systemImage: "text.line.last.and.arrowtriangle.forward")
                            }
                            .tint(palette.rose)
                        }
                    }
            }
            if let c = data.continuation {
                LoadMoreRow { await more(c) }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            ForEach(Array(data.shelves.enumerated()), id: \.offset) { _, shelf in
                ShelfSection(shelf: shelf)
                    .listRowInsets(EdgeInsets(top: 20, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable { await load() }
    }

    private func header(_ data: CollectionPage) -> some View {
        let h = data.header
        let pid = playlistId(data)
        let editable = h.editable && kind == .playlist
        let canSave = pid != nil && !editable && kind != .liked
        let isSaved = saved ?? h.saved ?? false
        return VStack(spacing: 10) {
            if kind == .liked {
                Image(systemName: "heart.fill")
                    .font(.system(size: 76))
                    .foregroundStyle(palette.onAccent)
                    .frame(width: 220, height: 220)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(palette.accent))
            } else {
                CoverImage(url: h.thumbnail, size: 220, corner: 12)
                    .shadow(color: .black.opacity(0.35), radius: 20, y: 10)
            }
            Text(title)
                .font(.title2.bold())
                .multilineTextAlignment(.center)
                .padding(.top, 6)
            if !h.artists.isEmpty {
                Button {
                    if let artistId = h.artists.first(where: { $0.id != nil })?.id { model.go(routeForBrowse(artistId)) }
                } label: {
                    Text(h.artists.map(\.name).joined(separator: ", "))
                        .font(.title3)
                        .foregroundStyle(palette.roseSoft)
                }
                .buttonStyle(.plain)
            }
            Text([kind == .liked ? "자동 플레이리스트" : (h.typeLabel.isEmpty ? (kind == .album ? "앨범" : "플레이리스트") : h.typeLabel), h.year, h.stats].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.subheadline)
                .foregroundStyle(palette.mist)
                .multilineTextAlignment(.center)
            if let description = h.description, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(palette.mist)
                    .lineLimit(3)
                    .multilineTextAlignment(.center)
            }
            HStack(spacing: 10) {
                PillButton(title: "재생", systemImage: "play.fill", prominent: true) { playAll(data) }
                PillButton(title: "셔플", systemImage: "shuffle") { shuffle(data) }
            }
            .padding(.top, 6)
            if canSave, let pid {
                Button {
                    Task {
                        if await model.setSaved(pid, title: title, saved: !isSaved) { saved = !isSaved }
                    }
                } label: {
                    Label(isSaved ? "보관함에 있음" : "보관함에 저장", systemImage: isSaved ? "bookmark.fill" : "bookmark")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .tint(isSaved ? palette.roseSoft : palette.mist)
            }
        }
        .foregroundStyle(palette.ink)
        .frame(maxWidth: .infinity)
    }

    private func moreMenu(_ data: CollectionPage) -> some View {
        let h = data.header
        let pid = playlistId(data)
        let editable = h.editable && kind == .playlist
        return Menu {
            if let pid {
                Button("다음에 재생", systemImage: "text.line.first.and.arrowtriangle.forward") { model.enqueue(playlistId: pid, title: title, position: "next") }
                Button("대기열 끝에 추가", systemImage: "text.line.last.and.arrowtriangle.forward") { model.enqueue(playlistId: pid, title: title, position: "end") }
            }
            if let radio = h.radio {
                Button("믹스 시작", systemImage: "dot.radiowaves.left.and.right") { model.playEndpoint(radio, what: "믹스를 시작") }
            }
            if !data.tracks.isEmpty {
                Button("플레이리스트에 모두 추가…", systemImage: "text.badge.plus") { model.sheet = .addToPlaylist(data.tracks.filter(\.available)) }
            }
            if editable, let pid {
                Divider()
                Button("정보 바꾸기…", systemImage: "pencil") { model.sheet = .renamePlaylist(id: pid, title: h.title, description: h.description) }
                Button("플레이리스트 삭제…", systemImage: "trash", role: .destructive) { confirmDelete = true }
            }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("더 보기")
    }

    private func playAll(_ data: CollectionPage) {
        if let play = data.header.play { model.playEndpoint(play) }
        else if let pid = playlistId(data) { model.playEndpoint(Endpoints.playlist(pid)) }
        else if let first = data.tracks.first { model.playTrack(first) }
    }

    private func shuffle(_ data: CollectionPage) {
        if let s = data.header.shuffle { model.playEndpoint(s, what: "셔플 재생") }
        else if let pid = playlistId(data) { model.playEndpoint(Endpoints.playlist(pid, shuffle: true), what: "셔플 재생") }
    }

    private func load() async {
        do {
            let data: CollectionPage
            switch kind {
            case .album: data = try await model.api.album(id)
            case .liked: data = try await model.api.likedSongs()
            case .playlist: data = try await model.api.playlist(id)
            }
            state = .loaded(data)
        } catch {
            if state.value == nil { state = .failed(AppModel.describe(error)) } else { model.toastError(error, "새로 고치지 못했습니다") }
        }
    }

    private func more(_ c: Continuation) async {
        guard case .loaded(var data) = state, data.continuation == c else { return }
        do {
            let page = try await model.api.playlistMore(c)
            data.tracks += page.tracks
            data.continuation = page.continuation
        } catch {
            log("[collection] 더 불러오기 실패: \(error)")
            data.continuation = nil
        }
        state = .loaded(data)
    }
}
