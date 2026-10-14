// 테마(색). 실제 색 값은 styles.css의 :root[data-theme='…'] 묶음에 있고, 여기서는 고른 값을 저장·적용한다.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { tk } from '../i18n';
import { createStore, useStore } from './store';

export type ThemeId = 'system' | 'dark' | 'light' | 'midnight' | 'forest' | 'sunset' | 'mono' | 'sakura' | 'album';
type Resolved = Exclude<ThemeId, 'system'>;

export interface ThemeInfo {
  id: ThemeId;
  /** 번역 열쇠(한국어 원문). 화면에서 t(label)로 그린다. */
  label: string;
  /** 번역 열쇠(한국어 원문). 화면에서 t(description)로 그린다. */
  description: string;
  kind: 'dark' | 'light' | 'auto';
  /** 고르기 화면의 미리보기 색: 바탕, 면, 글자, 강조 두 색 */
  preview: { bg: string; surface: string; ink: string; accent: [string, string] };
}

export const THEMES: ThemeInfo[] = [
  { id: 'system', label: tk('시스템 설정'), description: tk('맥·윈도우 화면 모드를 따라 다크와 라이트를 바꿉니다'), kind: 'auto',
    preview: { bg: '#140e1c', surface: '#f6f3f9', ink: '#f4eff8', accent: ['#ff4d6d', '#7b3ff2'] } },
  { id: 'dark', label: tk('다크'), description: tk('밤에 듣기 좋은 짙은 자주색 (기본)'), kind: 'dark',
    preview: { bg: '#140e1c', surface: '#1c1526', ink: '#f4eff8', accent: ['#ff4d6d', '#7b3ff2'] } },
  { id: 'light', label: tk('라이트'), description: tk('밝은 곳에서 보기 편한 흰 바탕'), kind: 'light',
    preview: { bg: '#f6f3f9', surface: '#ffffff', ink: '#1d1426', accent: ['#e8335a', '#6a2fe0'] } },
  { id: 'midnight', label: tk('미드나잇'), description: tk('남색 바탕에 청록 강조'), kind: 'dark',
    preview: { bg: '#0b1120', surface: '#111a2e', ink: '#eaf1ff', accent: ['#14a3c7', '#3b5bdb'] } },
  { id: 'forest', label: tk('숲'), description: tk('짙은 초록 바탕에 연두 강조'), kind: 'dark',
    preview: { bg: '#0e1512', surface: '#141e19', ink: '#ecf5ee', accent: ['#8bd450', '#1fa37a'] } },
  { id: 'sunset', label: tk('노을'), description: tk('따뜻한 갈색 바탕에 주황·산호 강조'), kind: 'dark',
    preview: { bg: '#17100e', surface: '#1f1613', ink: '#fbf1ec', accent: ['#ffb547', '#ff5a5f'] } },
  { id: 'mono', label: tk('모노'), description: tk('색을 뺀 검정·회색'), kind: 'dark',
    preview: { bg: '#101112', surface: '#17181a', ink: '#f2f2f3', accent: ['#f2f2f3', '#b9bbc0'] } },
  { id: 'sakura', label: tk('벚꽃'), description: tk('연분홍 라이트'), kind: 'light',
    preview: { bg: '#fff6f8', surface: '#ffffff', ink: '#2b1520', accent: ['#ff6f9c', '#e0457b'] } },
  { id: 'album', label: tk('앨범 색'), description: tk('지금 듣는 곡의 표지 색을 따라 바뀝니다'), kind: 'dark',
    preview: { bg: '#10161c', surface: '#18222b', ink: '#eef4f8', accent: ['#3cc9d6', '#f2a94b'] } },
];

const KEY = 'ytm-desktop:theme:v1';
const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

function load(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
}

export const themeStore = createStore<ThemeId>(load());
export const useTheme = () => useStore(themeStore, (s) => s);

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function resolveTheme(id: ThemeId): Resolved {
  return id === 'system' ? (systemDark() ? 'dark' : 'light') : id;
}

function apply() {
  const resolved = resolveTheme(themeStore.get());
  document.documentElement.dataset.theme = resolved;
  const info = THEMES.find((t) => t.id === resolved)!;
  // 창 제목 막대 밝기와 창 바탕색(화면을 다시 그리기 전 잠깐 보이는 색)도 맞춘다.
  try {
    const win = getCurrentWindow();
    void win.setTheme(info.kind === 'light' ? 'light' : 'dark').catch((err) => console.warn('[theme] 제목 막대', err));
    void win.setBackgroundColor(info.preview.bg).catch((err) => console.warn('[theme] 창 바탕색', err));
  } catch (err) {
    console.warn('[theme] 창 정보 없음', err);
  }
}

export function setTheme(id: ThemeId) {
  if (!isTheme(id)) return;
  themeStore.set(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // 저장 못 해도 이번 실행에는 적용된다.
  }
  apply();
}

/** 화면을 그리기 전에 부른다(처음 깜빡임 방지). 시스템 모드가 바뀌면 따라간다. */
export function initTheme() {
  apply();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeStore.get() === 'system') apply();
  });
}

/** 캔버스처럼 CSS 변수를 직접 못 쓰는 곳에서 현재 테마 색을 읽는다. */
export function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// ── 앨범 색 테마 ────────────────────────────────────────────────────────────
// 표지 이미지(교차 출처 허용, 2026-10-14 확인)를 작게 그려 가장 선명한 색 두 가지를 뽑고,
// 강조색과 바탕(아주 어둡게)을 그 색으로 바꾼다. 다크 테마 값 위에 덮어쓴다.

const ACCENT_VARS = ['--rose', '--violet', '--rose-soft', '--rose-rgb', '--violet-rgb', '--focus', '--on-accent', '--night', '--dusk', '--plum', '--plum-2', '--bg-rgb'];

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const hex = (rgb: [number, number, number]) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const rgbVar = (rgb: [number, number, number]) => rgb.join(' ');

function toHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

/** 표지에서 선명한 색상(hue) 두 개. 회색조 표지면 null. */
function extractHues(img: HTMLImageElement): { a: number; b: number; sat: number } | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  const bins = new Array(24).fill(0);
  let satSum = 0;
  let weightSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const { h, s, l } = toHsl(data[i], data[i + 1], data[i + 2]);
    const w = s * (1 - Math.abs(l - 0.5) * 2);
    bins[Math.floor(h / 15) % 24] += w;
    satSum += s * w;
    weightSum += w;
  }
  if (weightSum < 8) return null;
  const order = bins.map((w, i) => ({ w, i })).sort((x, y) => y.w - x.w);
  const a = order[0].i * 15 + 7.5;
  // 두 번째 색은 첫 색과 45도 이상 떨어진 것 중 가장 많은 것(없으면 첫 색을 돌린 것)
  const second = order.find((o) => Math.min(Math.abs(o.i * 15 + 7.5 - a), 360 - Math.abs(o.i * 15 + 7.5 - a)) >= 45 && o.w > order[0].w * 0.15);
  return { a, b: second ? second.i * 15 + 7.5 : (a + 40) % 360, sat: satSum / weightSum };
}

function setAccent(h: { a: number; b: number; sat: number } | null) {
  const root = document.documentElement.style;
  if (!h) {
    for (const v of ACCENT_VARS) root.removeProperty(v);
    return;
  }
  const s = Math.max(0.55, Math.min(0.85, h.sat + 0.25));
  const rose = hsl(h.a, s, 0.6);
  const violet = hsl(h.b, s * 0.9, 0.52);
  const soft = hsl(h.a, s, 0.74);
  // 노랑·연두처럼 밝은 색이면 강조 위 글자를 어둡게
  const lum = (0.2126 * rose[0] + 0.7152 * rose[1] + 0.0722 * rose[2]) / 255;
  const night = hsl(h.a, 0.28, 0.07);
  root.setProperty('--rose', hex(rose));
  root.setProperty('--violet', hex(violet));
  root.setProperty('--rose-soft', hex(soft));
  root.setProperty('--rose-rgb', rgbVar(rose));
  root.setProperty('--violet-rgb', rgbVar(violet));
  root.setProperty('--focus', hex(soft));
  root.setProperty('--on-accent', lum > 0.62 ? '#151015' : '#ffffff');
  root.setProperty('--night', hex(night));
  root.setProperty('--dusk', hex(hsl(h.a, 0.24, 0.1)));
  root.setProperty('--plum', hex(hsl(h.a, 0.22, 0.16)));
  root.setProperty('--plum-2', hex(hsl(h.a, 0.2, 0.21)));
  root.setProperty('--bg-rgb', rgbVar(night));
}

/**
 * 앨범 색 테마를 켜 둔다: 테마가 'album'이면 곡이 바뀔 때마다 표지 색을 뽑아 적용하고, 다른 테마면 원래 색으로 둔다.
 * getArtwork: 지금 곡 표지 주소, subscribe: 재생 상태가 바뀔 때 부를 함수 등록. 해제 함수를 돌려준다.
 */
export function startAlbumTheme(getArtwork: () => string, subscribe: (fn: () => void) => () => void): () => void {
  let last = '';
  const update = () => {
    if (themeStore.get() !== 'album') {
      if (last) setAccent(null);
      last = '';
      return;
    }
    const url = getArtwork();
    if (!url || url === last) return;
    last = url;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (last !== url || themeStore.get() !== 'album') return;
      try {
        setAccent(extractHues(img));
      } catch (err) {
        console.warn('[theme] 표지 색을 읽지 못했습니다', err);
      }
    };
    img.src = url;
  };
  update();
  const stopPlayer = subscribe(update);
  const stopTheme = themeStore.subscribe(update);
  return () => {
    stopPlayer();
    stopTheme();
  };
}
