// 둘러보기 화면: 홈, 검색, 아티스트, "모두 보기" 목록.
import SwiftUI

// MARK: 홈

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    @State private var state: Loadable<HomePage> = .loading

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 30) {
                if let name = model.account?.name {
                    Text("\(name)님을 위한 음악")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(palette.mist)
                        .padding(.horizontal, 16)
                        .padding(.bottom, -18)
                }
                chartChip
                switch state {
                case .loading:
                    LoadingView()
                case .failed(let message):
                    ErrorView(message: message) { Task { await load() } }
                case .loaded(let page):
                    ForEach(Array(page.shelves.enumerated()), id: \.offset) { _, shelf in
                        ShelfSection(shelf: shelf, trackLimit: 8, pagedTracks: true)
                    }
                    if let c = page.continuation {
                        LoadMoreRow { await more(c) }
                    }
                }
            }
            .padding(.vertical, 12)
        }
        .background(palette.night)
        .navigationTitle("홈")
        .settingsButton(model)
        .refreshable { await load() }
        .task(id: model.status.loggedIn) { await load() }
    }

    private var chartChip: some View {
        Button {
            model.openCharts()
        } label: {
            HStack(spacing: 12) {
                Text("100")
                    .font(.system(size: 17, weight: .black))
                    .foregroundStyle(palette.onAccent)
                    .frame(width: 48, height: 48)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(palette.accent))
                VStack(alignment: .leading, spacing: 2) {
                    Text("인기 차트").font(.headline).foregroundStyle(palette.ink)
                    Text("멜론·지니·벅스·FLO·Spotify·빌보드 등 76개 차트를 YouTube Music으로")
                        .font(.caption)
                        .foregroundStyle(palette.mist)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(palette.faint)
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(palette.dusk))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
    }

    private func load() async {
        if state.value == nil { state = .loading }
        do { state = .loaded(try await model.api.home()) } catch { state = .failed(AppModel.describe(error)) }
    }

    private func more(_ c: Continuation) async {
        guard case .loaded(var page) = state, page.continuation == c else { return }
        do {
            let next = try await model.api.homeMore(c)
            page.shelves += next.shelves
            page.continuation = next.continuation
        } catch {
            log("[home] 더 불러오기 실패: \(error)")
            page.continuation = nil
        }
        state = .loaded(page)
    }
}

// MARK: 검색

struct SearchView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    @State private var query = ""
    @State private var params: String?
    @State private var state: Loadable<SearchResult>?
    @State private var suggestions: Suggestions?

    var body: some View {
        @Bindable var model = model
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 26) {
                if query.isEmpty {
                    ContentUnavailableView("무엇을 듣고 싶으세요?", systemImage: "magnifyingglass", description: Text("노래 제목, 아티스트, 앨범 이름으로 찾아보세요."))
                        .padding(.top, 60)
                } else {
                    results
                }
            }
            .padding(.vertical, 12)
        }
        .background(palette.night)
        .navigationTitle("검색")
        .searchable(text: $model.searchText, prompt: "노래, 앨범, 아티스트 검색")
        .searchSuggestions {
            if let s = suggestions, model.searchText.trimmingCharacters(in: .whitespaces) != query {
                ForEach(s.queries.prefix(6), id: \.self) { q in
                    Label(q, systemImage: "magnifyingglass").searchCompletion(q)
                }
                ForEach(Array(s.cards.prefix(3).enumerated()), id: \.offset) { _, card in
                    Button {
                        if let id = card.browseId { model.go(routeForBrowse(id, params: card.params, title: card.title)) }
                    } label: {
                        HStack {
                            CoverImage(url: card.thumbnail, size: 36, round: card.isRound)
                            VStack(alignment: .leading) {
                                Text(card.title).lineLimit(1)
                                Text(card.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                    }
                }
                ForEach(Array(s.tracks.prefix(3).enumerated()), id: \.offset) { _, track in
                    Button {
                        model.playTrack(track)
                    } label: {
                        HStack {
                            CoverImage(url: track.thumbnail, size: 36)
                            VStack(alignment: .leading) {
                                Text(track.title).lineLimit(1)
                                Text(track.artistLine).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                    }
                }
            }
        }
        .onSubmit(of: .search) { submit(model.searchText) }
        .task(id: model.searchText) {
            let text = model.searchText.trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty, text != query else {
                suggestions = nil
                return
            }
            try? await Task.sleep(for: .milliseconds(180))
            guard !Task.isCancelled else { return }
            suggestions = try? await model.api.suggestions(text)
        }
        .task(id: "\(query)\u{1}\(params ?? "")") { await load() }
        .onChange(of: model.searchRequest, initial: true) { _, request in
            guard let request else { return }
            model.searchRequest = nil
            model.searchText = request
            submit(request)
        }
    }

    private func submit(_ text: String) {
        let q = text.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        params = nil
        query = q
    }

    @ViewBuilder
    private var results: some View {
        switch state {
        case .none, .loading?:
            LoadingView(label: "'\(query)' 찾는 중…")
        case .failed(let message)?:
            ErrorView(message: message) { Task { await load() } }
        case .loaded(let data)?:
            chips(data)
            if params == nil, let top = data.top, top.card != nil || top.track != nil {
                topResult(top)
            }
            if data.shelves.isEmpty && data.top == nil {
                ContentUnavailableView("'\(query)' 검색 결과가 없습니다", systemImage: "magnifyingglass", description: Text("철자를 확인하거나 다른 단어로 찾아보세요."))
            } else if params != nil, let single = data.shelves.first {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(single.tracks.enumerated()), id: \.offset) { _, track in
                        TrackRow(track: track).padding(.horizontal, 16).padding(.vertical, 5)
                    }
                    if !single.cards.isEmpty { CardGrid(cards: single.cards) }
                    if let c = single.continuation { LoadMoreRow { await more(c) } }
                }
            } else {
                ForEach(Array(data.shelves.enumerated()), id: \.offset) { _, shelf in
                    ShelfSection(shelf: shelf, trackLimit: 6)
                }
            }
        }
    }

    private func chips(_ data: SearchResult) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                chip(L("전체"), on: params == nil) { params = nil }
                ForEach(data.chips, id: \.label) { c in
                    chip(c.label, on: c.selected) { params = c.selected ? nil : c.params }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
    }

    private func chip(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .foregroundStyle(on ? palette.night : palette.ink)
                .background(Capsule().fill(on ? palette.ink : palette.plum))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func topResult(_ top: TopResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("최상위 결과").font(.title3.bold()).padding(.horizontal, 16)
            if let card = top.card {
                Button {
                    if let id = card.browseId { model.go(routeForBrowse(id, params: card.params, title: card.title)) }
                } label: {
                    HStack(spacing: 14) {
                        CoverImage(url: card.thumbnail, size: 84, round: card.isRound, corner: 8)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(card.title).font(.title3.bold()).foregroundStyle(palette.ink).lineLimit(2)
                            Text([kindLabel(card.kind), card.subtitle.replacingOccurrences(of: #"^[^•]*•\s*"#, with: "", options: .regularExpression)].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.subheadline).foregroundStyle(palette.mist).lineLimit(2)
                        }
                        Spacer()
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(palette.dusk))
                }
                .buttonStyle(.plain)
                .contextMenu { CardMenu(card: card) }
                .padding(.horizontal, 16)
            }
            if let track = top.track {
                TrackRow(track: track).padding(.horizontal, 16)
            }
            ForEach(Array(top.tracks.prefix(4).enumerated()), id: \.offset) { _, track in
                TrackRow(track: track).padding(.horizontal, 16).padding(.vertical, 2)
            }
        }
    }

    private func load() async {
        guard !query.isEmpty else {
            state = nil
            return
        }
        state = .loading
        do {
            state = .loaded(try await model.api.search(query, params: params))
        } catch {
            state = .failed(AppModel.describe(error))
        }
    }

    private func more(_ c: Continuation) async {
        guard case .loaded(var data)? = state, var first = data.shelves.first, first.continuation == c else { return }
        do {
            let page = try await model.api.searchMore(c)
            first.tracks += page.tracks
            first.cards += page.cards
            first.continuation = page.continuation
        } catch {
            log("[search] 더 불러오기 실패: \(error)")
            first.continuation = nil
        }
        data.shelves[0] = first
        state = .loaded(data)
    }
}

// MARK: 아티스트

struct ArtistView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    let id: String
    @State private var state: Loadable<ArtistPage> = .loading
    @State private var subscribed: Bool?
    @State private var subscribing = false

    var body: some View {
        ScrollView {
            switch state {
            case .loading:
                LoadingView()
            case .failed(let message):
                ErrorView(message: message) { Task { await load() } }
            case .loaded(let a):
                LazyVStack(alignment: .leading, spacing: 30) {
                    hero(a)
                    ForEach(Array(a.shelves.enumerated()), id: \.offset) { _, shelf in
                        ShelfSection(shelf: shelf, trackLimit: 5)
                    }
                    if let about = a.description, !about.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("소개").font(.title3.bold())
                            Text(about).foregroundStyle(palette.mist).textSelection(.enabled)
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 24)
            }
        }
        .background(palette.night)
        .ignoresSafeArea(edges: .top)
        .navigationTitle(state.value?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: id) { await load() }
    }

    private func hero(_ a: ArtistPage) -> some View {
        ZStack(alignment: .bottomLeading) {
            // 이미지가 화면보다 크게 잡혀 배치를 밀지 않게 빈 칸 위에 얹어 자른다.
            Color.clear
                .frame(maxWidth: .infinity)
                .frame(height: 360)
                .overlay {
                    AsyncImage(url: a.thumbnail.flatMap { URL(string: $0) }) { phase in
                        if case .success(let image) = phase { image.resizable().scaledToFill() } else { palette.dusk }
                    }
                }
                .clipped()
            LinearGradient(colors: [palette.night.opacity(0.1), palette.night.opacity(0.4), palette.night], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 8) {
                Text(a.name)
                    .font(.system(size: 40, weight: .black))
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                if let subs = a.subscribers { Text(subs).foregroundStyle(palette.mist) }
                HStack(spacing: 10) {
                    if let shuffle = a.shuffle {
                        PillButton(title: "셔플 재생", systemImage: "shuffle", prominent: true) { model.playEndpoint(shuffle, failure: "셔플 재생하지 못했습니다") }
                    }
                    if let radio = a.radio {
                        PillButton(title: "라디오", systemImage: "dot.radiowaves.left.and.right") { model.playEndpoint(radio, failure: "라디오를 시작하지 못했습니다") }
                    }
                    if let channelId = a.channelId {
                        let on = subscribed ?? a.subscribed ?? false
                        Button {
                            subscribing = true
                            Task {
                                if await model.setSubscribed(channelId, name: a.name, on: !on, params: a.subscribeParams) { subscribed = !on }
                                subscribing = false
                            }
                        } label: {
                            Text(on ? "구독 중" : "구독")
                                .font(.subheadline.weight(.bold))
                                .padding(.horizontal, 16)
                                .frame(height: 46)
                                .foregroundStyle(on ? palette.ink : palette.night)
                                .background(Capsule().fill(on ? AnyShapeStyle(palette.plum) : AnyShapeStyle(palette.ink)))
                        }
                        .buttonStyle(.plain)
                        .disabled(subscribing)
                        .accessibilityLabel(on ? "구독 취소" : "구독")
                    }
                }
                .padding(.top, 4)
            }
            .foregroundStyle(palette.ink)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    private func load() async {
        do { state = .loaded(try await model.api.artist(id)) } catch { state = .failed(AppModel.describe(error)) }
    }
}

// MARK: "모두 보기" 목록

struct BrowseView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    let id: String
    let params: String?
    let title: String?
    @State private var state: Loadable<BrowsePage> = .loading

    var body: some View {
        ScrollView {
            switch state {
            case .loading:
                LoadingView()
            case .failed(let message):
                ErrorView(message: message) { Task { await load() } }
            case .loaded(let data):
                if data.shelves.isEmpty {
                    ContentUnavailableView("보여 줄 항목이 없습니다", systemImage: "music.note.list")
                } else {
                    LazyVStack(alignment: .leading, spacing: 28) {
                        ForEach(Array(data.shelves.enumerated()), id: \.offset) { _, shelf in
                            ShelfSection(shelf: data.shelves.count > 1 ? shelf : Shelf(title: "", tracks: shelf.tracks, cards: shelf.cards), grid: true)
                        }
                    }
                    .padding(.vertical, 12)
                }
            }
        }
        .background(palette.night)
        .navigationTitle(state.value?.title.isEmpty == false ? state.value!.title : (title ?? L("목록")))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(id)\(params ?? "")") { await load() }
    }

    private func load() async {
        do { state = .loaded(try await model.api.browse(id, params: params)) } catch { state = .failed(AppModel.describe(error)) }
    }
}
