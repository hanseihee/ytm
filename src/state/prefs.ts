// 데스크톱 설정: 곡 알림, 전역 단축키, 영상 창 늘 위. 화면 저장소에 두고 시작할 때와 바꿀 때 Rust에 알린다.
import { createStore, useStore } from '../lib/store';
import { sendPrefs, type Prefs } from '../lib/tauri';

const KEY = 'ytm-desktop:prefs:v1';
const DEFAULT: Prefs = { notifications: true, globalShortcuts: true, videoOnTop: false };

function load(): Prefs {
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULT;
  }
}

export const prefsStore = createStore<Prefs>(load());
/** 등록하지 못한 전역 단축키(다른 앱이 이미 쓰는 등) */
export const shortcutFailures = createStore<string[]>([]);
export const usePrefs = <S>(select: (s: Prefs) => S) => useStore(prefsStore, select);

function push() {
  sendPrefs(prefsStore.get()).then(
    (r) => shortcutFailures.set(r?.failed ?? []),
    (err) => console.warn('[prefs] 적용 실패', err),
  );
}

export function updatePrefs(patch: Partial<Prefs>) {
  prefsStore.set((s) => ({ ...s, ...patch }));
  try {
    localStorage.setItem(KEY, JSON.stringify(prefsStore.get()));
  } catch {
    // 저장 못 해도 이번 실행에는 적용된다.
  }
  push();
}

export function startPrefsSync() {
  push();
}

/** 전역 단축키 목록(desktop.rs SHORTCUTS와 같다). 맥은 ⌃⌥, 윈도우는 Ctrl+Alt. */
export const SHORTCUT_LIST: { key: string; label: string }[] = [
  { key: 'P', label: '재생/일시정지' },
  { key: 'N', label: '다음 곡' },
  { key: 'B', label: '이전 곡' },
  { key: 'L', label: '좋아요' },
  { key: 'M', label: '미니 플레이어' },
];
