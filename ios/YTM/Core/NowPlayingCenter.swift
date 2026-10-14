// 잠금 화면·제어 센터·이어폰 버튼: 엔진이 보낸 재생 상태를 보여 주고, 버튼은 엔진 재생 제어로 넘긴다
// (데스크톱 src-tauri/src/media.rs와 같은 일).
//
// 표지: YouTube Music 썸네일 주소의 크기(=w60-h60…)를 크게 바꿔 받고, 영상 썸네일(검은 띠가 있는 16:9)은
// 가운데를 정사각형으로 잘라 넣는다. 잠금 화면 전체 표지로도 쓰여서 1200px로 받는다.
import MediaPlayer
import UIKit
import WidgetKit

@MainActor
final class NowPlayingCenter {
    /// engine.js control 이름과 값(초)
    var onCommand: ((String, Double?) -> Void)?

    private var artworkURL = ""
    private(set) var artwork: MPMediaItemArtwork?
    private(set) var artworkSize: CGSize = .zero
    private var artworkImage: UIImage?
    private var last = PlayerState()
    private var widget = SharedNowPlaying.Info()

    init() {
        let center = MPRemoteCommandCenter.shared()
        let bind = { [weak self] (command: MPRemoteCommand, name: String) in
            command.isEnabled = true
            command.addTarget { [weak self] _ in
                self?.onCommand?(name, nil)
                return .success
            }
        }
        bind(center.playCommand, "play")
        bind(center.pauseCommand, "pause")
        bind(center.togglePlayPauseCommand, "toggle")
        bind(center.nextTrackCommand, "next")
        bind(center.previousTrackCommand, "previous")
        center.changePlaybackPositionCommand.isEnabled = true
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.onCommand?("seek", event.positionTime)
            return .success
        }
    }

    func update(_ s: PlayerState) {
        defer { last = s }
        let center = MPNowPlayingInfoCenter.default()
        guard !s.videoId.isEmpty else {
            center.nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: s.ad ? L("광고") : s.title,
            MPMediaItemPropertyArtist: s.ad ? "YouTube Music" : s.artist,
            MPMediaItemPropertyAlbumTitle: s.album,
            MPMediaItemPropertyPlaybackDuration: s.duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: s.position,
            MPNowPlayingInfoPropertyPlaybackRate: s.playing && !s.buffering ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
        ]
        if s.artwork == artworkURL, let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        center.nowPlayingInfo = info
        if s.artwork != artworkURL { loadArtwork(s.artwork) }
        updateWidget(s)
    }

    /// 화면 언어가 바뀌었을 때: 잠금 화면 정보를 새 언어로 다시 쓰고 위젯도 다시 그리게 한다.
    func refresh() {
        update(last)
        WidgetCenter.shared.reloadTimelines(ofKind: SharedNowPlaying.widgetKind)
    }

    /// 홈 화면 위젯: 곡·재생 상태·표지가 바뀔 때만 App Group에 쓰고 다시 그리게 한다.
    private func updateWidget(_ s: PlayerState) {
        var next = SharedNowPlaying.Info(
            videoId: s.videoId, title: s.ad ? L("광고") : s.title, artist: s.ad ? "YouTube Music" : s.artist,
            playing: s.playing, artworkFile: widget.artworkFile
        )
        let name = "artwork-\(abs(artworkURL.hashValue)).jpg"
        if s.artwork == artworkURL, let image = artworkImage, widget.artworkFile != name, let url = SharedNowPlaying.artworkURL(name) {
            // 위젯은 큰 그림을 못 그리므로 360px로 줄여 둔다.
            let side: CGFloat = 360
            let small = UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { _ in
                image.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
            }
            if let data = small.jpegData(compressionQuality: 0.85), (try? data.write(to: url, options: .atomic)) != nil {
                if let old = widget.artworkFile, let oldURL = SharedNowPlaying.artworkURL(old) { try? FileManager.default.removeItem(at: oldURL) }
                next.artworkFile = name
            }
        } else if s.artwork != artworkURL || artworkImage == nil {
            next.artworkFile = s.videoId == widget.videoId ? widget.artworkFile : nil
        }
        guard next != widget else { return }
        widget = next
        SharedNowPlaying.write(next)
        WidgetCenter.shared.reloadTimelines(ofKind: SharedNowPlaying.widgetKind)
    }

    /// 썸네일 주소를 큰 크기로(=w60-h60-l90-rj → =w1200-h1200-l90-rj). i.ytimg.com 영상 썸네일은 그대로.
    static func largeArtwork(_ url: String) -> String {
        guard let range = url.range(of: #"=w\d+-h\d+"#, options: .regularExpression) else { return url }
        return url.replacingCharacters(in: range, with: "=w1200-h1200")
    }

    private func loadArtwork(_ url: String) {
        artworkURL = url
        artwork = nil
        artworkImage = nil
        artworkSize = .zero
        guard let target = URL(string: Self.largeArtwork(url)), target.scheme == "https" else { return }
        Task {
            var image: UIImage?
            if let (data, _) = try? await URLSession.shared.data(from: target) { image = UIImage(data: data) }
            // 큰 크기를 못 받으면 원래 주소로
            if image == nil, let original = URL(string: url), original != target, let (data, _) = try? await URLSession.shared.data(from: original) {
                image = UIImage(data: data)
            }
            guard let image, url == self.artworkURL else {
                if url == self.artworkURL { log("[now-playing] 표지를 받지 못했습니다: \(url)") }
                return
            }
            let square = Self.squareCrop(image)
            self.artworkImage = square
            self.artwork = Self.makeArtwork(square)
            self.artworkSize = square.size
            self.update(self.last)
        }
    }

    /// 정사각형이 아니면(영상 썸네일) 가운데를 잘라 낸다.
    private static func squareCrop(_ image: UIImage) -> UIImage {
        let w = image.size.width, h = image.size.height
        guard abs(w - h) > 2, let cg = image.cgImage else { return image }
        let side = min(CGFloat(cg.width), CGFloat(cg.height))
        let rect = CGRect(x: (CGFloat(cg.width) - side) / 2, y: (CGFloat(cg.height) - side) / 2, width: side, height: side)
        guard let cropped = cg.cropping(to: rect) else { return image }
        return UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
    }

    /// 표지 요청은 시스템이 뒤 스레드에서 부른다 — 주 스레드에 묶인 클로저가 되지 않게 따로 만든다.
    nonisolated private static func makeArtwork(_ image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { @Sendable _ in image }
    }
}

#if DEBUG
import Darwin

/// 개발판 조사: 시스템(잠금 화면)이 지금 보여 주는 재생 정보(MediaRemote, 비공개 — 개발판에만 있다).
enum SystemNowPlaying {
    private typealias InfoFn = @convention(c) (DispatchQueue, @escaping @convention(block) (CFDictionary?) -> Void) -> Void

    static func read() async -> [String: Any] {
        guard let handle = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW),
              let symbol = dlsym(handle, "MRMediaRemoteGetNowPlayingInfo") else { return ["error": "no_symbol"] }
        let fn = unsafeBitCast(symbol, to: InfoFn.self)
        return await withCheckedContinuation { continuation in
            var done = false
            let finish: ([String: Any]) -> Void = { value in
                guard !done else { return }
                done = true
                continuation.resume(returning: value)
            }
            fn(DispatchQueue.main) { dict in
                guard let info = dict as? [String: Any] else { return finish(["info": NSNull()]) }
                var out: [String: Any] = [:]
                for (key, value) in info {
                    let name = key.replacingOccurrences(of: "kMRMediaRemoteNowPlayingInfo", with: "")
                    if let data = value as? Data { out[name] = "data \(data.count)B" }
                    else if value is String || value is NSNumber { out[name] = value }
                    else { out[name] = "\(type(of: value))" }
                }
                finish(out)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { finish(["error": "timeout"]) }
        }
    }
}
#endif
