// 내 청취 통계(이 기기에서 들은 기록): 들은 시간, 날짜별 막대, 많이 들은 곡·아티스트 (src/views/StatsView.tsx와 같다).
import Charts
import SwiftUI

struct StatsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var palette
    @State private var range = "week"
    @State private var summary: StatsSummary?
    @State private var confirmClear = false

    private static let ranges = [("week", "최근 7일"), ("month", "최근 30일"), ("year", "최근 1년"), ("all", "전체")]

    var body: some View {
        List {
            Section {
                Picker("기간", selection: $range) {
                    ForEach(Self.ranges, id: \.0) { Text($0.1).tag($0.0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }
            if let s = summary {
                if s.playCount == 0 {
                    ContentUnavailableView("아직 기록이 없습니다", systemImage: "chart.bar", description: Text("30초 넘게 들은 곡부터 이 기기에 기록됩니다."))
                        .listRowBackground(Color.clear)
                } else {
                    Section { totals(s) }
                        .listRowBackground(palette.dusk)
                    Section("날짜별 들은 시간") { chart(s) }
                        .listRowBackground(palette.dusk)
                    Section("많이 들은 곡") {
                        ForEach(Array(s.topTracks.enumerated()), id: \.element.id) { i, t in
                            Button {
                                model.playEndpoint(Endpoints.mix(t.id), what: "믹스를 시작")
                            } label: {
                                HStack(spacing: 12) {
                                    Text("\(i + 1)").font(.headline.monospacedDigit()).foregroundStyle(palette.mist).frame(width: 24)
                                    CoverImage(url: t.artwork, size: 44, corner: 5)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(t.title).font(.body.weight(.semibold)).foregroundStyle(palette.ink).lineLimit(1)
                                        Text(t.artist).font(.subheadline).foregroundStyle(palette.mist).lineLimit(1)
                                    }
                                    Spacer()
                                    Text("\(t.count)회").font(.subheadline.monospacedDigit()).foregroundStyle(palette.mist)
                                }
                            }
                            .accessibilityHint("이 곡으로 믹스 재생")
                        }
                    }
                    .listRowBackground(palette.dusk)
                    Section("많이 들은 아티스트") {
                        ForEach(Array(s.topArtists.enumerated()), id: \.element.id) { i, a in
                            HStack(spacing: 12) {
                                Text("\(i + 1)").font(.headline.monospacedDigit()).foregroundStyle(palette.mist).frame(width: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(a.name).font(.body.weight(.semibold)).foregroundStyle(palette.ink).lineLimit(1)
                                    Text(Self.listen(a.seconds)).font(.subheadline).foregroundStyle(palette.mist)
                                }
                                Spacer()
                                Text("\(a.count)회").font(.subheadline.monospacedDigit()).foregroundStyle(palette.mist)
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { model.search(a.name) }
                            .accessibilityAddTraits(.isButton)
                        }
                    }
                    .listRowBackground(palette.dusk)
                }
            } else {
                LoadingView().listRowBackground(Color.clear)
            }
            Section {
                Text("이 기기에서 30초 넘게(짧은 곡은 절반 넘게) 들은 곡만 셉니다. YouTube Music 계정의 재생 기록은 보관함 › 최근 재생에 있습니다.")
                    .font(.footnote)
                    .foregroundStyle(palette.mist)
            }
            .listRowBackground(Color.clear)
        }
        .scrollContentBackground(.hidden)
        .background(palette.night)
        .navigationTitle("청취 통계")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("기록 지우기") { confirmClear = true }
                    .disabled(summary?.playCount ?? 0 == 0)
            }
        }
        .confirmationDialog("청취 기록 지우기", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("지우기", role: .destructive) {
                Task {
                    await model.api.clearPlays()
                    await load()
                }
            }
        } message: {
            Text("이 기기에 남은 청취 기록을 모두 지웁니다. YouTube Music 계정의 재생 기록은 그대로입니다.")
        }
        .task(id: range) { await load() }
        .refreshable { await load() }
    }

    private func totals(_ s: StatsSummary) -> some View {
        HStack(alignment: .top) {
            total(Self.listen(s.totalSeconds), "들은 시간")
            total("\(s.playCount)곡", "재생")
            total(s.topArtists.first?.name ?? "-", "가장 많이 들은 아티스트")
        }
        .padding(.vertical, 6)
    }

    private func total(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value).font(.title3.weight(.heavy)).foregroundStyle(palette.ink).lineLimit(1).minimumScaleFactor(0.6)
            Text(label).font(.caption).foregroundStyle(palette.mist).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func chart(_ s: StatsSummary) -> some View {
        Chart(Array(s.days.enumerated()), id: \.offset) { i, d in
            BarMark(x: .value("날짜", i), y: .value("분", d.seconds / 60))
                .foregroundStyle(LinearGradient(colors: [palette.rose, palette.violet], startPoint: .top, endPoint: .bottom))
                .cornerRadius(3)
        }
        .chartXAxis {
            AxisMarks(values: Array(s.days.indices)) { value in
                if let i = value.as(Int.self), i < s.days.count, s.days.count <= 7 || i % 5 == 0 || i == s.days.count - 1 {
                    AxisValueLabel(s.days[i].label)
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                AxisGridLine()
                if let m = value.as(Double.self) {
                    AxisValueLabel(m == m.rounded() ? "\(Int(m))분" : String(format: "%.1f분", m))
                }
            }
        }
        .chartYScale(domain: 0...max(1, (s.days.map(\.seconds).max() ?? 0) / 60 * 1.1))
        .frame(height: 170)
        .padding(.vertical, 8)
        .accessibilityLabel("날짜별 들은 시간")
    }

    private func load() async {
        await model.api.flushPlays()
        summary = try? await model.api.statsSummary(range)
    }

    static func listen(_ seconds: Double) -> String {
        let m = Int((seconds / 60).rounded())
        return m < 60 ? "\(m)분" : "\(m / 60)시간 \(m % 60)분"
    }
}
