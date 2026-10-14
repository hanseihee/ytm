// 차트 해석기 공용 도구: HTML 글자 풀기, 태그 지우기, 곡·목록 형식.
// iOS(JavaScriptCore)에서도 돌아야 해서 DOM(DOMParser 등) 없이 정규식·문자열로만 다룬다.
import type { SpotifyPlaylist, SpotifyTrack } from '../spotify';
import { namedEntity } from './entities';

/** 차트 곡: Spotify 곡 형식에, 순위표에서 바로 얻을 수 있으면 표지·앨범을 덧붙인다. 순서 = 순위. */
export interface ChartTrack extends SpotifyTrack {
  /** 앨범 표지(작은 크기) */
  cover?: string;
  album?: string;
}

/** SpotifyPlaylist와 같은 모양(곡에 표지·앨범이 더 붙을 수 있다) */
export interface ChartPlaylist extends SpotifyPlaylist {
  tracks: ChartTrack[];
}

/** 앱이 보낼 요청 하나. 모든 요청에 SAFARI_HEADERS(브라우저 식별·한국어)를 함께 보낸다. */
export interface ChartRequest {
  url: string;
  method?: 'GET' | 'POST';
  /** SAFARI_HEADERS에 더할 머리글(예: VIBE는 Accept: application/json) */
  headers?: Record<string, string>;
  /** POST 본문(써클차트: application/x-www-form-urlencoded) */
  body?: string;
}

export const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

export const SAFARI_HEADERS: Record<string, string> = {
  'User-Agent': SAFARI_UA,
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

/** 폭 없는 글자(U+200B~U+200D, U+FEFF): 멜론 "어둑시니 (Feat​.​ 시유&유니)"처럼 원본에 섞여 온다 */
export const ZERO_WIDTH = /[\u200b-\u200d\ufeff]/g;

/** HTML 글자 참조(&amp; &#39; &#x2019; …)를 풀고 폭 없는 글자를 빼고 공백을 하나로 */
export function decode(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, name: string) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return namedEntity(name) ?? m;
    })
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** JSON 글자: 공백(줄바꿈·겹친 빈칸)을 하나로 */
export const clean = (s: string | undefined) => (s ?? '').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();

/** 태그와 주석을 지우고 글자만 */
export const plain = (html: string) => decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ''));

/** 같은 이름은 한 번만 남기고 ", "로 잇는다 */
export const joinArtists = (names: string[]) => [...new Set(names.map((n) => n.trim()).filter(Boolean))].join(', ');

/** "//image…" 같은 주소에 https: 붙이기 */
export const absUrl = (u: string | undefined, base = 'https:') =>
  !u ? undefined : u.startsWith('//') ? `https:${u}` : u.startsWith('/') ? `${base}${u}` : u;

/** split로 자른 조각에서 끝 표식(예: '</tr>') 앞까지만 */
export const until = (s: string, end: string) => {
  const at = s.indexOf(end);
  return at < 0 ? s : s.slice(0, at);
};

/** 해석 실패: 앱이 '<출처>_format_changed'로 알아본다(멜론과 같은 방식) */
export function formatChanged(source: string): never {
  throw `${source}_format_changed`;
}

/** JSON 해석(실패하면 형식 변경으로 본다) */
export function json<T = unknown>(text: string, source: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return formatChanged(source);
  }
}

/** 같은 곡 id가 두 번 나오면 앞의 것만(여러 쪽을 이어 붙일 때) */
export function uniqueTracks(tracks: ChartTrack[]): ChartTrack[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

/** 곡 id가 없는 차트(빌보드)용: 제목·가수로 만든 안정된 id */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
