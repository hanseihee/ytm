// 멜론 TOP 100(실시간 차트) 곡 목록.
// 페이지(www.melon.com/chart/index.htm)는 앱(데스크톱 Rust charts.rs, iOS Swift)이 받아 오고, 해석은 여기서 한다.
// 차트 목록·받는 순서는 charts/index.ts(이 해석기에 글자 참조·글자만 있는 가수 보정을 더한 parseMelonRealtime).
// 2026-10-14 확인: 곡마다 <tr class="lst50|lst100" data-song-no="…">, 제목 .rank01 a, 가수 .rank02 a,
// 앨범 .rank03 a, 표지 img(…/melon/resize/120/…), 기준 시각 .year·.hour. 곡 길이는 차트에 없다.
import type { SpotifyPlaylist, SpotifyTrack } from './spotify';

export const MELON_TOP100 = 'melon-top100';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decode(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, name: string) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[name.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** 태그를 지우고 글자만 */
const plain = (html: string) => decode(html.replace(/<[^>]*>/g, ''));

/** class 이름이 cls인 div 안쪽(다음 </div>까지) */
function divOf(block: string, cls: string): string {
  const at = block.indexOf(`class="ellipsis ${cls}"`);
  if (at < 0) return '';
  const start = block.indexOf('>', at) + 1;
  const end = block.indexOf('</div>', start);
  return end < 0 ? block.slice(start) : block.slice(start, end);
}

const anchors = (html: string) => [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => plain(m[1])).filter(Boolean);

export function parseMelonChart(html: string): SpotifyPlaylist {
  const blocks = html.split(/<tr class="lst(?:50|100)"/).slice(1);
  const tracks: SpotifyTrack[] = [];
  let cover: string | undefined;
  for (const raw of blocks) {
    const block = raw.slice(0, raw.indexOf('</tr>') >= 0 ? raw.indexOf('</tr>') : undefined);
    const id = block.match(/data-song-no="(\d+)"/)?.[1];
    const title = anchors(divOf(block, 'rank01'))[0];
    if (!id || !title) continue;
    // 가수 칸은 말줄임용으로 같은 링크를 한 번 더 숨겨 두어(checkEllipsis) 그 앞까지만 읽는다.
    const artistHtml = divOf(block, 'rank02').split('class="checkEllipsis"')[0];
    const artists = [...new Set(anchors(artistHtml))];
    const img = block.match(/<img[^>]+src="([^"]+)"/)?.[1];
    if (!cover && img) cover = img.replace(/\/melon\/resize\/.*$/, '');
    tracks.push({ id: `melon-${id}`, title, artists: artists.join(', '), durationMs: 0, explicit: false });
  }
  if (!tracks.length) throw 'melon_format_changed';
  const day = html.match(/<span class="year">\s*([\d.]+)\s*<\/span>/)?.[1];
  const hour = html.match(/<span class="hour">\s*([\d:]+)\s*<\/span>/)?.[1];
  return {
    id: MELON_TOP100,
    name: '멜론 TOP 100',
    subtitle: day ? `${day}${hour ? ` ${hour}` : ''} 기준` : 'Melon',
    cover,
    tracks,
  };
}
