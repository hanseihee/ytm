// 미니 플레이어(탭 위)와 "지금 재생" 전체 화면.
//
// 참고한 플레이어(2026-10-14):
// - Apple 뮤직: 미니 플레이어에서 확대되며 열리고 아래로 끌어 닫는다. 진행 막대는 손잡이 없이 얇게, 시간은 그 아래 작게.
// - Spotify: 표지에서 뽑은 색으로 배경 그라데이션, 흰 원 재생 버튼, 위에 "지금 재생 / 앨범명", 제목 오른쪽 하트.
// - 멜론: 표지 아래에 지금 부르는 가사 두 줄, 누르면 전체 가사.
// - YouTube Music 앱: 위에 [노래 | 영상] 전환, 아래 탭 "다음 트랙 · 관련 항목 · 댓글", 수면 타이머.
import AVKit
import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import Translation

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
                Text(has ? (p.ad ? L("광고") : p.title) : L("재생 중인 곡 없음"))
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
    @State private var mode: Mode = .artwork
    @State private var lyrics = LyricsLoader()
    @State private var colors = ArtworkColors()
    @State private var shareCard: ShareCard?
    @State private var stage = VideoStage()
    /// 표지(노래↔영상을 바꾸는 동안에는 노래 표지를 그대로 둔다 — 중간에 뮤직비디오 썸네일이 비치지 않게)
    @State private var cover = ""
    @State private var coverTitle = ""

    var body: some View {
        let p = model.player
        GeometryReader { geo in
            VStack(spacing: 0) {
                header
                switch mode {
                case .artwork:
                    if p.avAvailable && !p.ad {
                        AVToggle(pip: stage.visible)
                            .padding(.top, 6)
                    }
                    Spacer(minLength: 10)
                    MediaStage(stage: stage, cover: Self.large(cover), side: artworkSize(geo.size), width: geo.size.width)
                        .padding(.horizontal, -24)
                    Spacer(minLength: 14)
                    TrackInfo()
                    LyricPreview(loader: lyrics) { mode = .lyrics }
                        .padding(.top, 14)
                case .lyrics:
                    CompactTrack()
                        .padding(.top, 8)
                    LyricsPane(loader: lyrics)
                        .padding(.top, 6)
                case .queue:
                    CompactTrack()
                        .padding(.top, 8)
                    UpNextPane()
                        .padding(.top, 10)
                }
                ProgressBar()
                    .padding(.top, 18)
                Controls()
                    .padding(.top, 10)
                bottomBar
                    .padding(.top, 14)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 6)
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .background { colors.gradient.ignoresSafeArea() }
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
        .animation(.easeInOut(duration: 0.25), value: mode)
        .animation(.easeInOut(duration: stage.visible ? 1.4 : 0.8), value: colors.key)
        .onChange(of: p, initial: true) { _, now in
            updateCover(now)
            stage.sync(now)
            // 노래로 바뀌면(다음 곡에 영상이 없거나 사용자가 바꿈) 전체 화면을 끝낸다.
            if !now.avVideo && model.videoFullscreen { model.setVideoFullscreen(false) }
        }
        .onChange(of: model.ambient) { _, ambient in
            if stage.visible, let ambient { colors.apply(ambient) }
        }
        .onChange(of: stage.visible) { _, visible in
            // 영상이 사라지면 표지 색으로 돌아간다(이미 계산해 둔 값이라 바로 바뀐다).
            if !visible { Task { await colors.load(Self.large(cover)) } }
            else if let ambient = model.ambient { colors.apply(ambient) }
        }
        .task(id: cover) {
            if !stage.visible { await colors.load(Self.large(cover)) }
            shareCard = await ShareCard.make(p, cover: cover, colors: colors)
        }
        .task(id: p.videoId + (p.ad ? ":ad" : "") + (p.title.isEmpty ? "" : ":t")) { await lyrics.load(model) }
        .onAppear {
            mode = model.nowPlayingMode == "lyrics" ? .lyrics : model.nowPlayingMode == "queue" ? .queue : .artwork
            model.nowPlayingMode = "artwork"
            UIDevice.current.beginGeneratingDeviceOrientationNotifications()
        }
        .onDisappear { UIDevice.current.endGeneratingDeviceOrientationNotifications() }
        .onReceive(NotificationCenter.default.publisher(for: UIDevice.orientationDidChangeNotification)) { _ in
            // 영상이 보일 때 폰을 가로로 눕히면 전체 화면(YouTube 앱처럼)
            if stage.visible && mode == .artwork && UIDevice.current.orientation.isLandscape { model.setVideoFullscreen(true) }
        }
        .fullScreenCover(isPresented: Binding(get: { model.videoFullscreen }, set: { model.setVideoFullscreen($0) })) {
            VideoFullscreenView()
        }
    }

    /// 노래↔영상 전환(같은 곡)에서는 표지를 바꾸지 않는다. 곡이 바뀌면 새 표지.
    private func updateCover(_ p: PlayerState) {
        if p.avVideo && !cover.isEmpty && p.title == coverTitle { return }
        if cover != p.artwork { cover = p.artwork }
        coverTitle = p.title
    }

    /// 표지는 양옆 24pt를 남긴 정사각형, 키가 작은 화면에서는 높이의 44%까지
    private func artworkSize(_ size: CGSize) -> CGFloat {
        max(160, min(size.width - 48, size.height * 0.44))
    }

    private var header: some View {
        let p = model.player
        return HStack(spacing: 8) {
            Button { model.showNowPlaying = false } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 20, weight: .semibold))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("지금 재생 닫기")
            Spacer(minLength: 0)
            VStack(spacing: 1) {
                Text("지금 재생")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.65))
                if !p.album.isEmpty && !p.ad {
                    Text(p.album)
                        .font(.footnote.weight(.semibold))
                        .lineLimit(1)
                }
                if model.sleep != .off {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        Label(model.sleepLabel(at: context.date), systemImage: "moon.zzz.fill")
                            .font(.caption2.weight(.bold).monospacedDigit())
                            .foregroundStyle(.white.opacity(0.8))
                    }
                    .accessibilityLabel("수면 타이머 \(model.sleepLabel())")
                }
            }
            Spacer(minLength: 0)
            Menu {
                if !p.videoId.isEmpty && !p.ad {
                    Section {
                        ShareLink(item: Self.shareURL(p.videoId), subject: Text(p.title), message: Text("\(p.title) - \(p.artist)")) {
                            Label("링크 공유", systemImage: "square.and.arrow.up")
                        }
                        if let card = shareCard {
                            ShareLink(item: card.image, preview: SharePreview(p.title, image: card.image)) {
                                Label("이미지 카드로 공유", systemImage: "photo")
                            }
                        }
                    }
                }
                SleepMenu()
                if !p.videoId.isEmpty && !p.ad {
                    TrackMenu(track: Self.currentTrack(p))
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 20, weight: .semibold))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("더 보기")
        }
        .padding(.horizontal, -10)
        .padding(.top, 4)
    }

    private var bottomBar: some View {
        HStack {
            barButton("가사", symbol: mode == .lyrics ? "quote.bubble.fill" : "quote.bubble", on: mode == .lyrics) {
                mode = mode == .lyrics ? .artwork : .lyrics
            }
            Spacer()
            RoutePicker()
                .frame(width: 40, height: 40)
                .accessibilityLabel("출력 기기 고르기")
            Spacer()
            barButton("대기열", symbol: "list.bullet", on: mode == .queue) {
                mode = mode == .queue ? .artwork : .queue
            }
        }
    }

    private func barButton(_ label: LocalizedStringKey, symbol: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 17, weight: .semibold))
                Text(label).font(.subheadline.weight(.semibold))
            }
            .padding(.horizontal, 14)
            .frame(height: 38)
            .foregroundStyle(on ? Color.black : Color.white.opacity(0.85))
            .background(Capsule().fill(on ? Color.white : Color.white.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    static func shareURL(_ videoId: String) -> URL {
        URL(string: "https://music.youtube.com/watch?v=\(videoId)")!
    }

    static func currentTrack(_ p: PlayerState) -> Track {
        Track(
            videoId: p.videoId, title: p.title, artists: p.artist.isEmpty ? [] : [Ref(name: p.artist)],
            thumbnail: p.artwork, play: .object(["watchEndpoint": .object(["videoId": .string(p.videoId)])]),
            isVideo: false, available: true
        )
    }

    /// YouTube Music 썸네일 주소의 크기 지정(=w120-h120…)을 크게 바꾼다.
    static func large(_ url: String) -> String? {
        guard !url.isEmpty else { return nil }
        guard let range = url.range(of: #"=w\d+-h\d+"#, options: .regularExpression) else { return url }
        return url.replacingCharacters(in: range, with: "=w800-h800")
    }
}

/// 제목·가수(크게) + 하트
private struct TrackInfo: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let p = model.player
        let liked = model.liked.contains(p.videoId)
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(p.ad ? L("광고") : (p.title.isEmpty ? L("재생 중인 곡이 없습니다") : p.title))
                    .font(.title2.weight(.bold))
                    .lineLimit(1)
                Text(p.ad ? "YouTube Music" : p.artist)
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                model.toggleLike(videoId: p.videoId, title: p.title)
            } label: {
                Image(systemName: liked ? "heart.fill" : "heart")
                    .font(.system(size: 24, weight: .medium))
                    .frame(width: 44, height: 44)
                    .contentTransition(.symbolEffect(.replace))
            }
            .disabled(p.videoId.isEmpty || p.ad)
            .sensoryFeedback(.impact(weight: .light), trigger: liked)
            .accessibilityLabel(liked ? "좋아요 취소" : "좋아요")
        }
    }
}

/// 가사·대기열을 볼 때 위에 작게 보이는 곡 정보
private struct CompactTrack: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let p = model.player
        HStack(spacing: 12) {
            CoverImage(url: p.artwork, size: 48, corner: 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(p.ad ? L("광고") : p.title).font(.headline).lineLimit(1)
                Text(p.ad ? "YouTube Music" : p.artist).font(.subheadline).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            let liked = model.liked.contains(p.videoId)
            Button {
                model.toggleLike(videoId: p.videoId, title: p.title)
            } label: {
                Image(systemName: liked ? "heart.fill" : "heart").font(.title3).frame(width: 40, height: 40)
            }
            .disabled(p.videoId.isEmpty || p.ad)
            .accessibilityLabel(liked ? "좋아요 취소" : "좋아요")
        }
    }
}

// MARK: 진행 막대(손잡이 없이 얇게, 누르고 끄는 동안 두꺼워진다)

private struct ProgressBar: View {
    @Environment(AppModel.self) private var model
    @State private var drag: Double?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let p = model.player
            let duration = max(p.duration, 1)
            let position = drag.map { $0 * duration } ?? min(model.position(at: context.date), duration)
            let enabled = !p.videoId.isEmpty && !p.ad && p.duration > 0
            VStack(spacing: 6) {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.22))
                        Capsule().fill(.white).frame(width: g.size.width * min(1, max(0, position / duration)))
                    }
                    .frame(height: drag == nil ? 5 : 10)
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { v in
                                guard enabled else { return }
                                drag = min(1, max(0, v.location.x / max(1, g.size.width)))
                            }
                            .onEnded { _ in
                                if let d = drag { model.seek(d * duration) }
                                drag = nil
                            }
                    )
                    .animation(.easeOut(duration: 0.15), value: drag == nil)
                }
                .frame(height: 22)
                HStack {
                    Text(p.videoId.isEmpty ? " " : formatTime(position))
                    Spacer()
                    Text(p.videoId.isEmpty ? " " : "-" + formatTime(max(0, p.duration - position)))
                }
                .font(.caption.monospacedDigit().weight(.medium))
                .foregroundStyle(.white.opacity(drag == nil ? 0.6 : 0.9))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("재생 위치")
            .accessibilityValue("\(formatTime(position)) / \(formatTime(p.duration))")
            .accessibilityAdjustableAction { dir in
                model.seek(max(0, model.position() + (dir == .increment ? 10 : -10)))
            }
        }
    }
}

// MARK: 재생 버튼 줄

private struct Controls: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let p = model.player
        let has = !p.videoId.isEmpty
        HStack {
            Button { model.control("shuffle", failure: "섞지 못했습니다") } label: {
                Image(systemName: "shuffle").font(.system(size: 19, weight: .semibold)).frame(width: 44, height: 44)
            }
            .foregroundStyle(.white.opacity(0.75))
            .accessibilityLabel("대기열 섞기")
            Spacer()
            Button { model.control("previous", failure: "이전 곡으로 가지 못했습니다") } label: {
                Image(systemName: "backward.fill").font(.system(size: 30)).frame(width: 56, height: 56)
            }
            .accessibilityLabel("이전 곡")
            Spacer()
            Button { model.togglePlay() } label: {
                Image(systemName: p.playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.black)
                    .offset(x: p.playing ? 0 : 2)
                    .frame(width: 72, height: 72)
                    .background(Circle().fill(.white))
                    .contentTransition(.symbolEffect(.replace))
            }
            .sensoryFeedback(.impact(weight: .medium), trigger: p.playing)
            .accessibilityLabel(p.playing ? "일시정지" : "재생")
            Spacer()
            Button { model.control("next", failure: "다음 곡으로 가지 못했습니다") } label: {
                Image(systemName: "forward.fill").font(.system(size: 30)).frame(width: 56, height: 56)
            }
            .accessibilityLabel("다음 곡")
            Spacer()
            Button { model.control("repeat", failure: "반복을 바꾸지 못했습니다") } label: {
                Image(systemName: p.repeat == "ONE" ? "repeat.1" : "repeat")
                    .font(.system(size: 19, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .overlay(alignment: .bottom) {
                        if p.repeat != "NONE" { Circle().fill(.white).frame(width: 4, height: 4).offset(y: -2) }
                    }
            }
            .foregroundStyle(p.repeat == "NONE" ? Color.white.opacity(0.75) : Color.white)
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
        view.tintColor = UIColor.white.withAlphaComponent(0.85)
        view.activeTintColor = .white
        view.prioritizesVideoDevices = false
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}

// MARK: 배경색(표지에서 뽑은 두 색)

@MainActor
@Observable
final class ArtworkColors {
    private static let fallback = (Color(hex: 0x3A2850), Color(hex: 0x120C18))
    private static let cache = NSCache<NSString, UIColorPair>()
    /// CIContext는 여러 스레드에서 같이 써도 된다(표지 색 뽑기는 뒤 작업에서 한다).
    nonisolated private static let context = CIContext(options: [.workingColorSpace: NSNull()])

    var top = fallback.0
    var bottom = fallback.1
    /// 색이 바뀔 때 애니메이션 기준
    var key = ""

    var gradient: some View {
        LinearGradient(colors: [top, bottom], startPoint: .top, endPoint: .bottom)
            .overlay(Color.black.opacity(0.12))
    }

    func load(_ url: String?) async {
        guard let url, let target = URL(string: url) else {
            (top, bottom, key) = (Self.fallback.0, Self.fallback.1, "")
            return
        }
        if let hit = Self.cache.object(forKey: url as NSString) {
            apply(hit, key: url)
            return
        }
        guard let (data, _) = try? await URLSession.shared.data(from: target), let image = CIImage(data: data) else { return }
        let letterboxed = CoverImage.isLetterboxed(url)
        let pair = await Task.detached(priority: .utility) { Self.extract(image, letterboxed: letterboxed) }.value
        guard let pair else { return }
        Self.cache.setObject(pair, forKey: url as NSString)
        apply(pair, key: url)
    }

    /// 영상 모드: 엔진이 알려 준 영상 위·아래 평균색(0~255)
    func apply(_ ambient: AmbientColors) {
        let ui = { (c: [Int]) in UIColor(red: CGFloat(c[safe: 0] ?? 0) / 255, green: CGFloat(c[safe: 1] ?? 0) / 255, blue: CGFloat(c[safe: 2] ?? 0) / 255, alpha: 1) }
        apply(UIColorPair(top: Self.shade(ui(ambient.top), brightness: 0.62), bottom: Self.shade(ui(ambient.bottom), brightness: 0.26)), key: "ambient:\(ambient.top)\(ambient.bottom)")
    }

    private func apply(_ pair: UIColorPair, key: String) {
        top = Color(uiColor: pair.top)
        bottom = Color(uiColor: pair.bottom)
        self.key = key
    }

    /// 표지 위쪽 절반·아래쪽 절반의 평균색을 흰 글자가 잘 보이게 어둡게 만든다.
    nonisolated private static func extract(_ image: CIImage, letterboxed: Bool) -> UIColorPair? {
        // 검은 띠가 있는 썸네일은 가운데 영상 부분만 본다.
        let full = image.extent
        let e = letterboxed ? full.insetBy(dx: 0, dy: full.height / 8) : full
        func average(_ rect: CGRect) -> UIColor? {
            let f = CIFilter.areaAverage()
            f.inputImage = image
            f.extent = rect
            guard let out = f.outputImage else { return nil }
            var px = [UInt8](repeating: 0, count: 4)
            context.render(out, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
            return UIColor(red: CGFloat(px[0]) / 255, green: CGFloat(px[1]) / 255, blue: CGFloat(px[2]) / 255, alpha: 1)
        }
        // CIImage 좌표는 아래가 0이다.
        guard let upper = average(CGRect(x: e.minX, y: e.midY, width: e.width, height: e.height / 2)),
              let lower = average(CGRect(x: e.minX, y: e.minY, width: e.width, height: e.height / 2)) else { return nil }
        return UIColorPair(top: shade(upper, brightness: 0.62), bottom: shade(lower, brightness: 0.26))
    }

    nonisolated private static func shade(_ color: UIColor, brightness: CGFloat) -> UIColor {
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        // 너무 탁하면 조금 맑게, 너무 밝으면 어둡게
        return UIColor(hue: h, saturation: min(0.75, max(s, 0.18) * 1.1), brightness: min(b, brightness) * 0.6 + brightness * 0.4, alpha: 1)
    }
}

final class UIColorPair: NSObject {
    let top: UIColor
    let bottom: UIColor
    init(top: UIColor, bottom: UIColor) {
        self.top = top
        self.bottom = bottom
    }
}

// MARK: 가사

/// 지금 곡의 가사(표지 아래 미리보기와 전체 가사 화면이 함께 쓴다)
@MainActor
@Observable
final class LyricsLoader {
    static let offsetStep = 0.5
    static let offsetMax = 10.0

    var state: Loadable<Lyrics?> = .loading
    /// 이 곡 가사 싱크(초). 지금 줄은 재생 위치 + 이 값으로 고른다.
    var offset = 0.0
    private(set) var videoId = ""

    func nudge(_ model: AppModel, _ delta: Double) {
        let id = videoId
        let target = delta == 0 ? 0 : offset + delta
        offset = min(Self.offsetMax, max(-Self.offsetMax, target))
        Task { offset = await model.api.setLyricsOffset(id, target) }
    }

    /// 가사 전체(번역에 넘긴다)
    var fullText: String {
        guard case .loaded(let lyrics?) = state else { return "" }
        if let lines = lyrics.synced, !lines.isEmpty { return lines.map(\.text).filter { !$0.isEmpty }.joined(separator: "\n") }
        return lyrics.plain ?? ""
    }

    /// 가사 시간으로 본 지금 위치: 싱크 보정 + (노래↔영상 짝 버전의 가사를 쓰는 중이면) 두 버전의 시간 차이
    func time(_ model: AppModel, at date: Date = Date()) -> Double {
        let p = model.player
        let shift = p.videoId != videoId && p.avOther == videoId ? p.avShift : 0
        return model.position(at: date) + shift + offset
    }

    /// 가사 줄 시간 → 지금 곡에서 이동할 위치
    func seekTime(_ model: AppModel, _ lineTime: Double) -> Double {
        let p = model.player
        let shift = p.videoId != videoId && p.avOther == videoId ? p.avShift : 0
        return max(0, lineTime - shift - offset)
    }

    func load(_ model: AppModel) async {
        let p = model.player
        guard !p.videoId.isEmpty, !p.ad, !p.title.isEmpty else { return }
        if videoId == p.videoId, case .loaded = state { return }
        // 노래↔영상만 바꿨으면 짝 버전 가사를 그대로 쓰고 시간만 옮긴다(다시 찾느라 깜빡이지 않게).
        if !p.avOther.isEmpty, p.avOther == videoId, case .loaded(let lyrics) = state, lyrics != nil { return }
        videoId = p.videoId
        state = .loading
        offset = await model.api.lyricsOffset(p.videoId)
        do {
            let lyrics = try await model.api.lyrics(LyricsQuery(videoId: p.videoId, title: p.title, artist: p.artist, album: p.album.isEmpty ? nil : p.album, duration: p.duration))
            if videoId == p.videoId { state = .loaded(lyrics) }
        } catch {
            if videoId == p.videoId { state = .failed(AppModel.describe(error)) }
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
}

/// 표지 아래 가사 두 줄(멜론처럼). 누르면 전체 가사.
private struct LyricPreview: View {
    @Environment(AppModel.self) private var model
    let loader: LyricsLoader
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 4) {
                content
            }
            .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.1)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("가사 보기")
    }

    @ViewBuilder
    private var content: some View {
        let p = model.player
        if p.videoId.isEmpty {
            line("곡을 재생하면 가사가 여기에 나옵니다", dim: true)
        } else if p.ad {
            line("광고가 끝나면 가사를 보여 드립니다", dim: true)
        } else {
            switch loader.state {
            case .loading:
                line("가사를 찾는 중…", dim: true)
            case .failed:
                line("가사를 불러오지 못했습니다", dim: true)
            case .loaded(nil):
                line("이 곡의 가사를 찾지 못했습니다", dim: true)
            case .loaded(let lyrics?):
                if let lines = lyrics.synced?.filter({ !$0.text.isEmpty }), !lines.isEmpty {
                    TimelineView(.periodic(from: .now, by: 0.5)) { context in
                        let i = max(0, LyricsLoader.activeLine(lines, loader.time(model, at: context.date)))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(lines[i].text)
                                .font(.callout.weight(.bold))
                                .lineLimit(1)
                                .contentTransition(.opacity)
                            Text(i + 1 < lines.count ? lines[i + 1].text : " ")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.5))
                                .lineLimit(1)
                        }
                        .animation(.easeOut(duration: 0.3), value: i)
                    }
                } else {
                    let plain = (lyrics.plain ?? "").split(separator: "\n").map(String.init).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
                    Text(plain.first ?? L("가사 보기")).font(.callout.weight(.bold)).lineLimit(1)
                    Text(plain.count > 1 ? plain[1] : L("전체 가사 보기"))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.5))
                        .lineLimit(1)
                }
            }
        }
    }

    private func line(_ text: LocalizedStringKey, dim: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "quote.bubble").font(.footnote.weight(.semibold))
            Text(text).font(.footnote.weight(.semibold)).lineLimit(1)
        }
        .foregroundStyle(.white.opacity(dim ? 0.6 : 1))
    }
}

private struct LyricsPane: View {
    @Environment(AppModel.self) private var model
    let loader: LyricsLoader
    @State private var manualUntil = Date.distantPast
    @State private var translating = false

    var body: some View {
        let lyrics = loader.state.value ?? nil
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                if lyrics?.synced?.isEmpty == false { syncControl }
                if lyrics != nil {
                    Button { translating = true } label: {
                        Image(systemName: "translate").font(.system(size: 15, weight: .bold)).frame(width: 36, height: 30)
                    }
                    .buttonStyle(.plain)
                    .background(Capsule().fill(.white.opacity(0.14)))
                    .accessibilityLabel("가사 번역")
                }
                Spacer()
                sizeControl
            }
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            if let lyrics {
                Text(lyrics.synced == nil ? "가사 제공: \(lyrics.source) (시간 정보 없음)" : "가사 제공: \(lyrics.source)")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.45))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .translationPresentation(isPresented: $translating, text: loader.fullText)
    }

    /// 가사가 소리보다 빠르거나 늦을 때 0.5초씩 맞춘다(이 곡만, 기억해 둔다).
    private var syncControl: some View {
        HStack(spacing: 2) {
            Button { loader.nudge(model, -LyricsLoader.offsetStep) } label: {
                Image(systemName: "minus").font(.system(size: 12, weight: .heavy)).frame(width: 30, height: 30)
            }
            .disabled(loader.offset <= -LyricsLoader.offsetMax)
            .accessibilityLabel("가사를 0.5초 늦게")
            Button { loader.nudge(model, 0) } label: {
                Text(loader.offset == 0 ? L("싱크") : String(format: L("%@%.1f초"), loader.offset > 0 ? "+" : "", loader.offset))
                    .font(.caption.weight(.bold).monospacedDigit())
                    .frame(minWidth: 44, minHeight: 30)
            }
            .accessibilityLabel(loader.offset == 0 ? "가사 싱크" : "가사 싱크 원래대로")
            Button { loader.nudge(model, LyricsLoader.offsetStep) } label: {
                Image(systemName: "plus").font(.system(size: 12, weight: .heavy)).frame(width: 30, height: 30)
            }
            .disabled(loader.offset >= LyricsLoader.offsetMax)
            .accessibilityLabel("가사를 0.5초 빠르게")
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 4)
        .background(Capsule().fill(.white.opacity(0.14)))
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
            switch loader.state {
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

    private func message(_ text: LocalizedStringKey) -> some View {
        Text(text)
            .font(.title3.weight(.semibold))
            .foregroundStyle(.white.opacity(0.65))
            .padding(.top, 40)
    }

    private func synced(_ lines: [LyricLine]) -> some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            let active = LyricsLoader.activeLine(lines, loader.time(model, at: context.date))
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Color.clear.frame(height: 100)
                        ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                            Button {
                                manualUntil = .distantPast
                                model.seek(loader.seekTime(model, line.time))
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
                        Color.clear.frame(height: 220)
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
}

// MARK: 노래 ↔ 영상

/// [노래 | 영상] 전환(YouTube Music 앱과 같은 자리). 짝 버전이 있을 때만 보인다.
private struct AVToggle: View {
    @Environment(AppModel.self) private var model
    /// 영상이 보이면 오른쪽에 화면 속 화면 단추
    let pip: Bool

    var body: some View {
        let video = model.player.avVideo
        HStack(spacing: 0) {
            segment("노래", on: !video) { model.setAVMode(video: false) }
            segment("영상", on: video) { model.setAVMode(video: true) }
        }
        .padding(3)
        .background(Capsule().fill(.white.opacity(0.14)))
        .animation(.snappy(duration: 0.25), value: video)
        .sensoryFeedback(.selection, trigger: video)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("노래 또는 영상")
        .frame(maxWidth: .infinity)
        .overlay(alignment: .trailing) {
            if pip {
                HStack(spacing: 0) {
                    Button { model.togglePictureInPicture() } label: {
                        Image(systemName: "pip.enter")
                            .font(.system(size: 17, weight: .semibold))
                            .frame(width: 38, height: 36)
                    }
                    .accessibilityLabel("화면 속 화면")
                    Button { model.setVideoFullscreen(true) } label: {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 16, weight: .semibold))
                            .frame(width: 38, height: 36)
                    }
                    .accessibilityLabel("전체 화면")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white.opacity(0.85))
                .transition(.opacity)
            }
        }
    }

    private func segment(_ label: LocalizedStringKey, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline.weight(.bold))
                .frame(width: 74, height: 30)
                .foregroundStyle(on ? Color.black : Color.white.opacity(0.85))
                .background(Capsule().fill(on ? Color.white : .clear))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// 노래↔영상 전환 상태. 영상은 실제 프레임이 나온 뒤에야 보이게 하고(그 전엔 표지를 둔다), 바꿀 때는 겹쳐 바꾼다.
@MainActor
@Observable
final class VideoStage {
    /// 엔진 웹 화면을 옮겨 붙였는지(보이지 않아도 붙여 둬야 영상이 그 크기로 준비된다)
    private(set) var mounted = false
    /// 표지 대신 영상이 보이는지
    private(set) var visible = false
    private var mountedAt = Date.distantPast
    private var unmountTask: Task<Void, Never>?
    private var recheckTask: Task<Void, Never>?

    func sync(_ p: PlayerState) {
        let wantVideo = p.avVideo && !p.ad && !p.videoId.isEmpty
        if wantVideo {
            unmountTask?.cancel()
            unmountTask = nil
            if !mounted {
                mounted = true
                mountedAt = Date()
                // 상태가 1초마다 오므로, 붙인 직후 한 번 더 살펴본다.
                recheckTask?.cancel()
                recheckTask = Task { [weak self] in
                    try? await Task.sleep(for: .milliseconds(1100))
                    guard let self, !Task.isCancelled else { return }
                    self.sync(p)
                }
            }
            // 영상 프레임이 실제로 나오고, 붙인 뒤 1초가 지나 영상 배치(검은 띠 자르기 포함)가 잡힌 다음에 바꾼다.
            if !visible && p.hasPicture && Date().timeIntervalSince(mountedAt) > 1.0 {
                withAnimation(.easeInOut(duration: 0.6)) { visible = true }
            }
        } else if mounted {
            if visible { withAnimation(.easeInOut(duration: 0.45)) { visible = false } }
            if unmountTask == nil {
                unmountTask = Task { [weak self] in
                    try? await Task.sleep(for: .milliseconds(520))
                    guard let self, !Task.isCancelled else { return }
                    self.mounted = false
                    self.unmountTask = nil
                }
            }
        }
    }
}

/// 표지·영상 자리. 영상은 엔진 웹 화면을 화면 너비 그대로 옮겨 붙이고, 페이지가 가운데에 표지 너비의 둥근 영상과
/// 그 둘레의 앰비언트 빛(영상 색이 번진 빛)을 그린다. 바탕은 비워 둬서 앱 배경 그라데이션과 이어진다.
private struct MediaStage: View {
    @Environment(AppModel.self) private var model
    let stage: VideoStage
    let cover: String?
    let side: CGFloat
    let width: CGFloat

    var body: some View {
        let p = model.player
        ZStack {
            if stage.mounted {
                EngineDock(webView: model.engine.webView)
                    .frame(width: width, height: side)
                    .opacity(stage.visible ? 1 : 0)
                    .task(id: "\(Int(width))x\(Int(side))x\(model.videoFullscreen)") {
                        // 웹 화면이 자리를 옮긴 뒤 영상 배치를 켠다(표지와 같은 너비, 앰비언트 빛, 색 알림).
                        // 전체 화면(가로)일 때는 뒤에 깔린 이 화면도 가로로 계산되므로 건드리지 않고,
                        // 세로로 돌아와 크기가 바뀌면 그 크기로 다시 맞춘다.
                        guard !model.videoFullscreen else { return }
                        try? await Task.sleep(for: .milliseconds(60))
                        await applyCard()
                    }
                    .onDisappear {
                        let api = model.api
                        Task { try? await api.videoView(false) }
                    }
                    .accessibilityLabel("뮤직비디오")
            }
            CoverImage(url: cover, size: side, corner: 12)
                .shadow(color: .black.opacity(stage.visible ? 0 : 0.4), radius: 22, y: 12)
                .scaleEffect(stage.visible ? 0.9 : (p.playing || p.videoId.isEmpty ? 1 : 0.9))
                .blur(radius: stage.visible ? 12 : 0)
                .opacity(stage.visible ? 0 : 1)
                .animation(.spring(duration: 0.5, bounce: 0.25), value: p.playing)
                .allowsHitTesting(false)
        }
        .frame(width: width, height: side)
    }

    private func applyCard() async {
        let inset = width > 0 ? max(0, (width - side) / 2 / width) : 0.06
        try? await model.api.videoView(true, layout: "card", inset: inset, colors: true)
    }
}

/// 영상 전체 화면(가로). 화면을 누르면 조작 단추가 나오고 3.5초 뒤 사라진다(YouTube 앱처럼).
private struct VideoFullscreenView: View {
    @Environment(AppModel.self) private var model
    @State private var controls = true
    @State private var touched = Date()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            EngineDock(webView: model.engine.webView)
                .ignoresSafeArea()
                .task {
                    try? await Task.sleep(for: .milliseconds(60))
                    try? await model.api.videoView(true, layout: "fill")
                }
                .accessibilityLabel("뮤직비디오")
            if controls {
                overlay
                    .transition(.opacity)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.2)) { controls.toggle() }
            touched = Date()
        }
        .task(id: touched) {
            try? await Task.sleep(for: .seconds(3.5))
            guard !Task.isCancelled, model.player.playing else { return }
            withAnimation(.easeInOut(duration: 0.3)) { controls = false }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIDevice.orientationDidChangeNotification)) { _ in
            // 폰을 세로로 세우면 전체 화면을 끝낸다.
            if UIDevice.current.orientation == .portrait { model.setVideoFullscreen(false) }
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
    }

    private var overlay: some View {
        let p = model.player
        return VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 14) {
                button("전체 화면 끝내기", "chevron.down", size: 20) { model.setVideoFullscreen(false) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.title).font(.headline).lineLimit(1)
                    Text(p.artist).font(.subheadline).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                }
                Spacer()
                button("화면 속 화면", "pip.enter", size: 19) { model.togglePictureInPicture() }
            }
            Spacer()
            HStack(spacing: 64) {
                button("이전 곡", "backward.fill", size: 30) { model.control("previous", failure: "이전 곡으로 가지 못했습니다") }
                button(p.playing ? "일시정지" : "재생", p.playing ? "pause.fill" : "play.fill", size: 44) { model.togglePlay() }
                button("다음 곡", "forward.fill", size: 30) { model.control("next", failure: "다음 곡으로 가지 못했습니다") }
            }
            Spacer()
            HStack(alignment: .top, spacing: 18) {
                ProgressBar()
                button("전체 화면 끝내기", "arrow.down.right.and.arrow.up.left", size: 18) { model.setVideoFullscreen(false) }
                    .padding(.top, -6)
            }
        }
        .padding(.horizontal, 36)
        .padding(.vertical, 20)
        .background {
            LinearGradient(stops: [
                .init(color: .black.opacity(0.65), location: 0),
                .init(color: .black.opacity(0.15), location: 0.3),
                .init(color: .black.opacity(0.15), location: 0.7),
                .init(color: .black.opacity(0.7), location: 1),
            ], startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()
        }
    }

    private func button(_ label: LocalizedStringKey, _ symbol: String, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button {
            action()
            touched = Date()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .semibold))
                .frame(width: max(44, size + 20), height: max(44, size + 20))
                .contentShape(Rectangle())
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: 수면 타이머

private struct SleepMenu: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Menu {
            if model.sleep != .off {
                Button("수면 타이머 끄기", systemImage: "xmark") { model.cancelSleep() }
                Divider()
            }
            ForEach(AppModel.sleepMinutes, id: \.self) { m in
                Button(m < 60 ? "\(m)분" : m % 60 == 0 ? "\(m / 60)시간" : "\(m / 60)시간 \(m % 60)분") { model.startSleep(minutes: m) }
            }
            Button("지금 곡이 끝나면", systemImage: "music.note") { model.startSleepAfterTrack() }
                .disabled(model.player.videoId.isEmpty)
        } label: {
            Label(model.sleep == .off ? "수면 타이머" : "수면 타이머 (\(model.sleepLabel()))", systemImage: "moon.zzz")
        }
    }
}

// MARK: 공유 이미지 카드

/// 표지·제목·가수를 담은 세로 카드 이미지(메신저·스토리에 붙이기 좋게)
struct ShareCard {
    let image: Image

    @MainActor
    static func make(_ p: PlayerState, cover: String, colors: ArtworkColors) async -> ShareCard? {
        guard !p.videoId.isEmpty, !p.ad, let url = NowPlayingView.large(cover).flatMap(URL.init(string:)),
              let (data, _) = try? await URLSession.shared.data(from: url), let image = UIImage(data: data) else { return nil }
        let view = ShareCardView(cover: image, title: p.title, artist: p.artist, top: colors.top, bottom: colors.bottom, letterboxed: CoverImage.isLetterboxed(cover))
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        guard let ui = renderer.uiImage else { return nil }
        return ShareCard(image: Image(uiImage: ui))
    }
}

private struct ShareCardView: View {
    let cover: UIImage
    let title: String
    let artist: String
    let top: Color
    let bottom: Color
    let letterboxed: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Image(uiImage: cover)
                .resizable()
                .scaledToFill()
                .frame(width: 280, height: 280)
                .scaleEffect(letterboxed ? 1.34 : 1)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: .black.opacity(0.35), radius: 16, y: 8)
            Text(title)
                .font(.system(size: 24, weight: .heavy))
                .lineLimit(2)
                .padding(.top, 22)
            Text(artist)
                .font(.system(size: 17, weight: .semibold))
                .opacity(0.75)
                .lineLimit(1)
                .padding(.top, 4)
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                Image(systemName: "play.circle.fill").font(.system(size: 18))
                Text("YouTube Music에서 듣기").font(.system(size: 13, weight: .bold))
            }
            .opacity(0.8)
        }
        .foregroundStyle(.white)
        .padding(30)
        .frame(width: 340, height: 520, alignment: .topLeading)
        .background(LinearGradient(colors: [top, bottom], startPoint: .top, endPoint: .bottom))
    }
}

// MARK: 다음 트랙 · 관련 항목 · 댓글

private struct UpNextPane: View {
    enum Tab: String, CaseIterable {
        case queue, related, comments
        var label: LocalizedStringResource {
            switch self {
            case .queue: "다음 트랙"
            case .related: "관련 항목"
            case .comments: "댓글"
            }
        }
    }
    @Environment(AppModel.self) private var model

    var body: some View {
        let tab = Tab(rawValue: model.upNextTab) ?? .queue
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                ForEach(Tab.allCases, id: \.self) { t in
                    Button { model.upNextTab = t.rawValue } label: {
                        Text(t.label)
                            .font(.subheadline.weight(.bold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                            .padding(.horizontal, 12)
                            .frame(height: 32)
                            .foregroundStyle(tab == t ? Color.black : Color.white.opacity(0.85))
                            .background(Capsule().fill(tab == t ? Color.white : Color.white.opacity(0.12)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(tab == t ? .isSelected : [])
                }
                Spacer(minLength: 0)
            }
            switch tab {
            case .queue: QueuePane()
            case .related: RelatedPane()
            case .comments: CommentsPane()
            }
        }
    }
}

/// 지금 곡과 관련된 노래·앨범·아티스트(next 응답의 "관련 항목" 탭)
private struct RelatedPane: View {
    @Environment(AppModel.self) private var model
    @State private var state: Loadable<BrowsePage> = .loading

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                switch state {
                case .loading:
                    note("불러오는 중…")
                case .failed(let message):
                    note("\(message)")
                case .loaded(let page):
                    if page.shelves.isEmpty { note("관련 항목이 없습니다.") }
                    ForEach(Array(page.shelves.enumerated()), id: \.offset) { _, shelf in
                        ShelfSection(shelf: shelf, trackLimit: 6)
                            .padding(.horizontal, -16)
                    }
                }
            }
            .padding(.bottom, 12)
        }
        .scrollIndicators(.hidden)
        .task(id: model.player.videoId) {
            let id = model.player.videoId
            guard !id.isEmpty else { return }
            state = .loading
            do { state = .loaded(try await model.api.related(id)) } catch { state = .failed(AppModel.describe(error)) }
        }
    }

    private func note(_ text: LocalizedStringKey) -> some View {
        Text(text).foregroundStyle(.white.opacity(0.6)).padding(.top, 30)
    }
}

/// 지금 곡(영상)의 댓글. 20개씩 이어서 읽는다.
private struct CommentsPane: View {
    @Environment(AppModel.self) private var model
    @State private var page: CommentsPage?
    @State private var failed: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                if let failed, page == nil {
                    note("\(failed)")
                } else if let page {
                    if let count = page.countText { Text(count).font(.subheadline.weight(.bold)).foregroundStyle(.white.opacity(0.6)) }
                    if page.comments.isEmpty { note("댓글이 없거나 댓글을 쓸 수 없는 곡입니다.") }
                    ForEach(page.comments) { comment in
                        CommentRow(comment: comment)
                    }
                    if let token = page.continuation {
                        ProgressView()
                            .tint(.white)
                            .frame(maxWidth: .infinity)
                            .task(id: token) { await more(token) }
                    }
                } else {
                    note("불러오는 중…")
                }
            }
            .padding(.vertical, 6)
        }
        .scrollIndicators(.hidden)
        .task(id: model.player.videoId) {
            let id = model.player.videoId
            guard !id.isEmpty else { return }
            page = nil
            failed = nil
            do { page = try await model.api.comments(id) } catch { failed = AppModel.describe(error) }
        }
    }

    private func more(_ token: String) async {
        guard !busy, page?.continuation == token else { return }
        busy = true
        defer { busy = false }
        do {
            let next = try await model.api.commentsMore(token)
            page?.comments += next.comments
            page?.continuation = next.continuation
        } catch {
            log("[comments] 더 불러오기 실패: \(error)")
            page?.continuation = nil
        }
    }

    private func note(_ text: LocalizedStringKey) -> some View {
        Text(text).foregroundStyle(.white.opacity(0.6)).padding(.top, 30)
    }
}

private struct CommentRow: View {
    let comment: Comment

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            AsyncImage(url: comment.avatar.flatMap(URL.init(string:))) { phase in
                if case .success(let image) = phase { image.resizable().scaledToFill() } else { Color.white.opacity(0.15) }
            }
            .frame(width: 32, height: 32)
            .clipShape(Circle())
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(comment.author)
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, comment.isArtist ? 6 : 0)
                        .padding(.vertical, comment.isArtist ? 1 : 0)
                        .background(Capsule().fill(comment.isArtist ? Color.white.opacity(0.2) : .clear))
                    Text(comment.published).font(.caption2).foregroundStyle(.white.opacity(0.5))
                }
                Text(comment.text)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.92))
                    .textSelection(.enabled)
                HStack(spacing: 14) {
                    if !comment.likes.isEmpty { Label(comment.likes, systemImage: "hand.thumbsup") }
                    if !comment.replies.isEmpty { Label(comment.replies, systemImage: "bubble.left") }
                }
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.5))
            }
        }
        .accessibilityElement(children: .combine)
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

    private func note(_ text: LocalizedStringKey) -> some View {
        Text(text).foregroundStyle(.white.opacity(0.6)).padding(.top, 30)
    }

    private func section(_ title: LocalizedStringKey) -> some View {
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
