// 차트(멜론·지니·벅스·FLO·VIBE·써클차트·Spotify 나라별 Top 50·빌보드·Apple Music) → YouTube Music으로 듣기
// (src/views/SpotifyView.tsx와 같은 동작).
import SwiftUI

struct ChartView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    let id: String
    /// 차트 탭 첫 화면이면 차트를 고를 수 있다.
    let isRoot: Bool

    @State private var charts: [ChartInfo] = []
    @State private var groups: [String] = []
    @State private var state: Loadable<ChartPlaylist> = .loading
    @State private var titleText = ""
    @State private var kindText = ""
    @State private var today = ""
    @State private var matches: [ChartMatch?] = []
    @State private var busy = ""
    @State private var savedId: String?
    @State private var synced = false
    @State private var link = ""

    private var chart: ChartInfo? { charts.first { $0.id == id } }
    /// Spotify 플레이리스트(곡 길이가 있고, 오늘 날짜 기준)인지
    private var isSpotify: Bool { chart.map { $0.source == "spotify" } ?? true }
    private var found: [Track] { matches.compactMap { $0?.track } }
    private var done: Int { matches.filter { $0 != nil }.count }
    private var finished: Bool { !matches.isEmpty && done == matches.count }

    var body: some View {
        List {
            Section {
                if isRoot { picker }
                switch state {
                case .loading:
                    LoadingView(label: "\(isSpotify ? "Spotify" : chart?.group ?? L("차트"))에서 곡 목록을 가져오는 중…")
                case .failed(let message):
                    ErrorView(message: message) { Task { await load() } }
                case .loaded(let p):
                    hero(p)
                }
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)

            if case .loaded(let p) = state {
                Section {
                    ForEach(Array(p.tracks.enumerated()), id: \.element.id) { i, t in
                        row(i, t)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                    }
                }
                Section {
                    linkForm
                }
                .listRowBackground(palette.dusk)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(palette.night)
        .navigationTitle(isRoot ? L("차트") : titleText)
        .navigationBarTitleDisplayMode(isRoot ? .large : .inline)
        .refreshable { await load() }
        .task(id: id) { await load() }
    }

    // MARK: 차트 고르기(닫혀 있을 때는 지금 고른 차트만 보인다)

    private var picker: some View {
        Menu {
            // 출처별 묶음(멜론 · Spotify Top 50 · 국내 음원 · 해외 …)
            ForEach(groups, id: \.self) { group in
                let items = charts.filter { $0.group == group }
                if items.count <= 8 {
                    Section(group) { options(items) }
                } else {
                    Menu(group) { options(items) }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "chart.bar.fill").foregroundStyle(palette.roseSoft)
                Text(chart.map { $0.source == "spotify" ? "Spotify \($0.label) Top 50" : $0.label } ?? L("차트"))
                    .font(.headline)
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
                // 번역이 길면 차트 이름이 줄어들고, 이 말은 한 줄로 남는다(두 줄로 쪼개지지 않게).
                Text("차트 바꾸기").font(.subheadline).foregroundStyle(palette.mist).lineLimit(1).fixedSize()
                Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(palette.mist)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Capsule().fill(palette.plum))
        }
        .padding(.bottom, 4)
    }

    private func options(_ items: [ChartInfo]) -> some View {
        Picker("차트", selection: Binding(get: { id }, set: { model.chartId = $0 })) {
            ForEach(items) { c in Text(c.label).tag(c.id) }
        }
        .pickerStyle(.inline)
    }

    // MARK: 머리

    private func hero(_ p: ChartPlaylist) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 14) {
                CoverImage(url: p.cover, size: 112, corner: 10)
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(kindText) · YouTube Music으로 듣기")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(palette.mist)
                    Text(titleText)
                        .font(.title2.bold())
                        .foregroundStyle(palette.ink)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .fixedSize(horizontal: false, vertical: true)
                    Text([p.subtitle.isEmpty ? (isSpotify ? "Spotify" : chart?.group ?? "") : p.subtitle, L("\(p.tracks.count)곡"), isSpotify ? L("\(today) 기준") : nil].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(palette.mist)
                }
            }
            Group {
                if !finished {
                    Text("YouTube Music에서 같은 곡을 찾는 중… \(done)/\(matches.count)")
                } else if matches.count > found.count {
                    Text("YouTube Music에서 \(found.count)곡을 찾았습니다, \(matches.count - found.count)곡은 찾지 못했습니다.")
                } else {
                    Text("YouTube Music에서 \(found.count)곡을 찾았습니다.")
                }
            }
                .font(.subheadline)
                .foregroundStyle(palette.mist)
            if !finished {
                ProgressView(value: Double(done), total: Double(max(1, matches.count)))
                    .tint(palette.rose)
            }
            HStack(spacing: 10) {
                PillButton(title: busy == "play" ? "대기열 만드는 중…" : "1위부터 재생", systemImage: "play.fill", prominent: true) {
                    Task { await playFrom(0) }
                }
                .disabled(found.isEmpty || !busy.isEmpty)
                Button {
                    Task { await save(p) }
                } label: {
                    Image(systemName: synced ? "bookmark.fill" : "bookmark")
                        .font(.title3)
                        .frame(width: 48, height: 48)
                        .background(Circle().fill(palette.plum))
                }
                .buttonStyle(.plain)
                .foregroundStyle(palette.roseSoft)
                .disabled(!finished || found.isEmpty || !busy.isEmpty)
                .accessibilityLabel(savedId == nil ? "내 YouTube Music에 저장" : synced ? "내 재생목록과 같음" : "내 재생목록 업데이트")
                Button {
                    Task { await rematch(p) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.title3)
                        .frame(width: 48, height: 48)
                        .background(Circle().fill(palette.plum))
                }
                .buttonStyle(.plain)
                .foregroundStyle(palette.ink)
                .disabled(!finished)
                .accessibilityLabel("YouTube Music에서 다시 찾기")
            }
            if busy == "save" {
                Text("내 YouTube Music에 저장하는 중…").font(.caption).foregroundStyle(palette.mist)
            } else if savedId != nil {
                Text(synced ? "내 YouTube Music 재생목록과 같습니다." : "저장한 재생목록과 달라졌습니다. 책갈피를 누르면 맞춥니다.")
                    .font(.caption)
                    .foregroundStyle(palette.mist)
            }
        }
        .padding(.vertical, 6)
    }

    // MARK: 줄

    private func row(_ i: Int, _ t: ChartTrack) -> some View {
        let match = i < matches.count ? matches[i] : nil
        let track = match?.track
        let current = track != nil && model.player.videoId == track!.videoId
        return HStack(spacing: 10) {
            Text("\(i + 1)")
                .font(.headline.monospacedDigit())
                .foregroundStyle(palette.ink)
                .frame(width: 30, alignment: .trailing)
            CoverImage(url: track?.thumbnail, size: 46, corner: 5)
            VStack(alignment: .leading, spacing: 2) {
                Text(t.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(current ? palette.roseSoft : palette.ink)
                    .lineLimit(1)
                Text(t.artists).font(.subheadline).foregroundStyle(palette.mist).lineLimit(1)
                status(match, t)
            }
            Spacer(minLength: 4)
            if t.durationMs > 0 {
                Text(formatTime(t.durationMs / 1000)).font(.caption.monospacedDigit()).foregroundStyle(palette.faint)
            }
            if let track {
                Menu { TrackMenu(track: track) } label: {
                    Image(systemName: "ellipsis").foregroundStyle(palette.mist).frame(width: 30, height: 44).contentShape(Rectangle())
                }
            }
        }
        .contentShape(Rectangle())
        .opacity(match != nil && track == nil ? 0.5 : 1)
        .onTapGesture { if track != nil { Task { await playFrom(i) } } }
        .contextMenu { if let track { TrackMenu(track: track) } }
    }

    @ViewBuilder
    private func status(_ match: ChartMatch?, _ t: ChartTrack) -> some View {
        if match == nil {
            Text("찾는 중").font(.caption).foregroundStyle(palette.faint)
        } else if let track = match?.track {
            if match?.quality == "unsure" {
                Text("비슷한 곡: \(track.title)").font(.caption).foregroundStyle(.orange).lineLimit(1)
            } else if track.isVideo {
                Text("뮤직비디오 음원").font(.caption).foregroundStyle(palette.mist)
            }
        } else {
            HStack(spacing: 6) {
                Text("YouTube Music에서 못 찾음").foregroundStyle(.red)
                Button("직접 검색") { model.search("\(t.title) \(t.artists.split(separator: ",").first.map(String.init) ?? "")") }
                    .buttonStyle(.borderless)
                    .fontWeight(.semibold)
            }
            .font(.caption)
        }
    }

    private var linkForm: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("다른 Spotify 플레이리스트도 들을 수 있습니다").font(.headline)
            HStack {
                TextField("https://open.spotify.com/playlist/…", text: $link)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .submitLabel(.go)
                    .onSubmit { Task { await openLink() } }
                Button("열기") { Task { await openLink() } }
                    .buttonStyle(.bordered)
            }
            Text("공개 플레이리스트만 됩니다. 곡 목록은 Spotify 공개 임베드 페이지에서 읽습니다.")
                .font(.caption)
                .foregroundStyle(palette.mist)
        }
        .padding(.vertical, 6)
    }

    // MARK: 동작

    private func load() async {
        if charts.isEmpty {
            charts = (try? await model.api.charts()) ?? []
            groups = (try? await model.api.chartGroups()) ?? []
        }
        state = .loading
        matches = []
        do {
            let p = try await model.api.chartPlaylist(id)
            titleText = (try? await model.api.chartTitle(id: p.id, name: p.name)) ?? p.name
            kindText = (try? await model.api.chartKind(p.id)) ?? ""
            today = (try? await model.api.todayLabel()) ?? ""
            state = .loaded(p)
            await refreshSaved(p)
            await matchAll(p, useCache: true)
            await refreshSaved(p)
        } catch {
            state = .failed(await model.api.describeChartError((error as? BridgeError)?.message ?? "\(error)"))
        }
    }

    /// 여러 곡을 동시에 4개씩 찾는다(spotify.ts matchAll과 같다).
    private func matchAll(_ p: ChartPlaylist, useCache: Bool) async {
        matches = Array(repeating: nil, count: p.tracks.count)
        let api = model.api
        await withTaskGroup(of: (Int, ChartMatch).self) { group in
            var next = 0
            func add() {
                guard next < p.tracks.count else { return }
                let i = next
                next += 1
                let track = p.tracks[i]
                group.addTask {
                    let match = (try? await api.matchTrack(track, useCache: useCache)) ?? ChartMatch(track: nil, quality: "none")
                    return (i, match)
                }
            }
            for _ in 0..<4 { add() }
            for await (i, match) in group {
                guard !Task.isCancelled else { break }
                if i < matches.count { matches[i] = match }
                add()
            }
        }
    }

    private func refreshSaved(_ p: ChartPlaylist) async {
        savedId = try? await model.api.savedPlaylistId(p.id)
        synced = savedId != nil && finished ? ((try? await model.api.isSynced(p.id, found)) ?? false) : false
    }

    /// i번째 곡부터 차트 순서대로 재생
    private func playFrom(_ index: Int) async {
        guard case .loaded(let p) = state else { return }
        let ordered = matches.dropFirst(index).compactMap { $0?.track }.filter(\.available)
        guard !ordered.isEmpty else { return }
        busy = "play"
        defer { busy = "" }
        do {
            let queued = try await model.api.playInChartOrder(p.id, ordered: ordered, found: found)
            if queued > 1 { model.toast("차트 \(queued)곡을 차례로 재생합니다") }
        } catch {
            model.toastError(error, "대기열을 만들지 못했습니다")
        }
    }

    private func save(_ p: ChartPlaylist) async {
        guard finished, !found.isEmpty else { return }
        busy = "save"
        defer { busy = "" }
        do {
            let pid = try await model.api.syncToYouTubeMusic(p, found)
            model.toast("내 YouTube Music에 '\(titleText)' 재생목록을 맞췄습니다")
            await model.loadPlaylists()
            await refreshSaved(p)
            model.go(.playlist("VL\(pid)"))
        } catch {
            model.toastError(error, "재생목록으로 저장하지 못했습니다")
        }
    }

    private func rematch(_ p: ChartPlaylist) async {
        await matchAll(p, useCache: false)
        await refreshSaved(p)
    }

    private func openLink() async {
        guard let pid = try? await model.api.playlistIdFrom(link) else {
            model.toast("Spotify 플레이리스트 링크를 붙여 넣으세요 (open.spotify.com/playlist/…)", error: true)
            return
        }
        link = ""
        model.go(.chart(pid))
    }
}
