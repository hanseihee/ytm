// 가사: 시간 맞춤 가사는 LRCLIB(공개 가사 데이터베이스, lrclib.net)와 벅스 싱크 가사에서, 둘 다 없으면 YouTube Music 가사.
// - LRCLIB는 교차 출처를 허용(Access-Control-Allow-Origin: *)해서 앱 화면에서 바로 부른다(2026-10-14 확인).
// - 벅스는 교차 출처를 허용하지 않아 앱의 chart_fetch(허용한 사이트만 받는 통로)로 받는다.
//   검색 music.bugs.co.kr/search/track?q= → 곡 번호(trackId) → /player/lyrics/T/<번호> = {"lyrics":"6.7|가사＃9.9|가사＃…"}.
// - YouTube Music 웹 가사(browse MPLY…)에는 시간 정보가 없다(2026-10-14 세 곡 확인). 모바일 앱 클라이언트로 보내면
//   시간 맞춤 가사가 온다고 알려져 있지만, 로그인한 웹에서 보내면 400이 나서 쓸 수 없다.
import { invoke } from '@tauri-apps/api/core';
import { t, tk } from '../i18n';
import { decode, SAFARI_HEADERS } from './charts/util';
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

// ── 벅스 싱크 가사 ─────────────────────────────────────────────────────────

const BUGS = 'https://music.bugs.co.kr';
/** 가사 출처 이름(번역 열쇠). 기억해 둔 결과에는 원문을 두고, 돌려줄 때 지금 언어로 바꾼다(localizeSource). */
const BUGS_SOURCE = tk('벅스');
const bugsGet = (url: string) => invoke<string>('chart_fetch', { req: { url, method: 'GET', headers: { ...SAFARI_HEADERS, Referer: `${BUGS}/` } } });

interface BugsTrack {
  id: string;
  title: string;
  artist: string;
}

/** 벅스 곡 검색 결과(HTML)의 곡 줄들 */
export function parseBugsSearch(html: string): BugsTrack[] {
  const out: BugsTrack[] = [];
  const rows = html.split(/<tr\b/).slice(1);
  for (const row of rows) {
    if (!/rowType="track"/.test(row.slice(0, 400))) continue;
    const id = row.match(/trackId="(\d+)"/)?.[1];
    const title = row.match(/<p class="title"[^>]*>\s*<a\b[^>]*\btitle="([^"]*)"/)?.[1];
    const artist = row.match(/<p class="artist"[^>]*>\s*<a\b[^>]*\btitle="([^"]*)"/)?.[1];
    if (id && title) out.push({ id, title: decode(title), artist: decode(artist ?? '') });
  }
  return out;
}

/** "6.7|가사＃9.9|가사＃…"(＃는 전각) → 줄 목록 */
export function parseBugsLyrics(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const part of raw.split('＃')) {
    const at = part.indexOf('|');
    if (at < 0) continue;
    const time = Number(part.slice(0, at));
    if (!Number.isFinite(time)) continue;
    lines.push({ time, text: part.slice(at + 1).trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

async function fromBugs(q: LyricsQuery): Promise<LyricLine[] | undefined> {
  const title = cleanTitle(q.title);
  const artist = q.artist.split(/,|&/)[0].trim();
  const html = await bugsGet(`${BUGS}/search/track?q=${encodeURIComponent(`${title} ${artist}`)}`);
  const track = parseBugsSearch(html)
    .slice(0, 10)
    .find((t) => (similar(cleanTitle(t.title), title) || similar(t.title, q.title)) && similar(t.artist, q.artist));
  if (!track) return undefined;
  const body = JSON.parse(await bugsGet(`${BUGS}/player/lyrics/T/${track.id}`)) as { lyrics?: string | null };
  const lines = parseBugsLyrics(body?.lyrics ?? '');
  // 다른 버전(라이브·리믹스)을 잘못 고른 경우를 거른다: 줄이 너무 적거나 마지막 줄이 곡보다 한참 뒤면 쓰지 않는다.
  if (lines.filter((l) => l.text).length < 3) return undefined;
  if (q.duration > 0 && lines[lines.length - 1].time > q.duration + 10) return undefined;
  return lines;
}

/** 늦게 오는 응답을 기다리지 않는다. */
function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    task.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/;

const cache = new Map<string, Promise<Lyrics | null>>();

/** 출처 이름을 지금 언어로(언어를 바꾼 뒤 다시 열어도 맞게 기억값에는 원문을 둔다) */
const localizeSource = (l: Lyrics | null): Lyrics | null => (l && l.source === BUGS_SOURCE ? { ...l, source: t(BUGS_SOURCE) } : l);

export function loadLyrics(q: LyricsQuery): Promise<Lyrics | null> {
  const hit = cache.get(q.videoId);
  if (hit) return hit.then(localizeSource);
  // LRCLIB가 잠깐 실패(503·느림)하면 이번 결과는 기억하지 않아 다음에 열 때 다시 찾는다(2026-10-14 503 관찰).
  let lrclibFailed = false;
  const task = (async (): Promise<Lyrics | null> => {
    // 한글 곡은 벅스 싱크 가사를 먼저, 그 밖은 LRCLIB를 먼저 쓴다. 둘은 동시에 찾는다.
    const korean = HANGUL.test(`${q.title} ${q.artist}`);
    const lrclibTask = withTimeout(fromLrclib(q), 6000, 'lrclib').catch((err) => {
      lrclibFailed = true;
      console.warn('[lyrics] LRCLIB 실패', err);
      return undefined;
    });
    const bugsTask = () =>
      withTimeout(fromBugs(q), 8000, 'bugs').catch((err) => {
        console.warn('[lyrics] 벅스 싱크 가사 실패', err);
        return undefined;
      });
    const bugsEarly = korean ? bugsTask() : undefined;
    const fromLrclibSynced = (record: LrclibRecord | undefined): Lyrics | undefined => {
      const synced = record?.syncedLyrics ? parseLrc(record.syncedLyrics) : [];
      return synced.length ? { synced, plain: record?.plainLyrics ?? undefined, source: 'LRCLIB' } : undefined;
    };
    const fromBugsSynced = (lines: LyricLine[] | undefined): Lyrics | undefined =>
      lines?.length ? { synced: lines, plain: lines.map((l) => l.text).join('\n'), source: BUGS_SOURCE } : undefined;

    let record: LrclibRecord | undefined;
    if (bugsEarly) {
      const bugs = fromBugsSynced(await bugsEarly);
      if (bugs) return bugs;
      record = await lrclibTask;
      const lr = fromLrclibSynced(record);
      if (lr) return lr;
    } else {
      record = await lrclibTask;
      const lr = fromLrclibSynced(record);
      if (lr) return lr;
      const bugs = fromBugsSynced(await bugsTask());
      if (bugs) return bugs;
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
  return task.then(localizeSource);
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

// ── 가사 싱크 조절(곡마다, 이 기기에 저장) ─────────────────────────────────
// LRCLIB 시간이 음원과 조금 어긋날 때 곡마다 ±로 맞춘다. 양수면 가사를 일찍 넘긴다.

const OFFSET_KEY = 'ytm:lyrics-offset:v1';
export const LYRIC_OFFSET_STEP = 0.5;
export const LYRIC_OFFSET_MAX = 10;

function offsets(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFSET_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function lyricsOffset(videoId: string): number {
  const v = Number(offsets()[videoId]);
  return Number.isFinite(v) ? v : 0;
}

export function setLyricsOffset(videoId: string, seconds: number) {
  const all = offsets();
  const v = Math.max(-LYRIC_OFFSET_MAX, Math.min(LYRIC_OFFSET_MAX, Math.round(seconds * 10) / 10));
  if (v === 0) delete all[videoId];
  else all[videoId] = v;
  // 오래 쌓이지 않게 최근 500곡만 남긴다.
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete all[k];
  try {
    localStorage.setItem(OFFSET_KEY, JSON.stringify(all));
  } catch {
    // 저장 못 해도 이번 실행에는 쓴다.
  }
  return v;
}
