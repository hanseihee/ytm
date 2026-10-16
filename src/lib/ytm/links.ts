// 붙여 넣은 링크(YouTube Music·YouTube·Spotify)를 앱 안에서 열 대상으로 바꾼다. 화면과 무관한 순수 함수(데스크톱·iOS 공용).
//
// - 곡: watch?v=·youtu.be/·shorts/·embed/·live/ (list=가 있으면 그 목록 안에서, t=·start=는 시작 위치)
// - 재생목록: playlist?list= (LM은 좋아요 표시한 곡), 앨범: browse/MPREb_…, 아티스트: channel/UC…·browse/UC…
// - 검색 주소: music.youtube.com/search?q=, youtube.com/results?search_query=
// - Spotify 플레이리스트: open.spotify.com/playlist/…, spotify:playlist:…
// - 채널 별칭(@이름, /c/이름, /user/이름)은 YouTube Music이 풀지 못해서(navigation/resolve_url이 그대로 urlEndpoint를
//   돌려준다, 2026-10-16 확인) 그 이름으로 검색한다.
// 공유 문구에 섞여 있어도 첫 링크를 찾는다. 링크가 아니면 undefined(평소처럼 검색).

export type LinkTarget =
  | { kind: 'track'; videoId: string; playlistId?: string; start?: number }
  | { kind: 'playlist'; browseId: string }
  | { kind: 'album'; browseId: string }
  | { kind: 'artist'; browseId: string }
  | { kind: 'browse'; browseId: string }
  | { kind: 'search'; query: string }
  | { kind: 'spotify'; playlistId: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{2,80}$/;
const BROWSE_ID = /^[A-Za-z0-9_-]{2,128}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YT_HOSTS = new Set([
  'music.youtube.com',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

// 앞 글자가 주소의 일부가 아닐 때만 찾는다(notyoutube.com 같은 이름 배제). 뒤돌아보기(?<=)는 맥 12의 웹뷰가 몰라서 쓰지 않는다.
const URL_IN_TEXT = /(?:^|[^A-Za-z0-9.-])((?:https?:\/\/)?(?:[A-Za-z0-9-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|spotify\.com)\/[^\s<>"'“”‘’]*)/i;

function findUrl(text: string): URL | undefined {
  const m = text.match(URL_IN_TEXT);
  if (!m) return undefined;
  const raw = /^https?:\/\//i.test(m[1]) ? m[1] : `https://${m[1]}`;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** t=90, t=90s, t=1m30s, t=1h2m3s → 초(0이거나 알 수 없으면 undefined) */
export function parseStartTime(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  let seconds: number;
  if (/^\d+$/.test(v)) {
    seconds = Number(v);
  } else {
    const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
    seconds = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  }
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function browseTarget(id: string): LinkTarget | undefined {
  if (!BROWSE_ID.test(id)) return undefined;
  if (id.startsWith('MPREb_')) return { kind: 'album', browseId: id };
  if (CHANNEL_ID.test(id)) return { kind: 'artist', browseId: id };
  if (/^(VL|PL|OLAK5uy_|RDCLAK)/.test(id)) return { kind: 'playlist', browseId: id.startsWith('VL') ? id : `VL${id}` };
  return { kind: 'browse', browseId: id };
}

const playlistTarget = (list: string | null): LinkTarget | undefined =>
  list && LIST_ID.test(list) ? { kind: 'playlist', browseId: list.startsWith('VL') ? list : `VL${list}` } : undefined;

const searchTarget = (query: string | null): LinkTarget | undefined => {
  const q = query?.trim();
  return q ? { kind: 'search', query: q } : undefined;
};

export function parseLink(input: string): LinkTarget | undefined {
  const text = input.trim();
  if (!text) return undefined;
  const uri = text.match(/spotify:playlist:([A-Za-z0-9]{22})/);
  if (uri) return { kind: 'spotify', playlistId: uri[1] };
  const url = findUrl(text);
  if (!url) return undefined;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'open.spotify.com') {
    // open.spotify.com/playlist/<id>, 나라별 주소 open.spotify.com/intl-ko/playlist/<id>
    const at = parts.indexOf('playlist');
    const id = at >= 0 ? parts[at + 1] : undefined;
    return id && SPOTIFY_ID.test(id) ? { kind: 'spotify', playlistId: id } : undefined;
  }
  if (!YT_HOSTS.has(host)) return undefined;

  const q = url.searchParams;
  const list = q.get('list');
  const start = parseStartTime(q.get('t') ?? q.get('start') ?? new URLSearchParams(url.hash.replace(/^#/, '')).get('t'));
  const track = (videoId: string | null | undefined): LinkTarget | undefined => {
    if (!videoId || !VIDEO_ID.test(videoId)) return undefined;
    return {
      kind: 'track',
      videoId,
      ...(list && LIST_ID.test(list) ? { playlistId: list } : {}),
      ...(start ? { start } : {}),
    };
  };

  if (host.endsWith('youtu.be')) return track(parts[0]);
  const [first = '', second = ''] = parts;
  switch (first) {
    case 'watch':
      return track(q.get('v')) ?? (q.get('v') ? undefined : playlistTarget(list));
    case 'shorts':
    case 'embed':
    case 'live':
    case 'v':
      return track(second);
    case 'playlist':
      return playlistTarget(list);
    case 'browse':
      return browseTarget(second);
    case 'channel':
      return CHANNEL_ID.test(second) ? { kind: 'artist', browseId: second } : undefined;
    case 'search':
      return searchTarget(q.get('q'));
    case 'results':
      return searchTarget(q.get('search_query'));
    case 'c':
    case 'user':
      return second ? searchTarget(decode(second)) : undefined;
  }
  if (first.startsWith('@') && first.length > 1) return searchTarget(decode(first.slice(1)));
  return undefined;
}
