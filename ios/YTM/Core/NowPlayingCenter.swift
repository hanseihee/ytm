// 잠금 화면·제어 센터·이어폰 버튼: 엔진이 보낸 재생 상태를 보여 주고, 버튼은 엔진 재생 제어로 넘긴다
// (데스크톱 src-tauri/src/media.rs와 같은 일).
import MediaPlayer
import UIKit

@MainActor
final class NowPlayingCenter {
    /// engine.js control 이름과 값(초)
    var onCommand: ((String, Double?) -> Void)?

    private var artworkURL = ""
    private var artwork: MPMediaItemArtwork?
    private var last = PlayerState()

    init() {
        let center = MPRemoteCommandCenter.shared()
        let bind = { (command: MPRemoteCommand, name: String) in
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
            MPMediaItemPropertyTitle: s.ad ? "광고" : s.title,
            MPMediaItemPropertyArtist: s.ad ? "YouTube Music" : s.artist,
            MPMediaItemPropertyAlbumTitle: s.album,
            MPMediaItemPropertyPlaybackDuration: s.duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: s.position,
            MPNowPlayingInfoPropertyPlaybackRate: s.playing && !s.buffering ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
        ]
        if s.artwork == artworkURL, let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        center.nowPlayingInfo = info
        if s.artwork != artworkURL { loadArtwork(s.artwork) }
    }

    private func loadArtwork(_ url: String) {
        artworkURL = url
        artwork = nil
        guard let target = URL(string: url), target.scheme == "https" else { return }
        Task {
            guard let (data, _) = try? await URLSession.shared.data(from: target), let image = UIImage(data: data) else { return }
            guard url == self.artworkURL else { return }
            self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            self.update(self.last)
        }
    }
}
