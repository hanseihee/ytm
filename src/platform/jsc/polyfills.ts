// JavaScriptCore에는 브라우저 기능(fetch, localStorage, setTimeout, console, URLSearchParams)이 없어
// 데스크톱과 같은 데이터 코드가 쓰는 만큼만 앱 기능으로 채운다.
import { native, request } from './native';

const g = globalThis as unknown as Record<string, unknown>;

const text = (parts: unknown[]) =>
  parts.map((p) => (p instanceof Error ? `${p.message}` : typeof p === 'string' ? p : (() => {
    try {
      return JSON.stringify(p);
    } catch {
      return String(p);
    }
  })())).join(' ');

g.console = {
  log: (...a: unknown[]) => native.log('log', text(a)),
  info: (...a: unknown[]) => native.log('info', text(a)),
  debug: (...a: unknown[]) => native.log('debug', text(a)),
  warn: (...a: unknown[]) => native.log('warn', text(a)),
  error: (...a: unknown[]) => native.log('error', text(a)),
};

// ── 타이머 ─────────────────────────────────────────────────────────────────
const timers = new Map<number, () => void>();
let timerSeq = 0;
g.setTimeout = (fn: () => void, ms = 0) => {
  const id = ++timerSeq;
  timers.set(id, fn);
  native.timer(id, Math.max(0, Number(ms) || 0));
  return id;
};
g.clearTimeout = (id: number) => {
  timers.delete(id);
};
g.__timerFire = (id: number) => {
  const fn = timers.get(id);
  timers.delete(id);
  fn?.();
};

// ── 저장소(앱의 UserDefaults) ──────────────────────────────────────────────
g.localStorage = {
  getItem: (key: string) => native.storageGet(String(key)),
  setItem: (key: string, value: string) => native.storageSet(String(key), String(value)),
  removeItem: (key: string) => native.storageRemove(String(key)),
};

// ── URLSearchParams(가사 검색 주소 만들기에 쓰는 만큼) ─────────────────────
if (typeof g.URLSearchParams === 'undefined') {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
  g.URLSearchParams = class {
    private list: [string, string][] = [];
    constructor(init?: Record<string, string>) {
      for (const [k, v] of Object.entries(init ?? {})) this.list.push([k, String(v)]);
    }
    append(k: string, v: string) {
      this.list.push([k, String(v)]);
    }
    toString() {
      return this.list.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
    }
  };
}

// ── fetch(가사 LRCLIB에 쓰는 만큼: GET, 머리글, status/ok/json/text) ───────
g.fetch = async (input: string, init?: { method?: string; headers?: Record<string, string> }) => {
  const res = (await request('fetch', String(input), JSON.stringify({ method: init?.method ?? 'GET', headers: init?.headers ?? {} }))) as {
    status: number;
    body: string;
  };
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    json: async () => JSON.parse(res.body),
    text: async () => res.body,
  };
};
