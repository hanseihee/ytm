// 차트 목록 표: 출처별 받아 올 주소와 해석 함수를 한곳에 모았다.
// 네트워크는 앱(데스크톱 Rust, iOS Swift)이 하고, 여기는 받은 글(HTML·JSON)을 곡 목록으로 바꾸기만 한다.
//
// 받는 순서(loadChart가 그대로 한다. 모든 요청에 SAFARI_HEADERS + 항목의 headers):
//  1) url을 GET
//  2) followUp이 있으면(써클차트) 1)의 글로 두 번째 요청(POST)을 만들어 받고 → parse(두 번째 글, [1)의 글])
//  3) moreUrls가 있으면(지니 51~200위) 모두 GET → parse(1)의 글, [나머지 글…])
//  4) 그 밖은 parse(1)의 글)
// 해석이 실패하면 '<출처>_format_changed'(예: 'genie_format_changed')를 던진다 — describeChartError로 안내(지금 언어).
// 이름(label·group)은 한국어 원문(번역 열쇠)으로 두고, 화면 이름은 chartName·chartChipName(지금 언어)으로 만든다.
// 곡 길이(durationMs)는 2026-10-14 기준 어느 차트에도 없어 모두 0이다.
import { t, tk } from '../../i18n';
import { APPLE_COUNTRIES, appleChartId, appleTopSongsUrl, parseAppleTopSongs } from './apple';
import { BILLBOARD_HOT100, BILLBOARD_HOT100_URL, parseBillboardHot100 } from './billboard';
import { BUGS_REALTIME, BUGS_REALTIME_URL, parseBugsChart } from './bugs';
import { CIRCLE_DIGITAL, CIRCLE_DIGITAL_PAGE, circleDigitalRequest, parseCircleDigital } from './circle';
import { FLO_CHART, FLO_CHART_URL, parseFloChart } from './flo';
import { GENIE_TOP200, GENIE_TOP200_URLS, parseGenieTop200 } from './genie';
import {
  MELON_GENRES,
  MELON_TOP100,
  melonChartChip,
  melonChartId,
  melonChartName,
  melonChartTitle,
  melonChartUrl,
  parseMelonPeriodChart,
  parseMelonRealtime,
  type MelonPeriod,
} from './melonExtra';
import { regionName, SAFARI_HEADERS, type ChartPlaylist, type ChartRequest } from './util';
import { VIBE_CHARTS, VIBE_HEADERS, parseVibeChart, vibeChartUrl, type VibeChartKind } from './vibe';

export type { ChartPlaylist, ChartRequest, ChartTrack } from './util';
export { regionName, SAFARI_HEADERS, SAFARI_UA } from './util';

export type ChartSourceId = 'melon' | 'genie' | 'bugs' | 'flo' | 'vibe' | 'circle' | 'billboard' | 'apple';

/** 출처 이름(번역 열쇠). 화면에 낼 때는 t(…) */
export const CHART_SOURCE_NAMES: Record<ChartSourceId, string> = {
  melon: tk('멜론'),
  genie: tk('지니'),
  bugs: tk('벅스'),
  flo: 'FLO',
  vibe: 'VIBE',
  circle: tk('써클차트'),
  billboard: tk('빌보드'),
  apple: 'Apple Music',
};

export interface ChartEntry {
  /** 앱 안 고유 id = parse 결과의 playlist.id (예: 'genie-top200') */
  id: string;
  source: ChartSourceId;
  /** 한국어 이름(번역 열쇠 겸 기본 이름). 화면 이름은 chartName(id) */
  label: string;
  /** 화면 묶음 이름(CHART_GROUPS 중 하나, 번역 열쇠). 화면에 낼 때는 t(group) */
  group: string;
  /** 지금 언어의 이름(label이 나라·기간 등을 조합한 이름일 때). 없으면 t(label) */
  title?: () => string;
  /** 고르기 칩의 짧은 이름(묶음 이름과 겹치는 "멜론 "·"Apple Music "을 뺀 것). 없으면 title */
  chip?: () => string;
  /** 받아 올 주소(GET) */
  url: string;
  /** SAFARI_HEADERS에 더할 머리글(VIBE: Accept: application/json) */
  headers?: Record<string, string>;
  /** 이어 받을 주소들(지니 2~4쪽). 받은 글을 순서대로 parse의 more로 */
  moreUrls?: string[];
  /** 첫 글로 두 번째 요청을 만든다(써클차트: 페이지 → POST). parse(두 번째 글, [첫 글]) */
  followUp?: (firstText: string) => ChartRequest;
  parse: (text: string, more?: string[]) => ChartPlaylist;
}

/** 화면 묶음 순서(번역 열쇠). 화면에 낼 때는 t(…) */
export const CHART_GROUPS = [tk('멜론'), tk('멜론 장르'), tk('국내 음원'), tk('해외'), 'Apple Music'] as const;

const melonPeriod = (period: MelonPeriod, classCd = 'GN0000', group = tk('멜론')): ChartEntry => ({
  id: melonChartId(period, classCd),
  source: 'melon',
  label: melonChartName(period, classCd),
  title: () => melonChartTitle(period, classCd),
  chip: () => melonChartChip(period, classCd),
  group,
  url: melonChartUrl(period, classCd),
  parse: (text) => parseMelonPeriodChart(text, period, classCd),
});

const vibe = (kind: VibeChartKind): ChartEntry => ({
  id: VIBE_CHARTS[kind].id,
  source: 'vibe',
  label: VIBE_CHARTS[kind].name,
  group: tk('국내 음원'),
  url: vibeChartUrl(kind),
  headers: VIBE_HEADERS,
  parse: (text) => parseVibeChart(text, kind),
});

export const CHART_LIST: ChartEntry[] = [
  // 멜론: 실시간(기존 melon.ts 해석 재사용) + 일간·주간·월간
  {
    id: MELON_TOP100,
    source: 'melon',
    label: tk('멜론 TOP 100'),
    chip: () => 'TOP 100',
    group: tk('멜론'),
    url: 'https://www.melon.com/chart/index.htm',
    parse: (text) => parseMelonRealtime(text),
  },
  melonPeriod('day'),
  melonPeriod('week'),
  melonPeriod('month'),
  // 멜론 장르별(일간). 주간·월간 장르는 melonPeriod('week', 'GN0100')처럼 같은 방법으로 만들 수 있다.
  ...MELON_GENRES.filter((g) => g.code !== 'GN0000').map((g) => melonPeriod('day', g.code, tk('멜론 장르'))),
  // 국내 음원
  {
    id: GENIE_TOP200,
    source: 'genie',
    label: tk('지니 TOP 200'),
    group: tk('국내 음원'),
    url: GENIE_TOP200_URLS[0],
    moreUrls: GENIE_TOP200_URLS.slice(1),
    parse: (text, more) => parseGenieTop200(text, more),
  },
  {
    id: BUGS_REALTIME,
    source: 'bugs',
    label: tk('벅스 실시간 차트'),
    group: tk('국내 음원'),
    url: BUGS_REALTIME_URL,
    parse: (text) => parseBugsChart(text),
  },
  {
    id: FLO_CHART,
    source: 'flo',
    label: tk('FLO 차트'),
    group: tk('국내 음원'),
    url: FLO_CHART_URL,
    parse: (text) => parseFloChart(text),
  },
  vibe('total'),
  vibe('domestic'),
  vibe('oversea'),
  {
    id: CIRCLE_DIGITAL,
    source: 'circle',
    label: tk('써클차트 디지털'),
    group: tk('국내 음원'),
    url: CIRCLE_DIGITAL_PAGE,
    followUp: circleDigitalRequest,
    parse: (text, more) => parseCircleDigital(text, more),
  },
  // 해외
  {
    id: BILLBOARD_HOT100,
    source: 'billboard',
    label: tk('빌보드 Hot 100'),
    group: tk('해외'),
    url: BILLBOARD_HOT100_URL,
    parse: (text) => parseBillboardHot100(text),
  },
  ...APPLE_COUNTRIES.map(
    (c): ChartEntry => ({
      id: appleChartId(c.code),
      source: 'apple',
      label: `Apple Music ${c.label} 인기곡`,
      title: () => t('Apple Music {country} 인기곡', { country: regionName(c.code, c.label) }),
      chip: () => t('{country} 인기곡', { country: regionName(c.code, c.label) }),
      group: 'Apple Music',
      url: appleTopSongsUrl(c.code),
      parse: (text) => parseAppleTopSongs(text, c.code),
    }),
  ),
];

export const chartEntry = (id: string) => CHART_LIST.find((c) => c.id === id);

/** 지금 언어의 차트 이름(예: "멜론 일간 TOP 100" → en "Melon Daily TOP 100"). 모르는 id면 undefined */
export function chartName(id: string): string | undefined {
  const e = chartEntry(id);
  return e && (e.title ? e.title() : t(e.label));
}

/** 고르기 칩의 짧은 이름(지금 언어). 멜론·Apple Music은 묶음 이름과 겹치는 앞말을 뺀다. 모르는 id면 undefined */
export function chartChipName(id: string): string | undefined {
  const e = chartEntry(id);
  return e && (e.chip ? e.chip() : chartName(id));
}

/** 요청에 실을 머리글 전체 */
export const headersFor = (req: ChartRequest): Record<string, string> => ({ ...SAFARI_HEADERS, ...req.headers });

/** 요청 하나를 받아 본문 글을 돌려주는 앱 쪽 함수(데스크톱: Rust 명령, iOS: Swift 통로) */
export type ChartFetchText = (req: ChartRequest) => Promise<string>;

/** 위 "받는 순서" 그대로 받아 해석한다. 네트워크는 fetchText(앱)가 한다. */
export async function loadChart(entry: ChartEntry, fetchText: ChartFetchText): Promise<ChartPlaylist> {
  const first = await fetchText({ url: entry.url, method: 'GET', headers: entry.headers });
  if (entry.followUp) return entry.parse(await fetchText(entry.followUp(first)), [first]);
  if (entry.moreUrls?.length) {
    const more = await Promise.all(entry.moreUrls.map((url) => fetchText({ url, method: 'GET', headers: entry.headers })));
    return entry.parse(first, more);
  }
  return entry.parse(first);
}

/** '<출처>_format_changed' → 안내 문장(지금 언어). 그 밖은 그대로 */
export function describeChartError(err: unknown): string {
  const m = String(err instanceof Error ? err.message : err);
  const hit = m.match(/^([a-z]+)_format_changed/);
  const name = hit && CHART_SOURCE_NAMES[hit[1] as ChartSourceId];
  return name ? t('{source} 차트 형식이 바뀌어 곡 목록을 읽지 못했습니다.', { source: t(name) }) : m;
}
