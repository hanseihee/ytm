// 미니 플레이어(탭 위)와 "지금 재생" 시트(표지·가사·대기열을 오간다).
import AVKit
import SwiftUI

// MARK: 미니 플레이어

struct MiniPlayer: View {
    @Environment(AppModel.self) private var model
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement

    var body: some View {
        let p = model.player
        let has = !p.videoId.isEmpty
        HStack(spacing: 10) {
            CoverImage(url: has ? p.artwork : nil, size: 32, corner: 6)
            VStack(alignment: .leading, spacing: 0) {
                Text(has ? (p.ad ? "광고" : p.title) : "재생 중인 곡 없음")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                if has && placement != .inline {
                    Text(p.ad ? "YouTube Music" : p.artist)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            Button {
                model.togglePlay()
            } label: {
                Image(systemName: p.playing ? "pause.fill" : "play.fill")
                    .font(.title3)
                    .frame(width: 36, height: 36)
                    .contentTransition(.symbolEffect(.replace))
            }
            .disabled(!has)
            .accessibilityLabel(p.playing ? "일시정지" : "재생")
            if placement != .inline {
                Button {
                    model.control("next", failure: "다음 곡으로 가지 못했습니다")
                } label: {
                    Image(systemName: "forward.fill")
                        .font(.title3)
                        .frame(width: 36, height: 36)
                }
                .disabled(!has)
                .accessibilityLabel("다음 곡")
            }
        }
        .padding(.leading, 10)
        .padding(.trailing, 6)
        .contentShape(Rectangle())
        .onTapGesture { if has { model.showNowPlaying = true } }
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("지금 재생 화면 열기")
    }
}

// MARK: 지금 재생

struct NowPlayingView: View {
    enum Mode { case artwork, lyrics, queue }

    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    @State private var mode: Mode = .artwork

    var body: some View {
        let p = model.player
        ZStack {
            Backdrop(url: Self.large(p.artwork))
            VStack(spacing: 18) {
                switch mode {
                case .artwork:
                    Spacer(minLength: 8)
                    CoverImage(url: Self.large(p.artwork), corner: 14)
                        .shadow(color: .black.opacity(0.45), radius: 24, y: 14)
                        .scaleEffect(p.playing ? 1 : 0.88)
                        .animation(.spring(duration: 0.45, bounce: 0.25), value: p.playing)
                        .padding(.horizontal, 6)
                    Spacer(minLength: 8)
                    TitleRow(large: true)
                case .lyrics:
                    TitleRow(large: false)
                    LyricsPane()
                case .queue:
                    TitleRow(large: false)
                    QueuePane()
                }
                SeekBar()
                Transport()
                tools
            }
            .padding(.horizontal, 26)
            .padding(.top, 22)
            .padding(.bottom, 10)
        }
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
        .presentationDragIndicator(.visible)
        .animation(.easeInOut(duration: 0.25), value: mode)
        .onAppear {
            mode = model.nowPlayingMode == "lyrics" ? .lyrics : model.nowPlayingMode == "queue" ? .queue : .artwork
            model.nowPlayingMode = "artwork"
        }
    }

    private var tools: some View {
        HStack {
            toolButton(mode == .lyrics ? "quote.bubble.fill" : "quote.bubble", label: "가사", on: mode == .lyrics) {
                mode = mode == .lyrics ? .artwork : .lyrics
            }
            Spacer()
            RoutePicker()
                .frame(width: 44, height: 44)
            Spacer()
            toolButton("list.bullet", label: "대기열", on: mode == .queue) {
                mode = mode == .queue ? .artwork : .queue
            }
        }
        .padding(.horizontal, 18)
    }

    private func toolButton(_ symbol: String, label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.title3)
                .frame(width: 44, height: 44)
                .foregroundStyle(on ? Color.white : Color.white.opacity(0.65))
                .background { if on { Circle().fill(.white.opacity(0.18)) } }
        }
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// YouTube Music 썸네일 주소의 크기 지정(=w120-h120…)을 크게 바꾼다.
    static func large(_ url: String) -> String? {
        guard !url.isEmpty else { return nil }
        guard let range = url.range(of: #"=w\d+-h\d+"#, options: .regularExpression) else { return url }
        return url.replacingCharacters(in: range, with: "=w800-h800")
    }
}

private struct Backdrop: View {
    let url: String?
    var body: some View {
        ZStack {
            Color(hex: 0x120C18)
            AsyncImage(url: url.flatMap { URL(string: $0) }) { phase in
                if case .success(let image) = phase {
                    image.resizable().scaledToFill()
                }
            }
            .blur(radius: 70)
            .scaleEffect(1.5)
            .opacity(0.85)
            LinearGradient(colors: [.black.opacity(0.25), .black.opacity(0.7)], startPoint: .top, endPoint: .bottom)
        }
        .ignoresSafeArea()
    }
}

private struct TitleRow: View {
    @Environment(AppModel.self) private var model
    let large: Bool

    var body: some View {
        let p = model.player
        let liked = model.liked.contains(p.videoId)
        HStack(spacing: 12) {
            if !large {
                CoverImage(url: p.artwork, size: 52, corner: 6)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(p.ad ? "광고" : (p.title.isEmpty ? "재생 중인 곡이 없습니다" : p.title))
                    .font(large ? .title2.bold() : .headline)
                    .lineLimit(1)
                Text(p.ad ? "YouTube Music" : p.artist)
                    .font(large ? .title3 : .subheadline)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            Button {
                model.toggleLike(videoId: p.videoId, title: p.title)
            } label: {
                Image(systemName: liked ? "heart.fill" : "heart")
                    .font(.title3)
                    .frame(width: 40, height: 40)
                    .contentTransition(.symbolEffect(.replace))
            }
            .disabled(p.videoId.isEmpty || p.ad)
            .sensoryFeedback(.impact(weight: .light), trigger: liked)
            .accessibilityLabel(liked ? "좋아요 취소" : "좋아요")
            Menu {
                if !p.videoId.isEmpty && !p.ad {
                    TrackMenu(track: currentTrack(p))
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.title3)
                    .frame(width: 36, height: 40)
            }
            .accessibilityLabel("더 보기")
        }
    }

    private func currentTrack(_ p: PlayerState) -> Track {
        Track(
            videoId: p.videoId, title: p.title, artists: p.artist.isEmpty ? [] : [Ref(name: p.artist)],
            thumbnail: p.artwork, play: .object(["watchEndpoint": .object(["videoId": .string(p.videoId)])]),
            isVideo: false, available: true
        )
    }
}

private struct SeekBar: View {
    @Environment(AppModel.self) private var model
    @State private var dragging: Double?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let p = model.player
            let max = Swift.max(p.duration, 1)
            let value = dragging ?? model.position(at: context.date)
            VStack(spacing: 4) {
                Slider(
                    value: Binding(get: { Swift.min(value, max) }, set: { dragging = $0 }),
                    in: 0...max
                ) { editing in
                    if !editing, let target = dragging {
                        model.seek(target)
                        dragging = nil
                    }
                }
                .disabled(p.videoId.isEmpty || p.ad || p.duration <= 0)
                .tint(.white)
                .accessibilityLabel("재생 위치")
                .accessibilityValue("\(formatTime(value)) / \(formatTime(p.duration))")
                HStack {
                    Text(p.videoId.isEmpty ? "" : formatTime(value))
                    Spacer()
                    Text(p.videoId.isEmpty ? "" : "-" + formatTime(Swift.max(0, p.duration - value)))
                }
                .font(.caption.monospacedDigit())
                .foregroundStyle(.white.opacity(0.6))
            }
        }
    }
}

private struct Transport: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let p = model.player
        let has = !p.videoId.isEmpty
        HStack {
            Button { model.control("shuffle", failure: "섞지 못했습니다") } label: {
                Image(systemName: "shuffle").font(.title3).frame(width: 44, height: 44)
            }
            .accessibilityLabel("대기열 섞기")
            Spacer()
            Button { model.control("previous", failure: "이전 곡으로 가지 못했습니다") } label: {
                Image(systemName: "backward.fill").font(.title).frame(width: 56, height: 56)
            }
            .accessibilityLabel("이전 곡")
            Spacer()
            Button { model.togglePlay() } label: {
                Image(systemName: p.playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 44))
                    .frame(width: 72, height: 72)
                    .contentTransition(.symbolEffect(.replace))
            }
            .sensoryFeedback(.impact(weight: .medium), trigger: p.playing)
            .accessibilityLabel(p.playing ? "일시정지" : "재생")
            Spacer()
            Button { model.control("next", failure: "다음 곡으로 가지 못했습니다") } label: {
                Image(systemName: "forward.fill").font(.title).frame(width: 56, height: 56)
            }
            .accessibilityLabel("다음 곡")
            Spacer()
            Button { model.control("repeat", failure: "반복을 바꾸지 못했습니다") } label: {
                Image(systemName: p.repeat == "ONE" ? "repeat.1" : "repeat")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .foregroundStyle(p.repeat == "NONE" ? Color.white.opacity(0.65) : Color.white)
                    .background { if p.repeat != "NONE" { Circle().fill(.white.opacity(0.18)) } }
            }
            .accessibilityLabel(p.repeat == "ONE" ? "한 곡 반복" : p.repeat == "ALL" ? "전체 반복" : "반복 안 함")
        }
        .disabled(!has)
        .buttonStyle(.plain)
    }
}

/// AirPlay·블루투스 출력 고르기
private struct RoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = UIColor.white.withAlphaComponent(0.65)
        view.activeTintColor = .white
        view.prioritizesVideoDevices = false
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}

// MARK: 가사

private struct LyricsPane: View {
    @Environment(AppModel.self) private var model
    @State private var state: Loadable<Lyrics?> = .loading
    @State private var loadedFor = ""
    @State private var manualUntil = Date.distantPast

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Spacer()
                sizeControl
            }
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            if let lyrics = state.value ?? nil {
                Text("가사 제공: \(lyrics.source)\(lyrics.synced == nil ? " (시간 정보 없음)" : "")")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.45))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task(id: model.player.videoId + (model.player.ad ? ":ad" : "") + (model.player.title.isEmpty ? "" : ":t")) { await load() }
    }

    private var sizeControl: some View {
        HStack(spacing: 2) {
            Button { model.stepLyricScale(-1) } label: {
                Text("가").font(.system(size: 13, weight: .heavy)).frame(width: 32, height: 30)
            }
            .disabled(model.lyricScale <= AppModel.lyricScales.first!)
            .accessibilityLabel("가사 글자 작게")
            Button { model.stepLyricScale(0) } label: {
                Text("\(Int(model.lyricScale * 100))%").font(.caption.weight(.bold).monospacedDigit()).frame(minWidth: 44, minHeight: 30)
            }
            .accessibilityLabel("가사 글자 기본 크기")
            Button { model.stepLyricScale(1) } label: {
                Text("가").font(.system(size: 19, weight: .heavy)).frame(width: 32, height: 30)
            }
            .disabled(model.lyricScale >= AppModel.lyricScales.last!)
            .accessibilityLabel("가사 글자 크게")
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 4)
        .background(Capsule().fill(.white.opacity(0.14)))
    }

    @ViewBuilder
    private var content: some View {
        let p = model.player
        if p.videoId.isEmpty {
            message("곡을 재생하면 가사가 여기에 나옵니다.")
        } else if p.ad {
            message("광고가 끝나면 가사를 보여 드립니다.")
        } else {
            switch state {
            case .loading:
                message("가사를 찾는 중…")
            case .failed:
                message("가사를 불러오지 못했습니다. 인터넷 연결을 확인하세요.")
            case .loaded(nil):
                message("이 곡의 가사를 찾지 못했습니다.")
            case .loaded(let lyrics?):
                if let lines = lyrics.synced, !lines.isEmpty {
                    synced(lines)
                } else {
                    ScrollView {
                        Text(lyrics.plain ?? "")
                            .font(.system(size: 21 * model.lyricScale, weight: .semibold))
                            .lineSpacing(8)
                            .foregroundStyle(.white.opacity(0.9))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                            .padding(.vertical, 12)
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(.title3.weight(.semibold))
            .foregroundStyle(.white.opacity(0.65))
            .padding(.top, 40)
    }

    private func synced(_ lines: [LyricLine]) -> some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            let active = Self.activeLine(lines, model.position(at: context.date))
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Color.clear.frame(height: 120)
                        ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                            Button {
                                manualUntil = .distantPast
                                model.seek(line.time)
                            } label: {
                                Text(line.text.isEmpty ? "♪" : line.text)
                                    .font(.system(size: (line.text.isEmpty ? 22 : 27) * model.lyricScale, weight: .heavy))
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .foregroundStyle(.white.opacity(i == active ? 1 : i < active ? 0.3 : 0.45))
                                    .scaleEffect(i == active ? 1.02 : 1, anchor: .leading)
                                    .animation(.easeOut(duration: 0.3), value: active)
                            }
                            .buttonStyle(.plain)
                            .id(i)
                        }
                        Color.clear.frame(height: 240)
                    }
                }
                .scrollIndicators(.hidden)
                .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.1), .init(color: .black, location: 0.85), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
                .simultaneousGesture(DragGesture().onChanged { _ in manualUntil = Date().addingTimeInterval(4) })
                .onChange(of: active, initial: true) { _, line in
                    guard Date() > manualUntil else { return }
                    withAnimation(.easeInOut(duration: 0.4)) { proxy.scrollTo(max(0, line), anchor: UnitPoint(x: 0, y: 0.32)) }
                }
                .onChange(of: model.lyricScale) {
                    proxy.scrollTo(max(0, active), anchor: UnitPoint(x: 0, y: 0.32))
                }
            }
        }
    }

    /// 지금 위치(초)에 해당하는 줄 번호(src/lib/lyrics.ts activeLine과 같다). 첫 줄 전이면 -1.
    static func activeLine(_ lines: [LyricLine], _ position: Double) -> Int {
        var lo = 0, hi = lines.count - 1, ans = -1
        while lo <= hi {
            let mid = (lo + hi) / 2
            if lines[mid].time <= position + 0.15 {
                ans = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return ans
    }

    private func load() async {
        let p = model.player
        guard !p.videoId.isEmpty, !p.ad, !p.title.isEmpty else { return }
        if loadedFor == p.videoId, case .loaded = state { return }
        loadedFor = p.videoId
        state = .loading
        do {
            let lyrics = try await model.api.lyrics(LyricsQuery(videoId: p.videoId, title: p.title, artist: p.artist, album: p.album.isEmpty ? nil : p.album, duration: p.duration))
            if loadedFor == p.videoId { state = .loaded(lyrics) }
        } catch {
            if loadedFor == p.videoId { state = .failed(AppModel.describe(error)) }
        }
    }
}

// MARK: 대기열

private struct QueuePane: View {
    @Environment(AppModel.self) private var model
    @State private var data: QueueData?
    @State private var failed = false

    var body: some View {
        let items = data?.items ?? []
        let current = items.firstIndex { $0?.selected == true }
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 4) {
                if failed && data == nil {
                    note("대기열을 읽지 못했습니다.")
                } else if data == nil {
                    note("불러오는 중…")
                } else if items.isEmpty {
                    note("곡을 재생하면 다음에 나올 곡이 여기에 쌓입니다.")
                } else {
                    let upcoming = items.enumerated().filter { $0.offset > (current ?? -1) }
                    if !upcoming.isEmpty { section("다음 곡") }
                    ForEach(upcoming, id: \.offset) { index, item in
                        if let item {
                            row(item.track) {
                                Task {
                                    do {
                                        try await model.api.queueJump(index)
                                        try? await Task.sleep(for: .milliseconds(600))
                                        await refresh()
                                    } catch {
                                        model.toastError(error, "그 곡으로 가지 못했습니다")
                                    }
                                }
                            }
                        }
                    }
                    if let automix = data?.automix, !automix.isEmpty {
                        section("이어서 자동 재생")
                        ForEach(Array(automix.enumerated()), id: \.offset) { _, track in
                            row(track) { model.playTrack(track) }
                        }
                    }
                }
            }
        }
        .scrollIndicators(.hidden)
        .task(id: model.player.videoId) {
            await refresh()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(8))
                await refresh()
            }
        }
    }

    private func refresh() async {
        do {
            data = try await model.api.queue()
            failed = false
        } catch {
            failed = true
        }
    }

    private func note(_ text: String) -> some View {
        Text(text).foregroundStyle(.white.opacity(0.6)).padding(.top, 30)
    }

    private func section(_ title: String) -> some View {
        Text(title)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.white.opacity(0.6))
            .padding(.top, 12)
            .padding(.bottom, 2)
    }

    private func row(_ track: Track, action: @escaping () -> Void) -> some View {
        HStack(spacing: 12) {
            CoverImage(url: track.thumbnail, size: 44, corner: 5)
            VStack(alignment: .leading, spacing: 1) {
                Text(track.title).font(.body.weight(.semibold)).lineLimit(1)
                Text(track.artistLine).font(.subheadline).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
            }
            Spacer()
            if let d = track.duration {
                Text(formatTime(d)).font(.caption.monospacedDigit()).foregroundStyle(.white.opacity(0.5))
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
        .contextMenu { TrackMenu(track: track) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
