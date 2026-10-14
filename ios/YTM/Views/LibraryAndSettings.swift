// 보관함·설정 화면과 플레이리스트 시트(추가·새로 만들기·이름 바꾸기).
import SwiftUI

// MARK: 보관함

struct LibraryView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(LibraryTab.allCases) { t in
                        Button { model.libraryTab = t } label: {
                            Text(t.label)
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .foregroundStyle(model.libraryTab == t ? palette.night : palette.ink)
                                .background(Capsule().fill(model.libraryTab == t ? palette.ink : palette.plum))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(model.libraryTab == t ? .isSelected : [])
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .scrollIndicators(.hidden)
            switch model.libraryTab {
            case .playlists: PlaylistsTab()
            case .history: HistoryTab()
            default: CardsTab(tab: model.libraryTab)
            }
        }
        .background(palette.night)
        .navigationTitle("보관함")
        .settingsButton(model)
    }
}

/// 재생목록: 좋아요·차트·통계 바로가기 + 내 플레이리스트
private struct PlaylistsTab: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    @State private var deleting: Card?

    var body: some View {
        List {
            Section {
                Button { model.go(.liked) } label: {
                    pin(icon: AnyView(Image(systemName: "heart.fill").font(.title3).foregroundStyle(palette.onAccent)),
                        title: "좋아요 표시한 곡",
                        subtitle: model.liked.isEmpty ? "하트를 누른 곡" : "\(model.liked.count)곡 이상")
                }
                Button { model.openCharts() } label: {
                    pin(icon: AnyView(Text("100").font(.system(size: 15, weight: .black)).foregroundStyle(palette.onAccent)),
                        title: "차트",
                        subtitle: "멜론·지니·Spotify·빌보드 등을 YouTube Music으로")
                }
                Button { model.go(.stats) } label: {
                    pin(icon: AnyView(Image(systemName: "chart.pie.fill").font(.title3).foregroundStyle(palette.onAccent)),
                        title: "청취 통계",
                        subtitle: "이 기기에서 많이 들은 곡·아티스트")
                }
            }
            .listRowBackground(palette.dusk)

            Section("플레이리스트") {
                if !model.playlistsLoaded {
                    ProgressView().frame(maxWidth: .infinity)
                } else if model.playlists.isEmpty {
                    Text("저장한 플레이리스트가 없습니다. 새 플레이리스트를 만들거나, 마음에 드는 앨범·플레이리스트의 \"보관함에 저장\"을 누르세요.")
                        .font(.subheadline)
                        .foregroundStyle(palette.mist)
                }
                ForEach(Array(model.playlists.enumerated()), id: \.offset) { _, card in
                    Button {
                        if let id = card.browseId { model.go(routeForBrowse(id)) }
                    } label: {
                        HStack(spacing: 12) {
                            CoverImage(url: card.thumbnail, size: 52, corner: 6)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(card.title).font(.body.weight(.semibold)).foregroundStyle(palette.ink).lineLimit(1)
                                Text(card.subtitle).font(.subheadline).foregroundStyle(palette.mist).lineLimit(1)
                            }
                        }
                    }
                    .contextMenu {
                        CardMenu(card: card)
                        if card.browseId != nil {
                            Button("플레이리스트 삭제…", systemImage: "trash", role: .destructive) { deleting = card }
                        }
                    }
                }
            }
            .listRowBackground(palette.dusk)
        }
        .scrollContentBackground(.hidden)
        .background(palette.night)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { model.sheet = .newPlaylist([], openAfter: true) } label: { Image(systemName: "plus") }
                    .disabled(!model.status.loggedIn)
                    .accessibilityLabel("새 플레이리스트")
            }
        }
        .refreshable { await model.loadPlaylists() }
        .confirmationDialog("플레이리스트 삭제", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("삭제", role: .destructive) {
                guard let card = deleting, let id = card.browseId else { return }
                Task { _ = await model.deletePlaylist(id, title: card.title) }
            }
        } message: {
            Text("'\(deleting?.title ?? "")'을(를) 삭제합니다. 내가 만든 플레이리스트만 삭제할 수 있고, 되돌릴 수 없습니다.")
        }
    }

    private func pin(icon: AnyView, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            icon
                .frame(width: 52, height: 52)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(palette.accent))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline).foregroundStyle(palette.ink)
                Text(subtitle).font(.subheadline).foregroundStyle(palette.mist).lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(palette.faint)
        }
    }
}

/// 앨범·아티스트·구독: 카드 격자 + 이어받기
private struct CardsTab: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    let tab: LibraryTab
    @State private var state: Loadable<[Card]> = .loading
    @State private var continuation: Continuation?

    var body: some View {
        ScrollView {
            switch state {
            case .loading:
                LoadingView()
            case .failed(let message):
                ErrorView(message: message) { Task { await load() } }
            case .loaded(let cards):
                if cards.isEmpty {
                    ContentUnavailableView(emptyText, systemImage: tab == .albums ? "square.stack" : "person.2")
                        .padding(.top, 40)
                } else {
                    VStack(spacing: 0) {
                        CardGrid(cards: cards)
                        if let c = continuation { LoadMoreRow { await more(c) } }
                    }
                    .padding(.vertical, 8)
                }
            }
        }
        .refreshable { await load() }
        .task(id: "\(tab.rawValue)#\(model.revision)") { await load() }
    }

    private var emptyText: String {
        switch tab {
        case .albums: "보관함에 저장한 앨범이 없습니다"
        case .artists: "보관함 곡의 아티스트가 없습니다"
        default: "구독한 아티스트가 없습니다"
        }
    }

    private func load() async {
        do {
            let page: BrowsePage
            switch tab {
            case .albums: page = try await model.api.libraryAlbums()
            case .artists: page = try await model.api.libraryArtists()
            default: page = try await model.api.librarySubscriptions()
            }
            continuation = page.shelves.first?.continuation
            state = .loaded(page.shelves.flatMap(\.cards))
        } catch {
            if state.value == nil { state = .failed(AppModel.describe(error)) }
        }
    }

    private func more(_ c: Continuation) async {
        guard continuation == c, case .loaded(let cards) = state else { return }
        do {
            let page = try await model.api.libraryMore(c)
            continuation = page.continuation
            state = .loaded(cards + page.cards)
        } catch {
            log("[library] 더 불러오기 실패: \(error)")
            continuation = nil
        }
    }
}

/// 최근 재생(YouTube Music 계정의 재생 기록)
private struct HistoryTab: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    @State private var state: Loadable<BrowsePage> = .loading

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                switch state {
                case .loading:
                    LoadingView()
                case .failed(let message):
                    ErrorView(message: message) { Task { await load() } }
                case .loaded(let page):
                    Text("YouTube Music 계정의 재생 기록이라 다른 기기에서 들은 곡도 나옵니다.")
                        .font(.footnote)
                        .foregroundStyle(palette.mist)
                        .padding(.horizontal, 16)
                    if page.shelves.isEmpty {
                        ContentUnavailableView("최근에 들은 곡이 없습니다", systemImage: "clock")
                    }
                    ForEach(Array(page.shelves.enumerated()), id: \.offset) { _, shelf in
                        ShelfSection(shelf: shelf)
                    }
                }
            }
            .padding(.vertical, 8)
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do { state = .loaded(try await model.api.history()) } catch { if state.value == nil { state = .failed(AppModel.describe(error)) } }
    }
}

// MARK: 설정

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette

    var body: some View {
        List {
            Section("테마") {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(ThemeID.allCases) { theme in
                        ThemeCard(theme: theme, selected: model.theme == theme) { model.theme = theme }
                    }
                }
                .padding(.vertical, 6)
            }
            .listRowBackground(Color.clear)

            Section {
                HStack(spacing: 14) {
                    HStack(spacing: 0) {
                        Button { model.stepLyricScale(-1) } label: {
                            Text("가").font(.system(size: 14, weight: .heavy)).frame(width: 40, height: 36)
                        }
                        .disabled(model.lyricScale <= AppModel.lyricScales.first!)
                        .accessibilityLabel("가사 글자 작게")
                        Button { model.stepLyricScale(0) } label: {
                            Text("\(Int(model.lyricScale * 100))%").font(.subheadline.weight(.bold).monospacedDigit()).frame(minWidth: 52, minHeight: 36)
                        }
                        .accessibilityLabel("기본 크기로")
                        Button { model.stepLyricScale(1) } label: {
                            Text("가").font(.system(size: 20, weight: .heavy)).frame(width: 40, height: 36)
                        }
                        .disabled(model.lyricScale >= AppModel.lyricScales.last!)
                        .accessibilityLabel("가사 글자 크게")
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(palette.ink)
                    .background(Capsule().fill(palette.plum))
                    Text("이 밤 그날의 반딧불을")
                        .font(.system(size: 22 * model.lyricScale, weight: .heavy))
                        .lineLimit(2)
                        .minimumScaleFactor(0.5)
                }
            } header: {
                Text("가사 글자 크기")
            } footer: {
                Text("지금 재생 화면의 가사에서도 가−/가+로 바꿀 수 있습니다.")
            }
            .listRowBackground(palette.dusk)

            Section("계정과 연결") {
                Text(model.account.map { "\($0.name)\($0.handle.map { " (\($0))" } ?? "") 계정으로 로그인했습니다." } ?? "로그인하지 않았습니다.")
                    .foregroundStyle(palette.mist)
                Button("YouTube Music 웹 화면 열기") { model.showEngine("web") }
                Button("다른 계정으로 로그인") { model.showEngine("login") }
                Button("YouTube Music 다시 연결") { model.showEngine("reload") }
            }
            .listRowBackground(palette.dusk)

            Section {
                LabeledContent("버전", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")
            } footer: {
                Text("YouTube Music 계정으로 쓰는 비공식 플레이어입니다. 소리는 YouTube Music 공식 플레이어가 냅니다.")
            }
            .listRowBackground(palette.dusk)
        }
        .scrollContentBackground(.hidden)
        .background(palette.night)
        .navigationTitle("설정")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ThemeCard: View {
    @Environment(\.palette) private var palette
    let theme: ThemeID
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let p = theme.palette(system: .dark)
        let light = theme.palette(system: .light)
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 0) {
                    (theme == .system ? Color.clear : p.dusk.opacity(0.85)).frame(width: 30)
                    VStack(alignment: .leading, spacing: 6) {
                        Capsule().fill(p.ink.opacity(0.85)).frame(width: 60, height: 6)
                        Capsule().fill(p.ink.opacity(0.5)).frame(width: 38, height: 6)
                        Capsule().fill(LinearGradient(colors: [p.rose, p.violet], startPoint: .leading, endPoint: .trailing)).frame(width: 56, height: 14)
                    }
                    .padding(10)
                    Spacer(minLength: 0)
                }
                .frame(height: 70)
                .background {
                    if theme == .system {
                        LinearGradient(stops: [.init(color: p.night, location: 0.5), .init(color: light.night, location: 0.5)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    } else {
                        p.night
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(.white.opacity(0.08)))
                HStack {
                    Text(theme.label).font(.subheadline.weight(.bold)).foregroundStyle(palette.ink)
                    Spacer()
                    if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(palette.roseSoft) }
                }
                Text(theme.description).font(.caption2).foregroundStyle(palette.mist).lineLimit(2).multilineTextAlignment(.leading)
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(palette.dusk))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(selected ? palette.rose : .clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: 시트

struct AddToPlaylistSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let tracks: [Track]
    @State private var state: Loadable<[PlaylistOption]> = .loading

    var body: some View {
        NavigationStack {
            List {
                Button {
                    model.sheet = .newPlaylist(tracks, openAfter: false)
                } label: {
                    Label("새 플레이리스트…", systemImage: "plus")
                }
                switch state {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity)
                case .failed(let message):
                    Text(message).foregroundStyle(.secondary)
                case .loaded(let options):
                    if options.isEmpty { Text("만든 플레이리스트가 없습니다").foregroundStyle(.secondary) }
                    ForEach(options) { option in
                        Button {
                            Task {
                                await model.addTracks(to: option, tracks)
                                dismiss()
                            }
                        } label: {
                            HStack(spacing: 12) {
                                CoverImage(url: option.thumbnail, size: 44, corner: 5)
                                Text(option.title).foregroundStyle(.primary)
                                Spacer()
                                if option.contains { Text("이미 있음").font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
            }
            .navigationTitle(tracks.count == 1 ? "플레이리스트에 추가" : "\(tracks.count)곡을 플레이리스트에 추가")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .task {
            do {
                // 자동 목록(좋아요 표시한 음악 LM, Shorts 사운드 SS)은 직접 곡을 넣는 곳이 아니라 뺀다.
                let options = try await model.api.addToPlaylistOptions(tracks.map(\.videoId)).filter { !["LM", "SS"].contains($0.playlistId) }
                state = .loaded(options)
            } catch {
                state = .failed(AppModel.describe(error))
            }
        }
    }
}

struct NewPlaylistSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let tracks: [Track]
    let openAfter: Bool
    @State private var title = ""
    @State private var description = ""
    @State private var privacy = "PRIVATE"
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("제목", text: $title)
                    TextField("설명(선택)", text: $description, axis: .vertical).lineLimit(2...4)
                }
                Section("공개 범위") {
                    Picker("공개 범위", selection: $privacy) {
                        Text("비공개").tag("PRIVATE")
                        Text("일부 공개").tag("UNLISTED")
                        Text("공개").tag("PUBLIC")
                    }
                    .pickerStyle(.segmented)
                }
                if !tracks.isEmpty {
                    Section { Text(tracks.count == 1 ? "'\(tracks[0].title)'을(를) 넣어 만듭니다." : "\(tracks.count)곡을 넣어 만듭니다.").foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("새 플레이리스트")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("만들기") {
                        busy = true
                        Task {
                            let id = await model.createPlaylist(title: title.trimmingCharacters(in: .whitespaces), description: description, privacy: privacy, tracks: tracks)
                            busy = false
                            if let id {
                                dismiss()
                                if openAfter { model.go(.playlist("VL\(id)")) }
                            }
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct RenamePlaylistSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let playlistId: String
    @State var title: String
    @State var description: String
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("제목", text: $title)
                TextField("설명", text: $description, axis: .vertical).lineLimit(2...5)
            }
            .navigationTitle("플레이리스트 정보")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("저장") {
                        busy = true
                        Task {
                            if await model.renamePlaylist(playlistId, title: title.trimmingCharacters(in: .whitespaces), description: description) { dismiss() }
                            busy = false
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
