// 알림(토스트)·우클릭 메뉴·대화상자·오른쪽 패널 상태.
import type { ReactNode } from 'react';
import { createStore, useStore } from '../lib/store';
import { describeError } from '../lib/tauri';

// ── 알림 ───────────────────────────────────────────────────────────────────
export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}
export const toastStore = createStore<Toast[]>([]);
let toastId = 0;
/** 같은 이름(key)으로 띄운 알림: 새로 쌓지 않고 글자만 바꾼다(음량처럼 빠르게 이어지는 알림). */
const keyedToasts = new Map<string, { id: number; timer: number }>();

export function toast(text: string, tone: Toast['tone'] = 'info', key?: string) {
  if (key) {
    const prev = keyedToasts.get(key);
    if (prev) clearTimeout(prev.timer);
    const alive = !!prev && toastStore.get().some((t) => t.id === prev.id);
    const id = alive ? prev!.id : ++toastId;
    toastStore.set((list) => (alive ? list.map((t) => (t.id === id ? { ...t, text, tone } : t)) : [...list.slice(-2), { id, text, tone }]));
    const timer = window.setTimeout(() => {
      keyedToasts.delete(key);
      toastStore.set((list) => list.filter((t) => t.id !== id));
    }, 1600);
    keyedToasts.set(key, { id, timer });
    return;
  }
  const id = ++toastId;
  toastStore.set((list) => [...list.slice(-2), { id, text, tone }]);
  setTimeout(() => toastStore.set((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3200);
}

export function toastError(err: unknown, prefix?: string) {
  const message = describeError(err);
  console.warn('[ytm-desktop]', prefix ?? '', err);
  toast(prefix ? `${prefix}: ${message}` : message, 'error');
}

// ── 우클릭 메뉴 ────────────────────────────────────────────────────────────
export interface MenuEntry {
  label: string;
  action?: () => void | Promise<void>;
  /** 하위 메뉴(플레이리스트 목록 등). 함수면 열 때 불러온다. */
  submenu?: MenuEntry[] | (() => Promise<MenuEntry[]>);
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}
export interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
  /** y를 메뉴 아래 끝으로 삼아 위로 펼친다(재생 바의 단추처럼 화면 아래에서 열 때) */
  above?: boolean;
}
export const menuStore = createStore<MenuState | null>(null);
export const openMenu = (x: number, y: number, entries: MenuEntry[], opts: { above?: boolean } = {}) =>
  menuStore.set({ x, y, entries, above: opts.above });
export const closeMenu = () => menuStore.set(null);

// ── 대화상자 ───────────────────────────────────────────────────────────────
export const dialogStore = createStore<ReactNode | null>(null);
export const openDialog = (node: ReactNode) => dialogStore.set(node);
export const closeDialog = () => dialogStore.set(null);

// ── 오른쪽 패널·가사 ───────────────────────────────────────────────────────
export type Panel = 'none' | 'queue' | 'eq';
/** 오른쪽 "지금 곡" 패널의 탭(YouTube Music의 다음 트랙·관련 항목·댓글) */
export type PanelTab = 'queue' | 'related' | 'comments';
export interface LayoutState {
  panel: Panel;
  panelTab: PanelTab;
  lyrics: boolean;
  /** 영상 창이 열려 있는지(Rust video-window 이벤트) */
  video: boolean;
}
export const layoutStore = createStore<LayoutState>({ panel: 'none', panelTab: 'queue', lyrics: false, video: false });
export const openPanelTab = (tab: PanelTab) => layoutStore.set((s) => ({ ...s, panel: 'queue', panelTab: tab }));
export const setPanelTab = (tab: PanelTab) => layoutStore.set((s) => ({ ...s, panelTab: tab }));
export const togglePanel = (panel: Panel) =>
  layoutStore.set((s) => ({ ...s, panel: s.panel === panel ? 'none' : panel }));
export const toggleLyrics = (on?: boolean) => layoutStore.set((s) => ({ ...s, lyrics: on ?? !s.lyrics }));
export const useLayout = <S>(select: (s: LayoutState) => S) => useStore(layoutStore, select);

// ── 지금 재생 화면: 가사 / 앨범 표지 ──────────────────────────────────────
export type LyricsViewMode = 'lyrics' | 'cover';
const LYRICS_VIEW_KEY = 'ytm-desktop:lyrics-view';

function loadLyricsView(): LyricsViewMode {
  try {
    return localStorage.getItem(LYRICS_VIEW_KEY) === 'cover' ? 'cover' : 'lyrics';
  } catch {
    return 'lyrics';
  }
}

export const lyricsViewStore = createStore<LyricsViewMode>(loadLyricsView());
export const useLyricsView = () => useStore(lyricsViewStore, (s) => s);

/** 가사와 앨범 표지 중 무엇을 크게 볼지. 고른 값은 다음 실행에도 쓴다. */
export function setLyricsView(mode: LyricsViewMode) {
  lyricsViewStore.set(mode);
  try {
    localStorage.setItem(LYRICS_VIEW_KEY, mode);
  } catch {
    // 저장하지 못해도 이번 실행에는 적용된다.
  }
}

// ── 가사 글자 크기 ─────────────────────────────────────────────────────────
/** 가사 글자 배율 단계(기본 1). 고른 값은 다음 실행에도 쓴다. */
export const LYRIC_SCALES = [0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.75];
const LYRIC_SCALE_KEY = 'ytm-desktop:lyrics-scale';

function loadLyricScale(): number {
  try {
    const v = Number(localStorage.getItem(LYRIC_SCALE_KEY));
    return LYRIC_SCALES.includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

export const lyricScaleStore = createStore<number>(loadLyricScale());
export const useLyricScale = () => useStore(lyricScaleStore, (s) => s);

/** 1: 한 단계 크게, -1: 한 단계 작게, 0: 기본 크기 */
export function stepLyricScale(dir: -1 | 0 | 1) {
  const cur = LYRIC_SCALES.indexOf(lyricScaleStore.get());
  const base = LYRIC_SCALES.indexOf(1);
  const next = dir === 0 ? base : Math.max(0, Math.min(LYRIC_SCALES.length - 1, (cur < 0 ? base : cur) + dir));
  const value = LYRIC_SCALES[next];
  lyricScaleStore.set(value);
  try {
    localStorage.setItem(LYRIC_SCALE_KEY, String(value));
  } catch {
    // 저장하지 못해도 이번 실행에는 적용된다.
  }
}
