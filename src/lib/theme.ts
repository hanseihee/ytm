// 테마(색). 실제 색 값은 styles.css의 :root[data-theme='…'] 묶음에 있고, 여기서는 고른 값을 저장·적용한다.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createStore, useStore } from './store';

export type ThemeId = 'system' | 'dark' | 'light' | 'midnight' | 'forest' | 'sunset' | 'mono' | 'sakura';
type Resolved = Exclude<ThemeId, 'system'>;

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  description: string;
  kind: 'dark' | 'light' | 'auto';
  /** 고르기 화면의 미리보기 색: 바탕, 면, 글자, 강조 두 색 */
  preview: { bg: string; surface: string; ink: string; accent: [string, string] };
}

export const THEMES: ThemeInfo[] = [
  { id: 'system', label: '시스템 설정', description: '맥·윈도우 화면 모드를 따라 다크와 라이트를 바꿉니다', kind: 'auto',
    preview: { bg: '#140e1c', surface: '#f6f3f9', ink: '#f4eff8', accent: ['#ff4d6d', '#7b3ff2'] } },
  { id: 'dark', label: '다크', description: '밤에 듣기 좋은 짙은 자주색 (기본)', kind: 'dark',
    preview: { bg: '#140e1c', surface: '#1c1526', ink: '#f4eff8', accent: ['#ff4d6d', '#7b3ff2'] } },
  { id: 'light', label: '라이트', description: '밝은 곳에서 보기 편한 흰 바탕', kind: 'light',
    preview: { bg: '#f6f3f9', surface: '#ffffff', ink: '#1d1426', accent: ['#e8335a', '#6a2fe0'] } },
  { id: 'midnight', label: '미드나잇', description: '남색 바탕에 청록 강조', kind: 'dark',
    preview: { bg: '#0b1120', surface: '#111a2e', ink: '#eaf1ff', accent: ['#14a3c7', '#3b5bdb'] } },
  { id: 'forest', label: '숲', description: '짙은 초록 바탕에 연두 강조', kind: 'dark',
    preview: { bg: '#0e1512', surface: '#141e19', ink: '#ecf5ee', accent: ['#8bd450', '#1fa37a'] } },
  { id: 'sunset', label: '노을', description: '따뜻한 갈색 바탕에 주황·산호 강조', kind: 'dark',
    preview: { bg: '#17100e', surface: '#1f1613', ink: '#fbf1ec', accent: ['#ffb547', '#ff5a5f'] } },
  { id: 'mono', label: '모노', description: '색을 뺀 검정·회색', kind: 'dark',
    preview: { bg: '#101112', surface: '#17181a', ink: '#f2f2f3', accent: ['#f2f2f3', '#b9bbc0'] } },
  { id: 'sakura', label: '벚꽃', description: '연분홍 라이트', kind: 'light',
    preview: { bg: '#fff6f8', surface: '#ffffff', ink: '#2b1520', accent: ['#ff6f9c', '#e0457b'] } },
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
