// 멜론 일간·주간·월간·장르별 차트.
// 2026-10-14 확인: www.melon.com/chart/{day|week|month}/index.htm?classCd=… 는 실시간 TOP 100(chart/index.htm)과 같은
// <tr class="lst50|lst100" data-song-no="…"> 구조라 melon.ts의 parseMelonChart로 곡을 읽고 id·이름·기준 날짜만 바꾼다.
// 기준 날짜: <div class="calendar_prid"><span class="yyyymmdd"> — 일간 "2026.10.13", 주간 "2026.10.05 ~ 2026.10.11", 월간 "2026.09".
// 장르 코드(classCd)는 차트 페이지의 장르 탭(<li id="GN0100"><a href="/chart/day/index.htm?classCd=GN0100">)에서 확인,
// 일간·주간·월간 모두 같은 목록이다. 곡 길이는 차트에 없다.
import { t, tk } from '../../i18n';
import { MELON_TOP100, parseMelonChart } from '../melon';
import { namedEntity } from './entities';
import { decode, plain, until, ZERO_WIDTH, type ChartPlaylist, type ChartTrack } from './util';

export type MelonPeriod = 'day' | 'week' | 'month';

/** 기간 이름(번역 열쇠). 화면에 낼 때는 t(…) */
export const MELON_PERIOD_LABEL: Record<MelonPeriod, string> = { day: tk('일간'), week: tk('주간'), month: tk('월간') };

export interface MelonGenre {
  /** classCd */
  code: string;
  /** 장르 이름(번역 열쇠, 한국어 원문). 화면 이름은 melonGenreTitle */
  label: string;
  region: '종합' | '국내' | '해외' | '기타';
}

/** 2026-10-14 차트 페이지 장르 탭 그대로(GN1600은 탭에 없다) */
export const MELON_GENRES: MelonGenre[] = [
  { code: 'GN0000', label: tk('장르종합'), region: '종합' },
  { code: 'DM0000', label: tk('국내종합'), region: '종합' },
  { code: 'AB0000', label: tk('해외종합'), region: '종합' },
  { code: 'GN0100', label: tk('발라드'), region: '국내' },
  { code: 'GN0200', label: tk('댄스'), region: '국내' },
  { code: 'GN0300', label: tk('랩/힙합'), region: '국내' },
  { code: 'GN0400', label: 'R&B/Soul', region: '국내' },
  { code: 'GN0500', label: tk('인디음악'), region: '국내' },
  { code: 'GN0600', label: tk('록/메탈'), region: '국내' },
  { code: 'GN0700', label: tk('트로트'), region: '국내' },
  { code: 'GN0800', label: tk('포크/블루스'), region: '국내' },
  { code: 'GN0900', label: 'POP', region: '해외' },
  { code: 'GN1000', label: tk('록/메탈'), region: '해외' },
  { code: 'GN1100', label: tk('일렉트로니카'), region: '해외' },
  { code: 'GN1200', label: tk('랩/힙합'), region: '해외' },
  { code: 'GN1300', label: 'R&B/Soul', region: '해외' },
  { code: 'GN1400', label: tk('포크/블루스/컨트리'), region: '해외' },
  { code: 'GN1500', label: 'OST', region: '기타' },
  { code: 'GN1700', label: tk('재즈'), region: '기타' },
  { code: 'GN1800', label: tk('뉴에이지'), region: '기타' },
  { code: 'GN1900', label: 'J-POP', region: '기타' },
  { code: 'GN2000', label: tk('월드뮤직'), region: '기타' },
  { code: 'GN2100', label: 'CCM', region: '기타' },
  { code: 'GN2200', label: tk('어린이/태교'), region: '기타' },
  { code: 'GN2300', label: tk('종교음악'), region: '기타' },
  { code: 'GN2400', label: tk('국악'), region: '기타' },
];

export const melonGenre = (code: string) => MELON_GENRES.find((g) => g.code === code);

const hasTwin = (g: MelonGenre) => MELON_GENRES.some((o) => o !== g && o.label === g.label);

/** 한국어 이름: "발라드", 국내·해외에 같은 이름이 있으면 "해외 록/메탈"처럼(목록 label·id용, 번역하지 않는다) */
export function melonGenreName(g: MelonGenre): string {
  return hasTwin(g) && g.region === '해외' ? `해외 ${g.label}` : g.label;
}

/** melonGenreName을 지금 언어로 */
export function melonGenreTitle(g: MelonGenre): string {
  return hasTwin(g) && g.region === '해외' ? t('해외 {genre}', { genre: t(g.label) }) : t(g.label);
}

/** 받아 올 주소. 장르종합(GN0000)은 기본 페이지 그대로 */
export const melonChartUrl = (period: MelonPeriod, classCd = 'GN0000') =>
  `https://www.melon.com/chart/${period}/index.htm${classCd === 'GN0000' ? '' : `?classCd=${classCd}`}`;

/** 앱 안 id: 'melon-day', 장르는 'melon-day-GN0100' */
export const melonChartId = (period: MelonPeriod, classCd = 'GN0000') =>
  `melon-${period}${classCd === 'GN0000' ? '' : `-${classCd}`}`;

/** 목록 이름(한국어 원문, CHART_LIST label용): "멜론 일간 TOP 100", 장르는 "멜론 발라드". 화면 이름은 melonChartTitle */
export function melonChartName(period: MelonPeriod, classCd = 'GN0000'): string {
  const g = melonGenre(classCd);
  if (!g || g.code === 'GN0000') return `멜론 ${MELON_PERIOD_LABEL[period]} TOP 100`;
  return `멜론 ${melonGenreName(g)}`;
}

/** melonChartName을 지금 언어로 */
export function melonChartTitle(period: MelonPeriod, classCd = 'GN0000'): string {
  const g = melonGenre(classCd);
  if (!g || g.code === 'GN0000') return t('멜론 {period} TOP 100', { period: t(MELON_PERIOD_LABEL[period]) });
  return t('멜론 {genre}', { genre: melonGenreTitle(g) });
}

/** 고르기 칩 이름(멜론 묶음 안이라 "멜론"을 뺀다): "일간 TOP 100", "발라드", "해외 록/메탈" */
export function melonChartChip(period: MelonPeriod, classCd = 'GN0000'): string {
  const g = melonGenre(classCd);
  if (!g || g.code === 'GN0000') return `${t(MELON_PERIOD_LABEL[period])} TOP 100`;
  return melonGenreTitle(g);
}

/** 기준 날짜: "2026.10.13" / "2026.10.05 ~ 2026.10.11" / "2026.09" */
export function melonChartDate(html: string): string | undefined {
  const at = html.indexOf('class="yyyymmdd"');
  if (at < 0) return undefined;
  const dates = [...html.slice(at, at + 400).matchAll(/\d{4}\.\d{2}(?:\.\d{2})?/g)].map((m) => m[0]).slice(0, 2);
  return dates.length ? dates.join(' ~ ') : undefined;
}

/** class가 "ellipsis <cls>"인 div 안쪽(다음 </div>까지) */
function divOf(block: string, cls: string): string {
  const at = block.indexOf(`class="ellipsis ${cls}"`);
  if (at < 0) return '';
  return until(block.slice(block.indexOf('>', at) + 1), '</div>');
}

interface MelonRowExtra {
  cover?: string;
  album?: string;
  explicit: boolean;
  /** 링크 없이 글자로만 적힌 가수("Various Artists") */
  plainArtist: string;
}

/** 곡 번호 → 표지(120px)·앨범·19금. parseMelonChart가 곡마다 읽지 않는 것들을 덧붙인다. */
function melonRowExtras(html: string): Map<string, MelonRowExtra> {
  const out = new Map<string, MelonRowExtra>();
  for (const raw of html.split(/<tr class="lst(?:50|100)"/).slice(1)) {
    const block = until(raw, '</tr>');
    const no = block.match(/data-song-no="(\d+)"/)?.[1];
    if (!no) continue;
    const cover = block.match(/<img[^>]+src="([^"]+)"/)?.[1];
    const album = divOf(block, 'rank03').match(/<a\b[^>]*>([\s\S]*?)<\/a>/)?.[1];
    // 19금 표시(<span class="bullet_icons age_19">)는 제목 칸(rank01) 안에 있다.
    const titleHtml = divOf(block, 'rank01');
    out.set(no, {
      cover: cover ? decode(cover) : undefined,
      album: album ? plain(album) || undefined : undefined,
      explicit: titleHtml.includes('age_19'),
      // 가수 칸은 말줄임용 사본(checkEllipsis) 앞까지
      plainArtist: plain(divOf(block, 'rank02').split('class="checkEllipsis"')[0].replace(/<span\b[^>]*$/, '')),
    });
  }
  return out;
}

/**
 * melon.ts의 decode는 &amp; &lt; &gt; &quot; &apos; &nbsp; 와 숫자 참조만 풀어
 * "로제 (ROS&Eacute;)", "can&rsquo;t be blue"가 그대로 남는다. 남은 이름 참조만 한 번 더 풀고 폭 없는 글자를 뺀다.
 */
const fixLeftovers = (s: string) =>
  s.replace(/&([A-Za-z][A-Za-z0-9]*);/g, (m, n: string) => namedEntity(n) ?? m).replace(ZERO_WIDTH, '');

/** parseMelonChart 결과를 다듬는다: 남은 글자 참조 풀기, 링크 없는 가수 채우기, 곡별 표지·앨범·19금 */
export function withMelonExtras(p: ChartPlaylist, html: string): ChartPlaylist {
  const extras = melonRowExtras(html);
  const tracks: ChartTrack[] = p.tracks.map((t) => {
    const x = extras.get(t.id.replace(/^melon-/, ''));
    const fixed = { ...t, title: fixLeftovers(t.title), artists: fixLeftovers(t.artists) };
    if (!x) return fixed;
    return {
      ...fixed,
      artists: fixed.artists || x.plainArtist,
      cover: x.cover,
      album: x.album,
      explicit: t.explicit || x.explicit,
    };
  });
  return { ...p, tracks };
}

/** 실시간 TOP 100(chart/index.htm): melon.ts 해석 + 다듬기(withMelonExtras) */
export const parseMelonRealtime = (html: string): ChartPlaylist => withMelonExtras(parseMelonChart(html), html);

/** 일간·주간·월간(장르별 포함) 차트 페이지 → 목록. 형식이 바뀌면 'melon_format_changed' */
export function parseMelonPeriodChart(html: string, period: MelonPeriod, classCd = 'GN0000'): ChartPlaylist {
  const base = parseMelonChart(html);
  const date = melonChartDate(html);
  const label = MELON_PERIOD_LABEL[period];
  return withMelonExtras(
    {
      ...base,
      id: melonChartId(period, classCd),
      name: melonChartTitle(period, classCd),
      subtitle: date ? `${date} ${t(label)}` : t('멜론 {period}', { period: t(label) }),
    },
    html,
  );
}

export { MELON_TOP100 };
