// 지니 TOP 200(실시간, 매시간 갱신).
// 2026-10-14 확인: www.genie.co.kr/chart/top200 은 한 쪽에 50곡이라 ?pg=1~4로 200위까지 받는다(pgSize 같은 한 번에 받기는 안 된다).
// 곡마다 <tr class="list" songid="…">, 제목 a.title.ellipsis, 가수 a.artist.ellipsis, 앨범 a.albumtitle.ellipsis,
// 표지 a.cover > img(//image.genie.co.kr/…_140x140.JPG/dims/resize/Q_80,0, 같은 자리에 _600x600.JPG도 있다).
// 기준 시각은 쪽 넘김 링크(?ditc=D&ymd=20261014&hh=15&rtm=Y&pg=2)에서 읽는다
// (머리의 날짜 칸 #inc_date는 자바스크립트가 채워서 원문엔 2013년 자리표시만 있다). 곡 길이는 없다.
import { t } from '../../i18n';
import { absUrl, decode, formatChanged, plain, uniqueTracks, until, type ChartPlaylist, type ChartTrack } from './util';

export const GENIE_TOP200 = 'genie-top200';

/** 1~50위, 51~100위, 101~150위, 151~200위 */
export const GENIE_TOP200_URLS = [1, 2, 3, 4].map((pg) => `https://www.genie.co.kr/chart/top200?ditc=D&rtm=Y&pg=${pg}`);

const anchorOf = (block: string, cls: string) =>
  block.match(new RegExp(`<a\\b[^>]*class="${cls}"[^>]*>([\\s\\S]*?)</a>`))?.[1] ?? '';

function parsePage(html: string): ChartTrack[] {
  const tracks: ChartTrack[] = [];
  for (const raw of html.split(/<tr class="list" songid="/).slice(1)) {
    const block = until(raw, '</tr>');
    const id = block.match(/^(\d+)"/)?.[1];
    const titleHtml = anchorOf(block, 'title ellipsis');
    // 19금 곡은 제목 링크 안에 아이콘(span.icon…)이 붙는다.
    const explicit = /icon-19|19금/.test(titleHtml);
    const title = plain(titleHtml.replace(/<span class="icon[^"]*"[^>]*>[\s\S]*?<\/span>/g, ''));
    if (!id || !title) continue;
    const img = block.match(/class="cover"[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1];
    tracks.push({
      id: `genie-${id}`,
      title,
      artists: plain(anchorOf(block, 'artist ellipsis')),
      durationMs: 0,
      explicit,
      album: plain(anchorOf(block, 'albumtitle ellipsis')) || undefined,
      cover: img ? absUrl(decode(img)) : undefined,
    });
  }
  return tracks;
}

/**
 * TOP 200 쪽들 → 목록. text는 1쪽(1~50위), more는 2~4쪽을 순서대로(빠져도 받은 데까지만 만든다).
 * 쪽 사이에 매시 갱신이 끼면 같은 곡이 두 번 나올 수 있어 앞의 것만 남긴다. 형식이 바뀌면 'genie_format_changed'
 */
export function parseGenieTop200(text: string, more: string[] = []): ChartPlaylist {
  const tracks = uniqueTracks([text, ...more].flatMap(parsePage));
  if (!tracks.length) formatChanged('genie');
  const at = text.match(/ymd=(\d{4})(\d{2})(\d{2})&(?:amp;)?hh=(\d{1,2})/);
  const cover = tracks[0].cover?.replace(/_\d+x\d+\.JPG.*$/i, '_600x600.JPG');
  return {
    id: GENIE_TOP200,
    name: t('지니 TOP 200'),
    subtitle: at ? t('{time} 기준', { time: `${at[1]}.${at[2]}.${at[3]} ${at[4].padStart(2, '0')}:00` }) : t('지니 실시간'),
    cover,
    tracks,
  };
}
