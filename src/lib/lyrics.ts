// 가사: 시간 맞춤 가사는 LRCLIB(공개 가사 데이터베이스, lrclib.net)에서, 없으면 YouTube Music 가사(LyricFind 등).
// LRCLIB는 교차 출처를 허용(Access-Control-Allow-Origin: *)해서 앱 화면에서 바로 부른다(2026-10-14 확인).
import { ytLyrics } from './ytm/client';

export interface LyricLine {
  /** 초 */
  time: number;
  text: string;
}

export interface Lyrics {
  /** 시간 맞춤 가사(있으면) */
  synced?: LyricLine[];
  /** 일반 가사 */
  plain?: string;
  source: string;
}

export interface LyricsQuery {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  /** 초 */
  duration: number;
}

const LRCLIB = 'https://lrclib.net/api';
const HEADERS = { 'Lrclib-Client': 'YTM Desktop 0.2 (personal player)' };
/** 곡 길이 차이가 이 안이면 같은 곡으로 본다(초). */
const DURATION_TOLERANCE = 4;

/** "[01:23.45] 가사" 형식 → 줄 목록 */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
      lines.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text: body });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** 제목에서 검색에 방해되는 꼬리표를 뺀다: (feat. …), [MV], (Prod. …), - Remastered 등 */
export function cleanTitle(title: string): string {
  return title
    .replace(/[([](?:feat|ft|prod|with)\.?[^)\]]*[)\]]/gi, '')
    .replace(/[([](?:official|m\/?v|music video|audio|lyrics?|live|remaster(?:ed)?)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(?:remaster(?:ed)?|live).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** "아이유 (IU)" → ["아이유", "IU"] 처럼 비교용 이름 후보 */
function nameKeys(name: string): string[] {
  const base = name.toLowerCase();
  const parts = base.split(/[()（）[\],&/]| x | feat\.? /).map((s) => s.replace(/\s+/g, '').trim()).filter(Boolean);
  return [base.replace(/\s+/g, ''), ...parts];
}

function similar(a: string, b: string): boolean {
  const ka = nameKeys(a);
  const kb = nameKeys(b);
  return ka.some((x) => kb.some((y) => x && y && (x.includes(y) || y.includes(x))));
}

interface LrclibRecord {
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

async function lrclib(path: string, params: Record<string, string>): Promise<unknown> {
  const url = `${LRCLIB}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return res.json();
}

function pick(records: LrclibRecord[], q: LyricsQuery, title: string): LrclibRecord | undefined {
  const scored = records
    .filter((r) => !r.instrumental && (r.syncedLyrics || r.plainLyrics))
    .filter((r) => !q.duration || Math.abs(r.duration - q.duration) <= DURATION_TOLERANCE)
    .filter((r) => similar(r.trackName, title) || similar(r.trackName, q.title))
    .map((r) => ({ r, score: (r.syncedLyrics ? 2 : 0) + (similar(r.artistName, q.artist) ? 3 : 0) - Math.abs(r.duration - q.duration) / 10 }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.r;
}

async function fromLrclib(q: LyricsQuery): Promise<LrclibRecord | undefined> {
  const title = cleanTitle(q.title);
  const artist = q.artist.split(/,|&/)[0].trim();
  // 1) 정확히 맞추기
  const exact = (await lrclib('get', {
    track_name: title,
    artist_name: artist,
    ...(q.album ? { album_name: q.album } : {}),
    ...(q.duration ? { duration: String(Math.round(q.duration)) } : {}),
  })) as LrclibRecord | null;
  if (exact && (exact.syncedLyrics || exact.plainLyrics) && !exact.instrumental) return exact;
  // 2) 검색 후 길이·이름으로 고르기 (한국 곡은 "Through the Night (밤편지)"처럼 영문 제목이 붙는 경우가 많다)
  const found = (await lrclib('search', { q: `${title} ${artist}` })) as LrclibRecord[] | null;
  const best = pick(found ?? [], q, title);
  if (best) return best;
  const byTitle = (await lrclib('search', { track_name: title })) as LrclibRecord[] | null;
  return pick(byTitle ?? [], q, title);
}

const cache = new Map<string, Promise<Lyrics | null>>();

export function loadLyrics(q: LyricsQuery): Promise<Lyrics | null> {
  const hit = cache.get(q.videoId);
  if (hit) return hit;
  // LRCLIB가 잠깐 실패(503 등)하면 이번 결과는 기억하지 않아 다음에 열 때 다시 찾는다(2026-10-14 503 관찰).
  let lrclibFailed = false;
  const task = (async (): Promise<Lyrics | null> => {
    let record: LrclibRecord | undefined;
    try {
      record = await fromLrclib(q);
    } catch (err) {
      lrclibFailed = true;
      console.warn('[lyrics] LRCLIB 실패', err);
    }
    if (record?.syncedLyrics) {
      const synced = parseLrc(record.syncedLyrics);
      if (synced.length) return { synced, plain: record.plainLyrics ?? undefined, source: 'LRCLIB' };
    }
    try {
      const yt = await ytLyrics(q.videoId);
      if (yt?.text) return { plain: yt.text, source: yt.source?.replace(/^출처:\s*/, '') || 'YouTube Music' };
    } catch (err) {
      console.warn('[lyrics] YouTube Music 가사 실패', err);
    }
    if (record?.plainLyrics) return { plain: record.plainLyrics, source: 'LRCLIB' };
    return null;
  })();
  cache.set(q.videoId, task);
  // 실패(네트워크)는 다음에 다시 시도할 수 있게 지운다.
  task.then(
    () => lrclibFailed && cache.delete(q.videoId),
    () => cache.delete(q.videoId),
  );
  return task;
}

/** 현재 위치(초)에 해당하는 줄 번호. 첫 줄 전이면 -1. */
export function activeLine(lines: LyricLine[], position: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position + 0.15) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
