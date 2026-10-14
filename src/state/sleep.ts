// 수면 타이머: 정한 시간이 지나거나 지금 곡이 끝나면 멈춘다. 시간 타이머는 마지막 10초 동안 소리를 서서히 줄인다.
import { createStore, useStore } from '../lib/store';
import * as ytm from '../lib/ytm/client';
import { currentPosition, playerStore } from './player';
import { toast } from './ui';

export type SleepMode = 'off' | 'time' | 'track';
export interface SleepState {
  mode: SleepMode;
  /** time: 멈출 시각(ms) */
  endsAt?: number;
  /** track: 이 곡이 끝나면 */
  videoId?: string;
}

export const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60, 90, 120];
const FADE_SECONDS = 10;

export const sleepStore = createStore<SleepState>({ mode: 'off' });
export const useSleep = <S>(select: (s: SleepState) => S) => useStore(sleepStore, select);

let timer = 0;
let fadeFrom: number | null = null;

export function startSleep(minutes: number) {
  restoreVolume();
  sleepStore.set({ mode: 'time', endsAt: Date.now() + minutes * 60_000 });
  run();
  toast(`${minutes}분 뒤에 재생을 멈춥니다`);
}

export function startSleepAfterTrack() {
  const { videoId } = playerStore.get();
  if (!videoId) return;
  restoreVolume();
  sleepStore.set({ mode: 'track', videoId });
  run();
  toast('지금 곡이 끝나면 멈춥니다');
}

export function cancelSleep(quiet = false) {
  window.clearInterval(timer);
  timer = 0;
  restoreVolume();
  sleepStore.set({ mode: 'off' });
  if (!quiet) toast('수면 타이머를 껐습니다');
}

function restoreVolume() {
  if (fadeFrom !== null) {
    const v = fadeFrom;
    fadeFrom = null;
    void ytm.control('volume', v).catch(() => undefined);
  }
}

async function stopNow() {
  window.clearInterval(timer);
  timer = 0;
  sleepStore.set({ mode: 'off' });
  try {
    await ytm.control('pause');
  } finally {
    // 다음에 틀 때는 원래 음량으로
    window.setTimeout(restoreVolume, 1200);
  }
  toast('수면 타이머로 재생을 멈췄습니다');
}

function run() {
  window.clearInterval(timer);
  timer = window.setInterval(() => {
    const s = sleepStore.get();
    const p = playerStore.get();
    if (s.mode === 'time' && s.endsAt) {
      const left = (s.endsAt - Date.now()) / 1000;
      if (left <= 0) return void stopNow();
      if (left <= FADE_SECONDS && p.playing) {
        if (fadeFrom === null) fadeFrom = p.muted ? 0 : p.volume;
        const v = Math.max(0, Math.round((fadeFrom * left) / FADE_SECONDS));
        void ytm.control('volume', v).catch(() => undefined);
      }
    } else if (s.mode === 'track') {
      // 곡이 바뀌었거나(자동으로 다음 곡이 시작됨) 끝나기 직전이면 멈춘다.
      if (p.videoId && p.videoId !== s.videoId) return void stopNow();
      if (p.duration > 0 && currentPosition(p) >= p.duration - 1.2) return void stopNow();
    } else {
      cancelSleep(true);
    }
  }, 500);
}

/** 남은 시간 "12:30" (time) 또는 "곡 끝" (track) */
export function sleepLabel(s: SleepState, now = Date.now()): string {
  if (s.mode === 'track') return '곡 끝';
  if (s.mode !== 'time' || !s.endsAt) return '';
  const left = Math.max(0, Math.round((s.endsAt - now) / 1000));
  const m = Math.floor(left / 60);
  return `${m}:${String(left % 60).padStart(2, '0')}`;
}
