// FLO 차트(최근 24시간 집계, 매시간 갱신).
// 2026-10-14 확인: 웹(www.music-flo.com)이 쓰는 공개 JSON
// /api/display/v1/browser/chart/1/track/list?size=100 → { code: "2000000", data: { name: "FLO 차트",
// basedOnUpdate: "24시간 집계 (15시 기준)", trackList: [{ id, name, artistList[{name}], album{title, imgList[{size,url}]}, adultAuthYn }] } }.
// flomuz.io는 주소가 없다(DNS 없음·404). 곡 길이는 목록에 없다.
// 차트 2·3번("일간 종합"·"주간 종합")도 열리지만 둘의 곡이 같고 기간 표시가 어긋나 쓰지 않는다.
import { t } from '../../i18n';
import { clean, formatChanged, joinArtists, json, type ChartPlaylist, type ChartTrack } from './util';

export const FLO_CHART = 'flo-chart';
export const FLO_CHART_URL = 'https://www.music-flo.com/api/display/v1/browser/chart/1/track/list?size=100';

interface FloImage {
  size: number;
  url: string;
}
interface FloTrack {
  id: number;
  name: string;
  representationArtist?: { name: string };
  artistList?: { name: string }[];
  album?: { title?: string; imgList?: FloImage[] };
  adultAuthYn?: string;
}
interface FloResponse {
  code?: string;
  data?: { name?: string; basedOnUpdate?: string; description?: string; trackList?: FloTrack[] };
}

/** 원하는 크기에 가장 가까운 표지 */
function imageOf(list: FloImage[] | undefined, size: number): string | undefined {
  if (!list?.length) return undefined;
  return [...list].sort((a, b) => Math.abs(a.size - size) - Math.abs(b.size - size))[0].url;
}

export function parseFloChart(text: string): ChartPlaylist {
  const res = json<FloResponse>(text, 'flo');
  const list = res.data?.trackList;
  if (!Array.isArray(list)) formatChanged('flo');
  const tracks: ChartTrack[] = list
    .filter((t) => t && t.id && t.name)
    .map((t) => ({
      id: `flo-${t.id}`,
      title: clean(t.name),
      artists: joinArtists((t.artistList?.length ? t.artistList : t.representationArtist ? [t.representationArtist] : []).map((a) => clean(a.name))),
      durationMs: 0,
      explicit: t.adultAuthYn === 'Y',
      album: clean(t.album?.title) || undefined,
      cover: imageOf(t.album?.imgList, 200),
    }));
  if (!tracks.length) formatChanged('flo');
  return {
    id: FLO_CHART,
    // 이름·기준 시각은 FLO가 한국어로 보내 온 그대로 쓴다(없을 때만 우리 문구).
    name: res.data?.name || t('FLO 차트'),
    subtitle: res.data?.basedOnUpdate || t('FLO 최근 24시간'),
    cover: imageOf(list[0]?.album?.imgList, 500),
    tracks,
  };
}
