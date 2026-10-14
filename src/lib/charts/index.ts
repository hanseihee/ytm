// 차트 목록 표: 출처별 받아 올 주소와 해석 함수를 한곳에 모았다.
// 네트워크는 앱(데스크톱 Rust, iOS Swift)이 하고, 여기는 받은 글(HTML·JSON)을 곡 목록으로 바꾸기만 한다.
//
// 받는 순서(loadChart가 그대로 한다. 모든 요청에 SAFARI_HEADERS + 항목의 headers):
//  1) url을 GET
//  2) followUp이 있으면(써클차트) 1)의 글로 두 번째 요청(POST)을 만들어 받고 → parse(두 번째 글, [1)의 글])
//  3) moreUrls가 있으면(지니 51~200위) 모두 GET → parse(1)의 글, [나머지 글…])
//  4) 그 밖은 parse(1)의 글)
// 해석이 실패하면 '<출처>_format_changed'(예: 'genie_format_changed')를 던진다 — describeChartError로 한국어 안내.
// 곡 길이(durationMs)는 2026-10-14 기준 어느 차트에도 없어 모두 0이다.
import { APPLE_COUNTRIES, appleChartId, appleTopSongsUrl, parseAppleTopSongs } from './apple';
import { BILLBOARD_HOT100, BILLBOARD_HOT100_URL, parseBillboardHot100 } from './billboard';
import { BUGS_REALTIME, BUGS_REALTIME_URL, parseBugsChart } from './bugs';
import { CIRCLE_DIGITAL, CIRCLE_DIGITAL_PAGE, circleDigitalRequest, parseCircleDigital } from './circle';
import { FLO_CHART, FLO_CHART_URL, parseFloChart } from './flo';
import { GENIE_TOP200, GENIE_TOP200_URLS, parseGenieTop200 } from './genie';
import {
  MELON_GENRES,
  MELON_TOP100,
  melonChartId,
  melonChartName,
  melonChartUrl,
  parseMelonPeriodChart,
  parseMelonRealtime,
  type MelonPeriod,
} from './melonExtra';
import { SAFARI_HEADERS, type ChartPlaylist, type ChartRequest } from './util';
import { VIBE_CHARTS, VIBE_HEADERS, parseVibeChart, vibeChartUrl, type VibeChartKind } from './vibe';

export type { ChartPlaylist, ChartRequest, ChartTrack } from './util';
export { SAFARI_HEADERS, SAFARI_UA } from './util';

export type ChartSourceId = 'melon' | 'genie' | 'bugs' | 'flo' | 'vibe' | 'circle' | 'billboard' | 'apple';

export const CHART_SOURCE_NAMES: Record<ChartSourceId, string> = {
  melon: '멜론',
  genie: '지니',
  bugs: '벅스',
  flo: 'FLO',
  vibe: 'VIBE',
  circle: '써클차트',
  billboard: '빌보드',
  apple: 'Apple Music',
};

export interface ChartEntry {
  /** 앱 안 고유 id = parse 결과의 playlist.id (예: 'genie-top200') */
  id: string;
  source: ChartSourceId;
  /** 한국어 표시 이름 = parse 결과의 playlist.name */
  label: string;
  /** 화면 묶음 이름(CHART_GROUPS 중 하나) */
  group: string;
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

/** 화면 묶음 순서 */
export const CHART_GROUPS = ['멜론', '멜론 장르', '국내 음원', '해외', 'Apple Music'] as const;

const melonPeriod = (period: MelonPeriod, classCd = 'GN0000', group = '멜론'): ChartEntry => ({
  id: melonChartId(period, classCd),
  source: 'melon',
  label: melonChartName(period, classCd),
  group,
  url: melonChartUrl(period, classCd),
  parse: (text) => parseMelonPeriodChart(text, period, classCd),
});

const vibe = (kind: VibeChartKind): ChartEntry => ({
  id: VIBE_CHARTS[kind].id,
  source: 'vibe',
  label: VIBE_CHARTS[kind].name,
  group: '국내 음원',
  url: vibeChartUrl(kind),
  headers: VIBE_HEADERS,
  parse: (text) => parseVibeChart(text, kind),
});

export const CHART_LIST: ChartEntry[] = [
  // 멜론: 실시간(기존 melon.ts 해석 재사용) + 일간·주간·월간
  {
    id: MELON_TOP100,
    source: 'melon',
    label: '멜론 TOP 100',
    group: '멜론',
    url: 'https://www.melon.com/chart/index.htm',
    parse: (text) => parseMelonRealtime(text),
  },
  melonPeriod('day'),
  melonPeriod('week'),
  melonPeriod('month'),
  // 멜론 장르별(일간). 주간·월간 장르는 melonPeriod('week', 'GN0100')처럼 같은 방법으로 만들 수 있다.
  ...MELON_GENRES.filter((g) => g.code !== 'GN0000').map((g) => melonPeriod('day', g.code, '멜론 장르')),
  // 국내 음원
  {
    id: GENIE_TOP200,
    source: 'genie',
    label: '지니 TOP 200',
    group: '국내 음원',
    url: GENIE_TOP200_URLS[0],
    moreUrls: GENIE_TOP200_URLS.slice(1),
    parse: (text, more) => parseGenieTop200(text, more),
  },
  {
    id: BUGS_REALTIME,
    source: 'bugs',
    label: '벅스 실시간 차트',
    group: '국내 음원',
    url: BUGS_REALTIME_URL,
    parse: (text) => parseBugsChart(text),
  },
  {
    id: FLO_CHART,
    source: 'flo',
    label: 'FLO 차트',
    group: '국내 음원',
    url: FLO_CHART_URL,
    parse: (text) => parseFloChart(text),
  },
  vibe('total'),
  vibe('domestic'),
  vibe('oversea'),
  {
    id: CIRCLE_DIGITAL,
    source: 'circle',
    label: '써클차트 디지털',
    group: '국내 음원',
    url: CIRCLE_DIGITAL_PAGE,
    followUp: circleDigitalRequest,
    parse: (text, more) => parseCircleDigital(text, more),
  },
  // 해외
  {
    id: BILLBOARD_HOT100,
    source: 'billboard',
    label: '빌보드 Hot 100',
    group: '해외',
    url: BILLBOARD_HOT100_URL,
    parse: (text) => parseBillboardHot100(text),
  },
  ...APPLE_COUNTRIES.map(
    (c): ChartEntry => ({
      id: appleChartId(c.code),
      source: 'apple',
      label: `Apple Music ${c.label} 인기곡`,
      group: 'Apple Music',
      url: appleTopSongsUrl(c.code),
      parse: (text) => parseAppleTopSongs(text, c.code),
    }),
  ),
];

export const chartEntry = (id: string) => CHART_LIST.find((c) => c.id === id);

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

/** '<출처>_format_changed' → 한국어 안내. 그 밖은 그대로 */
export function describeChartError(err: unknown): string {
  const m = String(err instanceof Error ? err.message : err);
  const hit = m.match(/^([a-z]+)_format_changed/);
  const name = hit && CHART_SOURCE_NAMES[hit[1] as ChartSourceId];
  return name ? `${name} 차트 형식이 바뀌어 곡 목록을 읽지 못했습니다.` : m;
}
