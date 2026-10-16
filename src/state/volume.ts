// 음량: 재생 바 막대·휠·단축키(⌘/Ctrl+↑↓, M)가 함께 쓴다.
// 엔진이 새 값을 알려 오기 전(0.1~0.3초)에도 바로 보이고, 단축키를 빠르게 여러 번 눌러도 이어서 오르내리도록
// 바꾼 값을 잠시 들고 있다가 엔진이 알려 준 값으로 넘긴다.
import { t } from '../i18n';
import { createStore, useStore } from '../lib/store';
import * as ytm from '../lib/ytm/client';
import { playerStore } from './player';
import { toast, toastError } from './ui';

/** 단축키·휠 한 칸에 바뀌는 음량(%) */
export const VOLUME_STEP = 5;
/** 막대를 끄는 동안 엔진에 보내는 간격 */
const SEND_DELAY_MS = 120;
/** 엔진이 새 값을 알려 올 때까지 바꾼 값을 들고 있는 시간 */
const HOLD_MS = 800;

/** 화면에서 바꾸고 아직 엔진 값으로 확인되지 않은 음량(없으면 null) */
const pendingStore = createStore<number | null>(null);
export const usePendingVolume = () => useStore(pendingStore, (v) => v);

let sendTimer = 0;
let holdTimer = 0;
/** 마지막으로 들리던 음량 — 음량 0에서 소리를 켤 때 되돌린다 */
let lastAudible = 0;
const remember = () => {
  const s = playerStore.get();
  if (!s.muted && s.volume > 0) lastAudible = s.volume;
};
remember();
playerStore.subscribe(remember);

const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)));

/** 지금 보이는 음량(음소거면 0) */
export function shownVolume(): number {
  const pending = pendingStore.get();
  if (pending !== null) return pending;
  const s = playerStore.get();
  return s.muted ? 0 : s.volume;
}

const announce = (v: number) => toast(v === 0 ? t('음소거') : t('음량 {n}%', { n: v }), 'info', 'volume');

/** 음량을 정한다. 0보다 크면 음소거도 푼다(엔진 control volume). announce면 알림으로 값을 보여 준다(단축키). */
export function setVolume(value: number, opts: { announce?: boolean } = {}) {
  const v = clamp(value);
  pendingStore.set(v);
  if (v > 0) lastAudible = v;
  if (opts.announce) announce(v);
  window.clearTimeout(sendTimer);
  window.clearTimeout(holdTimer);
  sendTimer = window.setTimeout(() => {
    ytm.control('volume', v).then(
      () => {
        holdTimer = window.setTimeout(() => {
          if (pendingStore.get() === v) pendingStore.set(null);
        }, HOLD_MS);
      },
      (err) => {
        if (pendingStore.get() === v) pendingStore.set(null);
        toastError(err, t('음량을 바꾸지 못했습니다'));
      },
    );
  }, SEND_DELAY_MS);
}

/** 한 칸 올리기·내리기(delta는 ±VOLUME_STEP 같은 %) */
export function stepVolume(delta: number) {
  setVolume(shownVolume() + delta, { announce: true });
}

/** 음소거 켜고 끄기. 음량이 0이라 안 들리면 마지막으로 들리던 음량으로 되돌린다. */
export function toggleMute(opts: { announce?: boolean } = {}) {
  const s = playerStore.get();
  if (!s.muted && shownVolume() > 0) {
    ytm.control('mute').then(
      () => opts.announce && announce(0),
      (err) => toastError(err, t('음소거를 바꾸지 못했습니다')),
    );
    return;
  }
  if (s.muted && s.volume > 0 && pendingStore.get() === null) {
    ytm.control('unmute').then(
      () => opts.announce && announce(s.volume),
      (err) => toastError(err, t('음소거를 바꾸지 못했습니다')),
    );
    return;
  }
  setVolume(lastAudible || 50, opts);
}
