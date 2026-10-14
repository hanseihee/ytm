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

export function toast(text: string, tone: Toast['tone'] = 'info') {
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
}
export const menuStore = createStore<MenuState | null>(null);
export const openMenu = (x: number, y: number, entries: MenuEntry[]) => menuStore.set({ x, y, entries });
export const closeMenu = () => menuStore.set(null);

// ── 대화상자 ───────────────────────────────────────────────────────────────
export const dialogStore = createStore<ReactNode | null>(null);
export const openDialog = (node: ReactNode) => dialogStore.set(node);
export const closeDialog = () => dialogStore.set(null);

// ── 오른쪽 패널·가사 ───────────────────────────────────────────────────────
export type Panel = 'none' | 'queue' | 'eq';
export interface LayoutState {
  panel: Panel;
  lyrics: boolean;
}
export const layoutStore = createStore<LayoutState>({ panel: 'none', lyrics: false });
export const togglePanel = (panel: Panel) =>
  layoutStore.set((s) => ({ ...s, panel: s.panel === panel ? 'none' : panel }));
export const toggleLyrics = (on?: boolean) => layoutStore.set((s) => ({ ...s, lyrics: on ?? !s.lyrics }));
export const useLayout = <S>(select: (s: LayoutState) => S) => useStore(layoutStore, select);

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
