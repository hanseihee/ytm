// 미니 플레이어(탭 위)와 "지금 재생" 전체 화면.
//
// 참고한 플레이어(2026-10-14):
// - Apple 뮤직: 미니 플레이어에서 확대되며 열리고 아래로 끌어 닫는다. 진행 막대는 손잡이 없이 얇게, 시간은 그 아래 작게.
// - Spotify: 표지에서 뽑은 색으로 배경 그라데이션, 흰 원 재생 버튼, 위에 "지금 재생 / 앨범명", 제목 오른쪽 하트.
// - 멜론: 표지 아래에 지금 부르는 가사 두 줄, 누르면 전체 가사.
import AVKit
import CoreImage
import CoreImage.CIFilterBuiltins
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
    @State private var mode: Mode = .artwork
    @State private var lyrics = LyricsLoader()
    @State private var colors = ArtworkColors()

    var body: some View {
        let p = model.player
        GeometryReader { geo in
            VStack(spacing: 0) {
                header
                switch mode {
                case .artwork:
                    Spacer(minLength: 10)
                    CoverImage(url: Self.large(p.artwork), size: artworkSize(geo.size), corner: 12)
                        .shadow(color: .black.opacity(0.4), radius: 22, y: 12)
                        .scaleEffect(p.playing || p.videoId.isEmpty ? 1 : 0.9)
                        .animation(.spring(duration: 0.5, bounce: 0.25), value: p.playing)
                        .frame(maxWidth: .infinity)
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
                    QueuePane()
                        .padding(.top, 6)
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
        .animation(.easeInOut(duration: 0.8), value: colors.key)
        .task(id: p.artwork) { await colors.load(Self.large(p.artwork)) }
        .task(id: p.videoId + (p.ad ? ":ad" : "") + (p.title.isEmpty ? "" : ":t")) { await lyrics.load(model) }
        .onAppear {
            mode = model.nowPlayingMode == "lyrics" ? .lyrics : model.nowPlayingMode == "queue" ? .queue : .artwork
            model.nowPlayingMode = "artwork"
        }
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
            }
            Spacer(minLength: 0)
            Menu {
                if !p.videoId.isEmpty && !p.ad {
                    TrackMenu(track: Self.currentTrack(p))
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 20, weight: .semibold))
                    .frame(width: 44, height: 44)
            }
            .disabled(p.videoId.isEmpty || p.ad)
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

    private func barButton(_ label: String, symbol: String, on: Bool, action: @escaping () -> Void) -> some View {
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
                Text(p.ad ? "광고" : (p.title.isEmpty ? "재생 중인 곡이 없습니다" : p.title))
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
                Text(p.ad ? "광고" : p.title).font(.headline).lineLimit(1)
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
    private static let context = CIContext(options: [.workingColorSpace: NSNull()])

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
    var state: Loadable<Lyrics?> = .loading
    private(set) var videoId = ""

    func load(_ model: AppModel) async {
        let p = model.player
        guard !p.videoId.isEmpty, !p.ad, !p.title.isEmpty else { return }
        if videoId == p.videoId, case .loaded = state { return }
        videoId = p.videoId
        state = .loading
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
                        let i = max(0, LyricsLoader.activeLine(lines, model.position(at: context.date)))
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
                    Text(plain.first ?? "가사 보기").font(.callout.weight(.bold)).lineLimit(1)
                    Text(plain.count > 1 ? plain[1] : "전체 가사 보기")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.5))
                        .lineLimit(1)
                }
            }
        }
    }

    private func line(_ text: String, dim: Bool) -> some View {
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

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                if let lyrics = loader.state.value ?? nil {
                    Text("가사 제공: \(lyrics.source)\(lyrics.synced == nil ? " (시간 정보 없음)" : "")")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.5))
                }
                Spacer()
                sizeControl
            }
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
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

    private func message(_ text: String) -> some View {
        Text(text)
            .font(.title3.weight(.semibold))
            .foregroundStyle(.white.opacity(0.65))
            .padding(.top, 40)
    }

    private func synced(_ lines: [LyricLine]) -> some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            let active = LyricsLoader.activeLine(lines, model.position(at: context.date))
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Color.clear.frame(height: 100)
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
