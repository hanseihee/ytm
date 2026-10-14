// 홈 화면·잠금 화면 위젯: 지금 재생(표지·제목·가수, 이전/재생/다음 단추).
import AppIntents
import SwiftUI
import WidgetKit

struct NowPlayingEntry: TimelineEntry {
    let date: Date
    let info: SharedNowPlaying.Info?
    let artwork: UIImage?
}

struct NowPlayingProvider: TimelineProvider {
    func placeholder(in context: Context) -> NowPlayingEntry {
        NowPlayingEntry(date: .now, info: .init(videoId: "x", title: "밤편지", artist: "아이유", playing: true), artwork: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (NowPlayingEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : current())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NowPlayingEntry>) -> Void) {
        // 앱이 곡·재생 상태가 바뀔 때마다 다시 그리라고 알린다.
        completion(Timeline(entries: [current()], policy: .never))
    }

    private func current() -> NowPlayingEntry {
        let info = SharedNowPlaying.read()
        let image = info?.artworkFile.flatMap(SharedNowPlaying.artworkURL).flatMap { try? Data(contentsOf: $0) }.flatMap(UIImage.init(data:))
        return NowPlayingEntry(date: .now, info: info, artwork: image)
    }
}

/// 앱에서 고른 화면 언어로 문구를 만든다(앱이 App Group에 남긴 언어, 없으면 기기 언어).
private func L(_ resource: LocalizedStringResource) -> String {
    var resource = resource
    if let code = SharedNowPlaying.defaults?.string(forKey: SharedNowPlaying.languageKey) { resource.locale = Locale(identifier: code) }
    return String(localized: resource)
}

struct NowPlayingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: NowPlayingEntry

    var body: some View {
        let info = entry.info
        let has = !(info?.videoId.isEmpty ?? true)
        Group {
            switch family {
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(has ? info!.title : "YTM").font(.headline).lineLimit(1)
                    Text(has ? info!.artist : L("재생 중인 곡 없음")).font(.caption).lineLimit(1)
                    if has { controls(size: 13) }
                }
            case .systemMedium:
                HStack(spacing: 14) {
                    cover(size: 116)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(has ? info!.title : L("재생 중인 곡이 없습니다")).font(.headline).lineLimit(2)
                        Text(has ? info!.artist : L("YTM을 열어 곡을 고르세요")).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                        Spacer(minLength: 6)
                        if has { controls(size: 20) }
                    }
                    Spacer(minLength: 0)
                }
            default:
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top) {
                        cover(size: 58)
                        Spacer()
                        if has {
                            Button(intent: WidgetTogglePlayIntent()) {
                                Image(systemName: info!.playing ? "pause.fill" : "play.fill").font(.system(size: 20, weight: .bold))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Spacer(minLength: 0)
                    Text(has ? info!.title : "YTM").font(.subheadline.weight(.bold)).lineLimit(2)
                    Text(has ? info!.artist : L("재생 중인 곡 없음")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
        }
        .containerBackground(for: .widget) {
            if let image = entry.artwork, family != .accessoryRectangular {
                ZStack {
                    Image(uiImage: image).resizable().scaledToFill().blur(radius: 30)
                    Color.black.opacity(0.45)
                }
            } else {
                LinearGradient(colors: [Color(red: 0.23, green: 0.16, blue: 0.31), Color(red: 0.07, green: 0.05, blue: 0.09)], startPoint: .top, endPoint: .bottom)
            }
        }
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
        .widgetURL(URL(string: "ytm://now-playing"))
    }

    private func cover(size: CGFloat) -> some View {
        Group {
            if let image = entry.artwork {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                ZStack {
                    Color.white.opacity(0.12)
                    Image(systemName: "music.note").font(.system(size: size * 0.4))
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.12, style: .continuous))
    }

    private func controls(size: CGFloat) -> some View {
        HStack(spacing: size * 1.4) {
            Button(intent: WidgetPreviousIntent()) { Image(systemName: "backward.fill") }
            Button(intent: WidgetTogglePlayIntent()) { Image(systemName: entry.info?.playing == true ? "pause.fill" : "play.fill") }
            Button(intent: WidgetNextIntent()) { Image(systemName: "forward.fill") }
        }
        .font(.system(size: size, weight: .bold))
        .buttonStyle(.plain)
    }
}

struct NowPlayingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: SharedNowPlaying.widgetKind, provider: NowPlayingProvider()) { entry in
            NowPlayingWidgetView(entry: entry)
        }
        .configurationDisplayName("지금 재생")
        .description("YTM에서 듣는 곡과 재생 단추")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

@main
struct YTMWidgets: WidgetBundle {
    var body: some Widget {
        NowPlayingWidget()
    }
}
