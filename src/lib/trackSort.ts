// 곡 목록 정렬(플레이리스트·좋아요 표시한 곡 화면). 화면과 무관한 순수 함수.
// 글자는 지금 언어의 사전 순서(Intl.Collator: 대소문자·악센트 무시, 숫자는 크기대로), 길이는 짧은 곡부터.
// 값이 없는 곡(앨범 없는 영상 등)은 뒤로 보내고, 같은 값끼리는 원래 순서를 지킨다(정렬은 안정적이다).
import type { Track } from './ytm/types';

export type TrackSort = 'default' | 'title' | 'artist' | 'album' | 'duration';

export const TRACK_SORTS: TrackSort[] = ['default', 'title', 'artist', 'album', 'duration'];

function textOf(track: Track, sort: TrackSort): string {
  if (sort === 'title') return track.title;
  if (sort === 'artist') return track.artists.map((a) => a.name).join(', ');
  if (sort === 'album') return track.album?.name ?? '';
  return '';
}

export function sortTracks(list: Track[], sort: TrackSort, lang: string): Track[] {
  if (sort === 'default') return list;
  if (sort === 'duration') {
    const len = (t: Track) => (typeof t.duration === 'number' && Number.isFinite(t.duration) ? t.duration : Number.POSITIVE_INFINITY);
    return [...list].sort((a, b) => {
      const da = len(a);
      const db = len(b);
      return da === db ? 0 : da < db ? -1 : 1;
    });
  }
  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
  } catch {
    collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  }
  return [...list].sort((a, b) => {
    const ta = textOf(a, sort).trim();
    const tb = textOf(b, sort).trim();
    if (!ta || !tb) return ta ? -1 : tb ? 1 : 0;
    return collator.compare(ta, tb);
  });
}
