// 써클차트 디지털 차트(주간, 200위).
// 2026-10-14 확인: 페이지 circlechart.kr/page_chart/onoff.circle?nationGbn=T&serviceGbn=ALL&termGbn=week 원문엔 곡이 없고,
// 페이지 스크립트가 var hitYear = "2026"; var targetTime = "40"; var yearTime = "3"; 을 넣어
// POST /data/api/chart/onoff (form: nationGbn, serviceGbn, termGbn, hitYear, targetTime, yearTime)로 받는다. GET은 405.
// 그래서 두 번 받는다: ① 페이지(GET) → circleDigitalRequest로 ② POST 요청을 만든다 → parseCircleDigital(② 응답, ① 페이지).
// 응답 { List: { "0": { SERVICE_RANKING, SONG_NAME, ARTIST_NAME, ALBUM_NAME, ALBUMIMG(/uploadDir/albumImg/thumb/…), SEQ_MOM }, … },
// FormToMap: { hitYear, targetTime } }. 표지는 thumb만 있고(원본 주소는 404) 곡 길이는 없다.
import { t } from '../../i18n';
import { decode, formatChanged, json, type ChartPlaylist, type ChartRequest, type ChartTrack } from './util';

export const CIRCLE_DIGITAL = 'circle-digital';
export const CIRCLE_DIGITAL_PAGE = 'https://circlechart.kr/page_chart/onoff.circle?nationGbn=T&serviceGbn=ALL&termGbn=week';
export const CIRCLE_DIGITAL_API = 'https://circlechart.kr/data/api/chart/onoff';

const BASE = 'https://circlechart.kr';

const pageVar = (html: string, name: string) => html.match(new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)"`))?.[1];

/** ① 페이지 원문 → ② 곡 목록 POST 요청 */
export function circleDigitalRequest(pageHtml: string): ChartRequest {
  const hitYear = pageVar(pageHtml, 'hitYear');
  const targetTime = pageVar(pageHtml, 'targetTime');
  const yearTime = pageVar(pageHtml, 'yearTime');
  if (!hitYear || !targetTime) formatChanged('circle');
  const form: Record<string, string> = {
    nationGbn: pageVar(pageHtml, 'nationGbn') || 'T',
    serviceGbn: pageVar(pageHtml, 'serviceGbn') || 'ALL',
    termGbn: pageVar(pageHtml, 'termGbn') || 'week',
    hitYear,
    targetTime,
    yearTime: yearTime || '3',
  };
  return {
    url: CIRCLE_DIGITAL_API,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: Object.entries(form)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&'),
  };
}

interface CircleRow {
  SERVICE_RANKING?: string;
  SONG_NAME?: string;
  ARTIST_NAME?: string;
  ALBUM_NAME?: string;
  ALBUMIMG?: string;
  SEQ_MOM?: string;
}
interface CircleResponse {
  List?: Record<string, CircleRow> | CircleRow[];
  FormToMap?: { hitYear?: string; targetTime?: string };
}

/**
 * ② POST 응답(JSON) → 목록. pages[0]에 ① 페이지 원문을 주면 기간("2026.09.27~2026.10.03")을 이름 밑에 쓴다.
 * 형식이 바뀌면 'circle_format_changed'
 */
export function parseCircleDigital(text: string, pages: string[] = []): ChartPlaylist {
  const res = json<CircleResponse>(text, 'circle');
  const rows = res.List ? Object.values(res.List) : [];
  const tracks: ChartTrack[] = rows
    .filter((r) => r && r.SONG_NAME && r.SEQ_MOM)
    .sort((a, b) => Number(a.SERVICE_RANKING) - Number(b.SERVICE_RANKING))
    .map((r) => ({
      id: `circle-${r.SEQ_MOM}`,
      title: decode(r.SONG_NAME!),
      artists: decode(r.ARTIST_NAME ?? ''),
      durationMs: 0,
      explicit: false,
      album: r.ALBUM_NAME ? decode(r.ALBUM_NAME) || undefined : undefined,
      cover: r.ALBUMIMG ? (r.ALBUMIMG.startsWith('/') ? BASE + r.ALBUMIMG : r.ALBUMIMG) : undefined,
    }));
  if (!tracks.length) formatChanged('circle');
  // 페이지의 주 선택 상자: <option value="202640" selected >2026.09.27~2026.10.03 (40)</option>
  const period = pages[0]?.match(/<option value="\d+" selected\s*>\s*([\d.]+\s*~\s*[\d.]+)/)?.[1]?.replace(/\s+/g, '');
  const { hitYear, targetTime } = res.FormToMap ?? {};
  const week = hitYear && targetTime ? t('{year}년 {week}주차', { year: hitYear, week: targetTime }) : '';
  return {
    id: CIRCLE_DIGITAL,
    name: t('써클차트 디지털'),
    subtitle: [period, week].filter(Boolean).join(' · ') || t('써클차트 주간'),
    cover: tracks[0].cover,
    tracks,
  };
}
