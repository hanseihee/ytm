// 빌보드 Hot 100(주간).
// 2026-10-14 확인: www.billboard.com/charts/hot-100/ 한 쪽에 100곡. 곡마다 <div class="o-chart-results-list-row-container">,
// 그 안 첫 <h3 id="title-of-a-story">가 제목, 바로 뒤 <span class="c-label …">가 가수(링크 여러 개 + " & "·" Featuring ").
// 표지 img.c-lazy-image__img: 앞 몇 곡만 src, 나머지는 data-lazy-src(src는 lazyload-fallback.gif). 크기 -180x180(-344x344도 있다).
// 기준 주 "Week of October 17, 2026". 곡 id·곡 길이·19금 표시는 없어 id는 제목·가수로 만든다.
import { t } from '../../i18n';
import { decode, formatChanged, plain, slug, type ChartPlaylist, type ChartTrack } from './util';

export const BILLBOARD_HOT100 = 'billboard-hot100';
export const BILLBOARD_HOT100_URL = 'https://www.billboard.com/charts/hot-100/';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function parseBillboardHot100(html: string): ChartPlaylist {
  const tracks: ChartTrack[] = [];
  for (const block of html.split('o-chart-results-list-row-container').slice(1)) {
    const m = block.match(/<h3\b[^>]*id="title-of-a-story"[^>]*>([\s\S]*?)<\/h3>\s*<span\b[^>]*>([\s\S]*?)<\/span>/);
    if (!m) continue;
    const title = plain(m[1]);
    // 맞추기(spotify.ts artistScore)는 ","·"&"로 가수를 나눈다 → "Featuring"도 ", "로.
    const artists = plain(m[2]).replace(/\s+(?:Featuring|Feat\.?)\s+/gi, ', ');
    if (!title) continue;
    const img = block.match(/<img\b[^>]*class="c-lazy-image__img[^>]*>/)?.[0] ?? '';
    const src = img.match(/data-lazy-src="([^"]+)"/)?.[1] ?? img.match(/\bsrc="([^"]+)"/)?.[1];
    const cover = src && !/lazyload-fallback/.test(src) ? decode(src) : undefined;
    tracks.push({
      id: `billboard-${slug(title)}--${slug(artists)}`,
      title,
      artists,
      durationMs: 0,
      explicit: false,
      cover,
    });
  }
  if (!tracks.length) formatChanged('billboard');
  const w = html.match(/Week of ([A-Za-z]+) (\d{1,2}), (\d{4})/);
  const month = w ? MONTHS.indexOf(w[1].toLowerCase()) + 1 : 0;
  return {
    id: BILLBOARD_HOT100,
    name: t('빌보드 Hot 100'),
    subtitle: w && month ? t('{date} 차트', { date: `${w[3]}.${String(month).padStart(2, '0')}.${w[2].padStart(2, '0')}` }) : t('Billboard 주간'),
    cover: tracks[0].cover?.replace(/-180x180(\.\w+)$/, '-344x344$1'),
    tracks,
  };
}
