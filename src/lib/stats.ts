// 청취 기록·통계(이 기기에만 저장). 데스크톱 화면과 iOS(JavaScriptCore)가 같은 코드를 쓴다.
// 재생 상태를 받을 때마다 recordState를 부르면, 곡이 바뀔 때 30초 이상(또는 곡 길이의 절반 이상) 들은 곡을 한 번으로 남긴다.
import { locale } from '../i18n';

export interface PlayRecord {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  /** 듣기 시작한 시각(ms) */
  at: number;
  /** 실제로 들은 시간(초) */
  seconds: number;
}

interface StateLike {
  videoId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  playing: boolean;
  buffering?: boolean;
  ad?: boolean;
}

const KEY = 'ytm:plays:v1';
const MAX_RECORDS = 5000;
/** 상태 보고 사이가 이보다 길면(앱이 잠들었다 깨어남 등) 그만큼만 센다(초) */
const MAX_STEP = 10;
const MIN_SECONDS = 30;

let current: { id: string; title: string; artist: string; artwork: string; duration: number; at: number; listened: number; lastAt: number; playing: boolean } | null = null;

export function plays(): PlayRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? (raw as PlayRecord[]) : [];
  } catch {
    return [];
  }
}

function save(list: PlayRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_RECORDS)));
  } catch {
    // 저장 공간이 모자라면 이번 기록만 잃는다.
  }
}

function finish() {
  const c = current;
  current = null;
  if (!c) return;
  const enough = c.listened >= MIN_SECONDS || (c.duration > 0 && c.listened >= c.duration * 0.5 && c.listened >= 10);
  if (!enough) return;
  const list = plays();
  list.push({ id: c.id, title: c.title, artist: c.artist, artwork: c.artwork, at: c.at, seconds: Math.round(c.listened) });
  save(list);
}

/** 재생 상태가 올 때마다 부른다. 광고는 세지 않는다. */
export function recordState(s: StateLike, now = Date.now()) {
  if (s.ad) {
    if (current) {
      current.lastAt = now;
      current.playing = false;
    }
    return;
  }
  if (!current || current.id !== s.videoId) {
    finish();
    if (s.videoId) {
      current = { id: s.videoId, title: s.title, artist: s.artist, artwork: s.artwork, duration: s.duration, at: now, listened: 0, lastAt: now, playing: s.playing && !s.buffering };
    }
    return;
  }
  if (current.playing) current.listened += Math.min(Math.max(0, (now - current.lastAt) / 1000), MAX_STEP);
  current.lastAt = now;
  current.playing = s.playing && !s.buffering;
  if (s.title) current.title = s.title;
  if (s.artist) current.artist = s.artist;
  if (s.artwork) current.artwork = s.artwork;
  if (s.duration > 0) current.duration = s.duration;
}

/** 앱을 닫을 때 듣던 곡을 기록에 넣는다. */
export function flushPlays() {
  finish();
}

export type StatsRange = 'week' | 'month' | 'year' | 'all';

export interface StatsSummary {
  range: StatsRange;
  totalSeconds: number;
  playCount: number;
  topTracks: { id: string; title: string; artist: string; artwork: string; count: number; seconds: number }[];
  topArtists: { name: string; count: number; seconds: number }[];
  /** 막대 그래프: 최근 날(주 7일, 그 밖 30일)별 들은 시간 */
  days: { label: string; seconds: number }[];
}

const DAY = 86_400_000;

function rangeStart(range: StatsRange, now: number) {
  if (range === 'week') return now - 7 * DAY;
  if (range === 'month') return now - 30 * DAY;
  if (range === 'year') return now - 365 * DAY;
  return 0;
}

/**
 * 막대 그래프 날짜 이름 만드는 함수. 한국어는 원래 모양("10/14") 그대로, 다른 언어는 그 언어 표기(de "14.10.", fr "14/10").
 * Intl이 없거나 실패하면(JavaScriptCore 대비) 한국어와 같은 모양.
 */
function dayLabeler(): (d: Date) => string {
  const plain = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const lang = locale();
  if (lang === 'ko') return plain;
  try {
    const fmt = new Intl.DateTimeFormat(lang, { month: 'numeric', day: 'numeric' });
    return (d) => fmt.format(d);
  } catch {
    return plain;
  }
}

/** "아이유, 성시경 & 박효신" → ["아이유", "성시경", "박효신"] */
function splitArtists(artist: string): string[] {
  return artist.split(/\s*(?:,|&| x | X |\bfeat\.?\b|\bwith\b)\s*/).map((a) => a.trim()).filter(Boolean);
}

export function statsSummary(range: StatsRange, now = Date.now()): StatsSummary {
  const from = rangeStart(range, now);
  const list = plays().filter((p) => p.at >= from);
  const tracks = new Map<string, StatsSummary['topTracks'][number]>();
  const artists = new Map<string, StatsSummary['topArtists'][number]>();
  let totalSeconds = 0;
  for (const p of list) {
    totalSeconds += p.seconds;
    const t = tracks.get(p.id) ?? { id: p.id, title: p.title, artist: p.artist, artwork: p.artwork, count: 0, seconds: 0 };
    t.count += 1;
    t.seconds += p.seconds;
    t.title = p.title || t.title;
    t.artwork = p.artwork || t.artwork;
    tracks.set(p.id, t);
    for (const name of splitArtists(p.artist)) {
      const a = artists.get(name) ?? { name, count: 0, seconds: 0 };
      a.count += 1;
      a.seconds += p.seconds;
      artists.set(name, a);
    }
  }
  const byPlays = <T extends { count: number; seconds: number }>(a: T, b: T) => b.count - a.count || b.seconds - a.seconds;
  const dayCount = range === 'week' ? 7 : 30;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dayLabel = dayLabeler();
  const days = Array.from({ length: dayCount }, (_, i) => {
    const start = today.getTime() - (dayCount - 1 - i) * DAY;
    const d = new Date(start);
    const seconds = list.filter((p) => p.at >= start && p.at < start + DAY).reduce((sum, p) => sum + p.seconds, 0);
    return { label: dayLabel(d), seconds };
  });
  return {
    range,
    totalSeconds,
    playCount: list.length,
    topTracks: [...tracks.values()].sort(byPlays).slice(0, 20),
    topArtists: [...artists.values()].sort(byPlays).slice(0, 15),
    days,
  };
}

export function clearPlays() {
  current = null;
  save([]);
}
