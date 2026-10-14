// 둘러보기: 최신 음악 · YouTube Music 인기 차트(나라별) · 분위기와 장르 (src/views/ExploreView.tsx와 같은 내용).
import SwiftUI

struct ExploreView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    @AppStorage("ytm:ytm-chart-country") private var country = "KR"
    @State private var moods: Loadable<MoodsPage> = .loading
    @State private var releases: Loadable<BrowsePage> = .loading
    @State private var charts: Loadable<BrowsePage> = .loading

    /// YouTube Music 차트 나라(ExploreView.tsx YTM_CHART_COUNTRIES와 같다)
    static let countries: [(code: String, label: String)] = [
        ("KR", "한국"), ("ZZ", "전 세계"), ("US", "미국"), ("JP", "일본"), ("GB", "영국"), ("FR", "프랑스"), ("DE", "독일"),
        ("CA", "캐나다"), ("AU", "호주"), ("BR", "브라질"), ("MX", "멕시코"), ("IN", "인도"), ("ID", "인도네시아"), ("PH", "필리핀"),
    ]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 30) {
                shortcuts
                Text("최신 음악").font(.title2.bold()).foregroundStyle(palette.ink).padding(.horizontal, 16).padding(.bottom, -16)
                section(releases, empty: "최신 음악이 없습니다") { page in
                    ForEach(Array(page.shelves.prefix(2).enumerated()), id: \.offset) { _, shelf in
                        ShelfSection(shelf: shelf, trackLimit: 5)
                    }
                }
                chartSection
                moodSection
            }
            .padding(.vertical, 12)
        }
        .background(palette.night)
        .navigationTitle("둘러보기")
        .refreshable { await loadAll() }
        .task(id: model.status.loggedIn) { await loadAll() }
        .task(id: country) { await loadCharts() }
    }

    /// 다른 차트·통계로 가는 단추
    private var shortcuts: some View {
        HStack(spacing: 10) {
            shortcut("음원 차트", symbol: "chart.bar.fill", sub: "멜론·지니·Spotify 등") { model.openCharts() }
            shortcut("청취 통계", symbol: "chart.pie.fill", sub: "이 기기에서 들은 곡") { model.go(.stats) }
        }
        .padding(.horizontal, 16)
    }

    private func shortcut(_ title: String, symbol: String, sub: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: symbol)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(palette.onAccent)
                    .frame(width: 40, height: 40)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(palette.accent))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.subheadline.weight(.bold)).foregroundStyle(palette.ink)
                    Text(sub).font(.caption2).foregroundStyle(palette.mist).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(10)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(palette.dusk))
        }
        .buttonStyle(.plain)
    }

    // MARK: YouTube Music 차트

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("YouTube Music 차트").font(.title2.bold()).foregroundStyle(palette.ink)
                Spacer()
                Menu {
                    Picker("나라", selection: $country) {
                        ForEach(Self.countries, id: \.code) { c in Text(c.label).tag(c.code) }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(Self.countries.first { $0.code == country }?.label ?? "한국")
                        Image(systemName: "chevron.up.chevron.down").font(.caption2)
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .foregroundStyle(palette.ink)
                    .background(Capsule().fill(palette.plum))
                }
                .accessibilityLabel("차트 나라 고르기")
            }
            .padding(.horizontal, 16)
            section(charts, empty: "이 나라 차트가 없습니다") { page in
                ForEach(Array(page.shelves.enumerated()), id: \.offset) { _, shelf in
                    ShelfSection(shelf: shelf, trackLimit: 10, pagedTracks: true)
                }
            }
        }
    }

    // MARK: 분위기와 장르

    private var moodSection: some View {
        VStack(alignment: .leading, spacing: 22) {
            switch moods {
            case .loading:
                LoadingView()
            case .failed(let message):
                ErrorView(message: message) { Task { await loadMoods() } }
            case .loaded(let page):
                ForEach(page.sections, id: \.title) { group in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(group.title).font(.title3.bold()).foregroundStyle(palette.ink).padding(.horizontal, 16)
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                            ForEach(group.items, id: \.self) { item in
                                MoodButton(item: item)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func section<V: View>(_ state: Loadable<BrowsePage>, empty: String, @ViewBuilder content: (BrowsePage) -> V) -> some View {
        switch state {
        case .loading:
            LoadingView()
        case .failed(let message):
            ErrorView(message: message) { Task { await loadAll() } }
        case .loaded(let page):
            if page.shelves.isEmpty {
                Text(empty).foregroundStyle(palette.mist).padding(.horizontal, 16)
            } else {
                content(page)
            }
        }
    }

    // MARK: 불러오기

    private func loadAll() async {
        async let a: Void = loadMoods()
        async let b: Void = loadReleases()
        async let c: Void = loadCharts()
        _ = await (a, b, c)
    }

    private func loadMoods() async {
        do { moods = .loaded(try await model.api.moods()) } catch { if moods.value == nil { moods = .failed(AppModel.describe(error)) } }
    }

    private func loadReleases() async {
        do { releases = .loaded(try await model.api.newReleases()) } catch { if releases.value == nil { releases = .failed(AppModel.describe(error)) } }
    }

    private func loadCharts() async {
        let code = country
        if charts.value == nil { charts = .loading }
        do {
            let page = try await model.api.ytmCharts(code)
            if code == country { charts = .loaded(page) }
        } catch {
            if code == country { charts = .failed(AppModel.describe(error)) }
        }
    }
}

/// 분위기·장르 단추(왼쪽에 YouTube Music이 정한 색 띠)
private struct MoodButton: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    let item: MoodItem

    var body: some View {
        Button {
            model.go(.browse(id: item.browseId, params: item.params, title: item.label))
        } label: {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 3).fill(Self.color(item.color).map { AnyShapeStyle($0) } ?? AnyShapeStyle(palette.accent)).frame(width: 6)
                Text(item.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 12)
            .padding(.leading, 8)
            .padding(.trailing, 10)
            .frame(height: 48)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(palette.dusk))
        }
        .buttonStyle(.plain)
    }

    static func color(_ hex: String?) -> Color? {
        guard let hex, hex.hasPrefix("#"), let v = UInt32(hex.dropFirst(), radix: 16) else { return nil }
        return Color(hex: v)
    }
}
