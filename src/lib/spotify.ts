// 차트(Spotify 플레이리스트·멜론 TOP 100) → YouTube Music 곡 짝짓기.
// Spotify 곡 목록은 Rust(spotify_playlist)가 공개 임베드 페이지에서, 멜론은 melon.ts가 차트 페이지에서 읽어 오고,
// 곡마다 YouTube Music 검색 결과 중 제목·아티스트·길이가 가장 잘 맞는 음원을 고른다.
import { invoke } from '@tauri-apps/api/core';
import { fetchMelonChart, MELON_TOP100 } from './melon';
import * as ytm from './ytm/client';
import type { Track } from './ytm/types';

export const KOREA_TOP50 = '37i9dQZEVXbNxXF4SkHj9F';

export interface ChartInfo {
  code: string;
  label: string;
  id: string;
  source: 'spotify' | 'melon';
}

/**
 * 고를 수 있는 차트: Spotify "Top 50 - 나라"(매일 갱신, id는 2026-10-14 임베드 페이지로 모두 확인)와
 * 멜론 TOP 100(실시간, 매시간 갱신).
 */
export const CHARTS: ChartInfo[] = [
  { code: 'KR', label: '한국', id: KOREA_TOP50, source: 'spotify' },
  { code: 'MELON', label: '멜론 TOP 100', id: MELON_TOP100, source: 'melon' },
  { code: 'GLOBAL', label: '글로벌', id: '37i9dQZEVXbMDoHDwVN2tF', source: 'spotify' },
  { code: 'JP', label: '일본', id: '37i9dQZEVXbKXQ4mDTEBXq', source: 'spotify' },
  { code: 'US', label: '미국', id: '37i9dQZEVXbLRQDuF5jeBp', source: 'spotify' },
  { code: 'GB', label: '영국', id: '37i9dQZEVXbLnolsZ8PSNw', source: 'spotify' },
  { code: 'FR', label: '프랑스', id: '37i9dQZEVXbIPWwFssbupI', source: 'spotify' },
  { code: 'DE', label: '독일', id: '37i9dQZEVXbJiZcmkrIHGU', source: 'spotify' },
  { code: 'ES', label: '스페인', id: '37i9dQZEVXbNFJfN1Vw8d9', source: 'spotify' },
  { code: 'IT', label: '이탈리아', id: '37i9dQZEVXbIQnj7RRhdSX', source: 'spotify' },
  { code: 'SE', label: '스웨덴', id: '37i9dQZEVXbLoATJ81JYXz', source: 'spotify' },
  { code: 'CA', label: '캐나다', id: '37i9dQZEVXbKj23U1GF4IR', source: 'spotify' },
  { code: 'BR', label: '브라질', id: '37i9dQZEVXbMXbN3EUUhlg', source: 'spotify' },
  { code: 'MX', label: '멕시코', id: '37i9dQZEVXbO3qyFxbkOE1', source: 'spotify' },
  { code: 'AU', label: '호주', id: '37i9dQZEVXbJPcfkRz0wJ0', source: 'spotify' },
  { code: 'TW', label: '대만', id: '37i9dQZEVXbMnZEatlMSiu', source: 'spotify' },
  { code: 'TH', label: '태국', id: '37i9dQZEVXbMnz8KIWsvf9', source: 'spotify' },
  { code: 'VN', label: '베트남', id: '37i9dQZEVXbLdGSmz6xilI', source: 'spotify' },
  { code: 'ID', label: '인도네시아', id: '37i9dQZEVXbObFQZ3JLcXt', source: 'spotify' },
  { code: 'PH', label: '필리핀', id: '37i9dQZEVXbNBz9cRCSFkY', source: 'spotify' },
  { code: 'IN', label: '인도', id: '37i9dQZEVXbLZ52XmnySJg', source: 'spotify' },
];

export const chartFor = (id: string) => CHARTS.find((c) => c.id === id);

const LAST_CHART_KEY = 'ytm-desktop:last-chart';
/** 마지막으로 본 차트(없으면 한국) */
export function lastChartId(): string {
  try {
    const v = localStorage.getItem(LAST_CHART_KEY);
    return v && chartFor(v) ? v : KOREA_TOP50;
  } catch {
    return KOREA_TOP50;
  }
}
export function rememberChart(id: string) {
  if (!chartFor(id)) return;
  try {
    localStorage.setItem(LAST_CHART_KEY, id);
  } catch {
    // 기억 못 해도 된다.
  }
}

export interface SpotifyTrack {
  id: string;
  title: string;
  artists: string;
  durationMs: number;
  explicit: boolean;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  subtitle: string;
  cover?: string;
  tracks: SpotifyTrack[];
}

export type MatchQuality = 'good' | 'unsure' | 'none';

export interface Match {
  track?: Track;
  quality: MatchQuality;
}

export function describeSpotifyError(err: unknown): string {
  const m = String(err instanceof Error ? err.message : err);
  if (m.startsWith('spotify_bad_id')) return 'Spotify 플레이리스트 링크가 아닙니다.';
  if (m.startsWith('spotify_not_found')) return 'Spotify에서 이 플레이리스트를 찾지 못했습니다(비공개일 수 있습니다).';
  if (m.startsWith('spotify_format_changed')) return 'Spotify 페이지 형식이 바뀌어 곡 목록을 읽지 못했습니다.';
  if (m.startsWith('spotify_network')) return 'Spotify에 연결하지 못했습니다. 인터넷 연결을 확인하세요.';
  if (m.startsWith('melon_format_changed')) return '멜론 차트 페이지 형식이 바뀌어 곡 목록을 읽지 못했습니다.';
  if (m.startsWith('melon_network') || m.startsWith('melon_http')) return '멜론에 연결하지 못했습니다. 인터넷 연결을 확인하세요.';
  return m;
}

/** 링크·URI·id 어느 것이든 플레이리스트 id로 */
export function playlistIdFrom(input: string): string | undefined {
  const s = input.trim();
  const m = s.match(/playlist[/:]([A-Za-z0-9]{22})/) ?? s.match(/^([A-Za-z0-9]{22})$/);
  return m?.[1];
}

export const fetchPlaylist = (id: string): Promise<SpotifyPlaylist> =>
  id === MELON_TOP100 ? fetchMelonChart() : invoke<SpotifyPlaylist>('spotify_playlist', { id });

// ── 비교 도구 ──────────────────────────────────────────────────────────────

/** 비교용: 소문자, 꾸밈 기호·공백 제거 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’‘'`´′″"“”]/g, '')
    .replace(/[\s\-_.,!?·•/\\:;~]+/g, '');
}

/** 제목 핵심: (feat…), (Explicit Ver.), (Narr…) 같은 꼬리표 제거 */
function coreTitle(title: string): string {
  return title
    .replace(/[([](?:feat|ft|with|prod|narr|explicit|clean|inst|sped|slowed|remaster)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*$/, '')
    .trim();
}

/** "정국 (Jung Kook)" → ["정국(jungkook)", "정국", "jungkook"] */
function nameVariants(name: string): string[] {
  const parts = name.split(/[()（）[\]]/).map(norm).filter(Boolean);
  return [norm(name), ...parts];
}

function overlap(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => x.length > 1 && y.length > 1 && (x === y || x.includes(y) || y.includes(x))));
}

function titleScore(spotifyTitle: string, ytTitle: string): number {
  const a = nameVariants(coreTitle(spotifyTitle));
  const b = nameVariants(coreTitle(ytTitle));
  if (a[0] === b[0]) return 1;
  if (overlap(a, b)) return 0.75;
  return 0;
}

/** 첫(주) 아티스트가 맞으면 1. 피처링 가수는 YouTube Music 쪽에 빠지는 일이 많다("Jung Kook, Latto" ↔ "정국 (Jung Kook)"). */
function artistScore(spotifyArtists: string, track: Track): number {
  const wanted = spotifyArtists.split(/,|&/).map((s) => s.trim()).filter(Boolean);
  const have = track.artists.map((a) => a.name);
  if (!wanted.length || !have.length) return 0;
  const matches = (w: string) => have.some((h) => overlap(nameVariants(w), nameVariants(h)));
  if (matches(wanted[0])) return 1;
  return wanted.filter(matches).length / wanted.length;
}

export function durationScore(ms: number, seconds?: number): number {
  if (!ms || !seconds) return 0.2;
  const diff = Math.abs(ms / 1000 - seconds);
  if (diff <= 3) return 1;
  if (diff <= 8) return 0.5;
  if (diff <= 20) return 0.1;
  return -0.5;
}

export function score(s: SpotifyTrack, t: Track): number {
  let total = 2 * titleScore(s.title, t.title) + 2 * artistScore(s.artists, t) + 1.5 * durationScore(s.durationMs, t.duration);
  if (t.isVideo) total -= 0.4; // 뮤직비디오보다 음원을 고른다
  if (!t.available) total -= 3;
  return total;
}

/**
 * 3.5 이상이면 확실, 2.4 이상이면 "비슷한 곡"으로 표시한다.
 * 예(2026-10-14 차트): 제목·아티스트·길이 모두 맞음 5.5 / 제목+길이(아티스트가 한글 표기) 3.5 /
 * 아티스트+길이(제목이 영문↔한글) 3.5 / 제목+아티스트만(길이 모름) 4.3
 */
const GOOD = 3.5;
const UNSURE = 2.4;

function candidates(result: Awaited<ReturnType<typeof ytm.search>>): Track[] {
  const out: Track[] = [];
  if (result.top?.track) out.push(result.top.track);
  if (result.top) out.push(...result.top.tracks);
  for (const shelf of result.shelves) out.push(...shelf.tracks);
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.videoId) ? false : (seen.add(t.videoId), true)));
}

// ── 찾은 결과 기억(곡 id 기준, 7일) ────────────────────────────────────────

const CACHE_PREFIX = 'spotify-match:v1:';
const CACHE_DAYS = 7;

function readCache(id: string): Match | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { at: number; match: Match };
    if (Date.now() - v.at > CACHE_DAYS * 86400_000) return undefined;
    return v.match;
  } catch {
    return undefined;
  }
}

function writeCache(id: string, match: Match) {
  try {
    localStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ at: Date.now(), match }));
  } catch {
    // 저장 공간이 없으면 다음에 다시 찾으면 된다.
  }
}

/** "노래" 칩 이름(검색 응답에 들어 있는 필터). 필터 값은 검색어마다 달라 응답에서 그때그때 꺼낸다(2026-10-14 확인). */
const SONGS_LABELS = ['노래', 'Songs'];

/**
 * firstBonus: "노래" 검색 1위에 주는 가산점. YouTube Music 검색은 영문 표기를 한글 곡과 이어 준다
 * ("ToTo Lim Young Woong" → 임영웅 "또또", "Let Me Love My Youth" → 한로로 "입춘", 2026-10-14 확인).
 * 길이까지 맞으면(길이를 모르는 멜론은 제목이 똑같으면) "비슷한 곡"이 되고, 확실한 곡으로는 치지 않는다.
 */
const FIRST_SONG_BONUS = 1.0;

function pickBest(s: SpotifyTrack, tracks: Track[], firstBonus = 0): { track?: Track; value: number } {
  let track: Track | undefined;
  let value = -Infinity;
  for (const [i, t] of tracks.entries()) {
    const dur = durationScore(s.durationMs, t.duration);
    // 멜론처럼 곡 길이를 모르면 길이 대신 제목이 겹치는지로 가산점을 준다("비슷한 곡"까지만 오른다).
    // 예: 멜론 "주저하는 연인들을 위해 - 잔나비" ↔ "for lovers who hesitate(주저하는 연인들을 위해) - JANNABI"
    const sure = s.durationMs ? dur >= 1 : titleScore(s.title, t.title) >= 0.75;
    const v = score(s, t) + (i === 0 && sure ? firstBonus : 0);
    if (v > value) {
      track = t;
      value = v;
    }
  }
  return { track, value };
}

export async function matchTrack(s: SpotifyTrack, useCache = true): Promise<Match> {
  if (useCache) {
    const hit = readCache(s.id);
    if (hit) return hit;
  }
  const firstArtist = s.artists.split(',')[0].trim();
  const query = `${coreTitle(s.title)} ${firstArtist}`;
  const all = await ytm.search(query);
  let best = pickBest(s, candidates(all));
  // "전체" 결과에는 곡 길이가 없다. 확실하지 않으면 "노래" 결과(길이 있음)로 한 번 더 찾아
  // 영문↔한글 제목처럼 표기가 다른 곡도 길이로 가려낸다.
  const songs = all.chips.find((c) => SONGS_LABELS.includes(c.label))?.params;
  if (best.value < GOOD && songs) {
    const filtered = pickBest(s, candidates(await ytm.search(query, songs)), FIRST_SONG_BONUS);
    if (filtered.value > best.value) best = filtered;
  }
  const bestScore = best.value;
  const match: Match =
    best.track && bestScore >= GOOD ? { track: best.track, quality: 'good' }
      : best.track && bestScore >= UNSURE ? { track: best.track, quality: 'unsure' }
        : { quality: 'none' };
  if (match.quality !== 'none') writeCache(s.id, match);
  return match;
}

/** 여러 곡을 동시에 몇 개씩 찾는다. 하나 찾을 때마다 onMatch가 불린다. */
export async function matchAll(
  tracks: SpotifyTrack[],
  onMatch: (index: number, match: Match) => void,
  signal: { cancelled: boolean },
  concurrency = 4,
) {
  let next = 0;
  const worker = async () => {
    while (!signal.cancelled && next < tracks.length) {
      const i = next++;
      try {
        onMatch(i, await matchTrack(tracks[i]));
      } catch (err) {
        console.warn('[spotify] 찾기 실패', tracks[i].title, err);
        onMatch(i, { quality: 'none' });
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ── 내 YouTube Music 재생목록으로 저장 ─────────────────────────────────────

const SAVED_PREFIX = 'spotify-saved:v1:';

export function savedPlaylistId(spotifyId: string): string | undefined {
  try {
    return localStorage.getItem(SAVED_PREFIX + spotifyId) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberSavedPlaylist(spotifyId: string, ytmPlaylistId: string) {
  try {
    localStorage.setItem(SAVED_PREFIX + spotifyId, ytmPlaylistId);
  } catch {
    // 기억하지 못하면 다음에 새로 만든다.
  }
}

export function forgetSavedPlaylist(spotifyId: string) {
  try {
    localStorage.removeItem(SAVED_PREFIX + spotifyId);
  } catch {
    // 무시해도 된다.
  }
}

// ── 차트 이름·날짜 ─────────────────────────────────────────────────────────

/** 화면에 보일 이름: "멜론 TOP 100", 나라별 차트는 "Spotify 한국 Top 50", 그 밖은 플레이리스트 이름 */
export function chartTitle(p: Pick<SpotifyPlaylist, 'id' | 'name'>) {
  const chart = chartFor(p.id);
  if (chart?.source === 'melon') return chart.label;
  return chart ? `Spotify ${chart.label} Top 50` : p.name;
}

/** 화면 머리 설명: 어디서 온 목록인지 */
export function chartKind(id: string) {
  const chart = chartFor(id);
  if (chart?.source === 'melon') return '멜론 실시간 차트, 매시간 갱신';
  return chart ? 'Spotify 차트, 매일 갱신' : 'Spotify 플레이리스트';
}

export function todayLabel() {
  return new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── 차트 순서대로 재생·내 재생목록으로 맞추기 ──────────────────────────────

const SYNC_PREFIX = 'spotify-synced:v1:';

/** 저장해 둔 내 재생목록이 지금 찾은 곡들과 순서까지 같은지 */
export function isSynced(spotifyId: string, tracks: Track[]) {
  try {
    return localStorage.getItem(SYNC_PREFIX + spotifyId) === tracks.map((t) => t.videoId).join(',');
  } catch {
    return false;
  }
}

/**
 * ordered[0]부터 차트 순서대로 재생한다. 저장된 내 재생목록이 같으면 그 목록 안에서 재생하고,
 * 아니면 첫 곡을 틀고 나머지를 한 번에 바로 뒤에 넣는다. 대기열에 넣은 곡 수를 돌려준다.
 */
export async function playInChartOrder(spotifyId: string, ordered: Track[], found: Track[]): Promise<number> {
  if (!ordered.length) return 0;
  const saved = savedPlaylistId(spotifyId);
  if (saved && isSynced(spotifyId, found)) {
    const at = found.findIndex((t) => t.videoId === ordered[0].videoId);
    await ytm.playTrack({ ...ordered[0], play: { watchEndpoint: { videoId: ordered[0].videoId, playlistId: saved, index: Math.max(0, at) } } });
    return 1;
  }
  await ytm.playTrack(ordered[0]);
  if (ordered.length > 1) await ytm.queueAdd({ videoIds: ordered.slice(1).map((t) => t.videoId) }, 'next');
  return ordered.length;
}

/** 내 YouTube Music에 비공개 재생목록으로 저장하거나, 이미 있으면 순서까지 맞춰 고친다. 재생목록 id를 돌려준다. */
export async function syncToYouTubeMusic(p: SpotifyPlaylist, tracks: Track[], appName = 'YTM Desktop'): Promise<string> {
  const ids = tracks.map((t) => t.videoId);
  const melon = chartFor(p.id)?.source === 'melon';
  const title = melon ? chartTitle(p) : `${chartTitle(p)} (Spotify)`;
  const description = melon
    ? `${appName}이 멜론 TOP 100(${p.subtitle})을 YouTube Music 곡으로 옮긴 목록입니다. 마지막 갱신: ${todayLabel()}`
    : `${appName}이 Spotify '${p.name}'을 YouTube Music 곡으로 옮긴 목록입니다. 마지막 갱신: ${todayLabel()}`;
  let existing = savedPlaylistId(p.id);
  if (existing) {
    try {
      const current = await ytm.playlist(`VL${existing}`);
      let all = current.tracks;
      let next = current.continuation;
      while (next) {
        const more = await ytm.playlistMore(next);
        all = all.concat(more.tracks);
        next = more.continuation;
      }
      const same = all.length === ids.length && all.every((t, i) => t.videoId === ids[i]);
      if (!same) {
        if (all.length) await ytm.removeFromPlaylist(existing, all);
        await ytm.addToPlaylist(existing, ids);
        await ytm.renamePlaylist(existing, title, description);
      }
      localStorage.setItem(SYNC_PREFIX + p.id, ids.join(','));
      return existing;
    } catch (err) {
      // 사용자가 지웠거나 남의 것이 됐으면 새로 만든다.
      console.warn('[spotify] 저장된 재생목록을 고치지 못해 새로 만듭니다', err);
      forgetSavedPlaylist(p.id);
      existing = undefined;
    }
  }
  const created = await ytm.createPlaylist(title, description, 'PRIVATE', ids);
  rememberSavedPlaylist(p.id, created);
  localStorage.setItem(SYNC_PREFIX + p.id, ids.join(','));
  return created;
}
