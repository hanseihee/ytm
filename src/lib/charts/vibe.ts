// 네이버 VIBE 차트: 오늘 Top 100(매일 오전 7시), 국내 급상승·해외 급상승(매시간).
// 2026-10-14 확인: VIBE 웹이 쓰는 공개 API apis.naver.com/vibeWeb/musicapiweb/vibe/v1/chart/track/{total|domestic|oversea}
// ?start=1&display=100. 머리글 Accept: application/json 이 없으면 XML로 온다.
// → { response: { result: { chart: { title: "오늘 Top 100", chartDate: "10월 14일 오전 7시 업데이트",
//    items: { tracks: [{ trackId, trackTitle, artists[{artistName}], album{albumTitle, imageUrl}, isAdult }] } } } } }.
// 곡 길이는 목록에 없다.
import { t, tk } from '../../i18n';
import { clean, formatChanged, joinArtists, json, type ChartPlaylist, type ChartTrack } from './util';

export type VibeChartKind = 'total' | 'domestic' | 'oversea';

/** name은 번역 열쇠(한국어 원문). 화면에 낼 때는 t(name) */
export const VIBE_CHARTS: Record<VibeChartKind, { id: string; name: string }> = {
  total: { id: 'vibe-today', name: tk('VIBE 오늘 Top 100') },
  domestic: { id: 'vibe-domestic-rising', name: tk('VIBE 국내 급상승') },
  oversea: { id: 'vibe-oversea-rising', name: tk('VIBE 해외 급상승') },
};

export const vibeChartUrl = (kind: VibeChartKind) =>
  `https://apis.naver.com/vibeWeb/musicapiweb/vibe/v1/chart/track/${kind}?start=1&display=100`;

/** VIBE는 이 머리글이 있어야 JSON으로 준다 */
export const VIBE_HEADERS = { Accept: 'application/json' };

interface VibeTrack {
  trackId: number;
  trackTitle: string;
  artists?: { artistName: string }[];
  album?: { albumTitle?: string; imageUrl?: string };
  isAdult?: boolean;
}
interface VibeResponse {
  response?: { result?: { chart?: { title?: string; chartDate?: string; items?: { tracks?: VibeTrack[] } } } };
}

export function parseVibeChart(text: string, kind: VibeChartKind): ChartPlaylist {
  // XML이 왔다면(Accept 머리글 빠짐) 형식 변경과 같은 실패로 알린다.
  const chart = json<VibeResponse>(text, 'vibe').response?.result?.chart;
  const list = chart?.items?.tracks;
  if (!Array.isArray(list)) formatChanged('vibe');
  const tracks: ChartTrack[] = list
    .filter((t) => t && t.trackId && t.trackTitle)
    .map((t) => ({
      id: `vibe-${t.trackId}`,
      title: clean(t.trackTitle),
      artists: joinArtists((t.artists ?? []).map((a) => clean(a.artistName))),
      durationMs: 0,
      explicit: !!t.isAdult,
      album: clean(t.album?.albumTitle) || undefined,
      cover: t.album?.imageUrl,
    }));
  if (!tracks.length) formatChanged('vibe');
  const meta = VIBE_CHARTS[kind];
  return {
    id: meta.id,
    name: t(meta.name),
    // 기준 시각은 VIBE가 한국어로 보내 온 그대로("10월 14일 오전 7시 업데이트")
    subtitle: chart?.chartDate || 'VIBE',
    cover: tracks[0].cover,
    tracks,
  };
}
