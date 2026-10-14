// 벅스 실시간 차트(TOP 100, 매시간 갱신).
// 2026-10-14 확인: music.bugs.co.kr/chart/track/realtime/total 한 쪽에 100곡.
// 곡마다 <tr albumId=… trackId="…" multiArtist="Y|N" rowType="track">, 제목 p.title > a(19금은 p.title의 adult_yn="Y"),
// 가수 p.artist > a. 여러 명이면 화면엔 첫 사람만 보이고 전체는 a.more의 onclick에
// openMultiArtistSearchResultPopLayer(this, '이름||표시이름||id||OK\\n…')로 들어 있다.
// 앨범 a.album, 표지 a.thumbnail > img(…/album/images/50/…jpg, 200·500 크기도 있다),
// 기준 시각 <time datetime="…">2026.10.14 <em>15:00</em>…</time>. 곡 길이는 없다.
import { t } from '../../i18n';
import { decode, formatChanged, joinArtists, plain, until, type ChartPlaylist, type ChartTrack } from './util';

export const BUGS_REALTIME = 'bugs-realtime';
export const BUGS_REALTIME_URL = 'https://music.bugs.co.kr/chart/track/realtime/total';

/** onclick 속 여러 가수 목록 → 표시 이름들 */
function multiArtists(block: string): string[] {
  const list = block.match(/openMultiArtistSearchResultPopLayer\(this,\s*'((?:[^'\\]|\\.)*)'/)?.[1];
  if (!list) return [];
  return list
    .split(/\\{1,2}n/)
    .map((row) => row.split('||'))
    .map((cols) => decode((cols[1] || cols[0] || '').replace(/\\(.)/g, '$1')))
    .filter(Boolean);
}

export function parseBugsChart(html: string): ChartPlaylist {
  const tracks: ChartTrack[] = [];
  for (const m of html.matchAll(/<tr\b([^>]*\browType="track"[^>]*)>/g)) {
    const head = m[1];
    const block = until(html.slice(m.index! + m[0].length), '</tr>');
    const id = head.match(/\btrackId="(\d+)"/)?.[1];
    const titleP = block.match(/<p class="title"([^>]*)>([\s\S]*?)<\/p>/);
    const title = plain(titleP?.[2].match(/<a\b[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '');
    if (!id || !title) continue;
    const artistHtml = block.match(/<p class="artist">([\s\S]*?)<\/p>/)?.[1] ?? '';
    let names = /\bmultiArtist="Y"/.test(head) ? multiArtists(artistHtml) : [];
    if (!names.length) {
      names = [...artistHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
        .filter((a) => !/class="more"/.test(a[1]))
        .map((a) => plain(a[2]));
    }
    const album = block.match(/<a\b[^>]*class="album"[^>]*>([\s\S]*?)<\/a>/)?.[1];
    const img = block.match(/<img[^>]+src="([^"]+)"/)?.[1];
    tracks.push({
      id: `bugs-${id}`,
      title,
      artists: joinArtists(names),
      durationMs: 0,
      explicit: /adult_yn="Y"/.test(titleP?.[1] ?? ''),
      album: album ? plain(album) || undefined : undefined,
      cover: img ? decode(img).replace(/\/images\/50\//, '/images/200/') : undefined,
    });
  }
  if (!tracks.length) formatChanged('bugs');
  const time = html.match(/<time datetime="[^"]*">([\s\S]*?)<\/time>/)?.[1];
  const when = time ? plain(time.replace(/<a\b[\s\S]*?<\/a>/g, '')) : '';
  return {
    id: BUGS_REALTIME,
    name: t('벅스 실시간 차트'),
    subtitle: when ? t('{time} 기준', { time: when }) : t('벅스 실시간'),
    cover: tracks[0].cover?.replace(/\/images\/\d+\//, '/images/500/').replace(/\?.*$/, ''),
    tracks,
  };
}
