// 재생 상태: 엔진이 보내는 값 + 그 사이 재생 위치를 시계로 이어서 계산.
import { useEffect, useState } from 'react';
import { createStore, useStore } from '../lib/store';
import { getPlayerState, onPlayerState, type PlayerState } from '../lib/tauri';
import { flushPlays, recordState } from '../lib/stats';

export const EMPTY_PLAYER: PlayerState = {
  videoId: '',
  title: '',
  artist: '',
  album: '',
  artwork: '',
  duration: 0,
  position: 0,
  playing: false,
  buffering: false,
  ad: false,
  likeStatus: 'INDIFFERENT',
  repeat: 'NONE',
  volume: 100,
  muted: false,
  at: 0,
};

export const playerStore = createStore<PlayerState>(EMPTY_PLAYER);

/** 화면에서 바로 바꾼 값(탐색 막대를 놓은 직후 등)을 엔진 답이 오기 전까지 보여 준다. */
export function patchPlayer(patch: Partial<PlayerState>) {
  playerStore.set((s) => ({ ...s, ...patch, at: Date.now() }));
}

export async function startPlayerSync(record = true) {
  const first = await getPlayerState();
  if (first && typeof first === 'object' && 'videoId' in first) playerStore.set({ ...EMPTY_PLAYER, ...first });
  // 청취 기록(이 기기에만): 미니 플레이어 창은 기록하지 않는다(같은 곡이 두 번 세어지지 않게).
  if (record) window.addEventListener('beforeunload', () => flushPlays());
  return onPlayerState((s) => {
    playerStore.set({ ...EMPTY_PLAYER, ...s });
    if (record) recordState({ ...EMPTY_PLAYER, ...s });
  });
}

export function currentPosition(s: PlayerState, now = Date.now()): number {
  if (!s.playing || s.buffering || !s.at) return s.position;
  const pos = s.position + (now - s.at) / 1000;
  return s.duration > 0 ? Math.min(pos, s.duration) : pos;
}

export const usePlayer = <S>(select: (s: PlayerState) => S) => useStore(playerStore, select);

/** 재생 위치를 화면 갱신 주기에 맞춰 이어서 계산한다(가사·진행 막대용). */
export function usePosition(fps = 30): number {
  const [pos, setPos] = useState(() => currentPosition(playerStore.get()));
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last >= 1000 / fps) {
        last = t;
        setPos(currentPosition(playerStore.get()));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps]);
  return pos;
}

export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '-:--';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
