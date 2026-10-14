// 앨범 표지 아래 스펙트럼(앨범 표지 화면·전체 화면 모드가 같이 쓴다).
import { useEffect, useRef, useState } from 'react';
import { keepVisualizer, onSpectrum } from '../lib/eq';
import { cssColor, themeStore } from '../lib/theme';

/** 스펙트럼 한쪽 막대 수. 낮은 음이 가운데, 높은 음이 양 끝으로 퍼진다. */
const AURA_HALF = 24;

/**
 * 앨범 표지 아래 스펙트럼: 가운데서 양옆으로 퍼지는 좌우 대칭 막대, 은은한 빛과 바닥에 비친 그림자.
 * 색은 테마를 따른다(앨범 색 테마면 표지에서 뽑은 색). 맥은 오디오 캡처를 이미 허용했을 때만 움직이고(권한을 묻지 않는다),
 * 멈췄거나 소리 정보가 없으면 작은 점들이 천천히 숨 쉬듯 움직인다.
 */
export function CoverSpectrum({ playing, width, className = 'lyrics__aura' }: { playing: boolean; width: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bars = useRef<number[]>([]);
  const barsAt = useRef(0);
  const [visible, setVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    const unlisten = onSpectrum((next) => {
      bars.current = next;
      barsAt.current = performance.now();
    });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void unlisten.then((f) => f());
    };
  }, []);

  // 창이 보이고 재생 중일 때만 스펙트럼을 받는다(아니면 몇 초 뒤 알아서 멈춘다).
  useEffect(() => (playing && visible ? keepVisualizer(false) : undefined), [playing, visible]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let colors = { low: '', high: '' };
    const readColors = () => {
      colors = { low: cssColor('--violet', '#7b3ff2'), high: cssColor('--rose', '#ff4d6d') };
    };
    readColors();
    const stopTheme = themeStore.subscribe(() => requestAnimationFrame(readColors));
    // 높이 = (최근 가장 큰 소리 아래 40dB 안에서 얼마나 큰지) × (그 칸이 자기 평균보다 얼마나 커졌는지).
    // 큰 소리 기준만 쓰던 때는 요즘 음악에서 막대가 시간의 절반 넘게 끝까지 차 있었다. 합성 팝으로 맞춘 값(2026-10-14):
    // 끝까지(90% 이상) 차는 시간 54% → 2%, 평균 높이 0.77 → 0.39, 중·고음 움직임 2~3배.
    const shown = new Float32Array(AURA_HALF);
    const goal = new Float32Array(AURA_HALF);
    const base = new Float32Array(AURA_HALF).fill(Number.NaN);
    // 받는 막대 48개(30Hz~16kHz 로그 간격, 0~255 = −100~−10dB) 중 소리가 실제로 있는 1~39번(약 35Hz~8kHz)을 24칸으로 묶는다.
    const FROM = 1;
    const TO = 40;
    const DB_RANGE = 90;
    /** 높은 음은 원래 약해서 받은 막대 하나마다 1dB씩 올려 본다. */
    const TILT_DB = 1;
    /** 최근 가장 큰 소리(dB). 초당 3dB씩 내려와 조용한 곡도 움직인다. */
    let ref = 0;
    let seen = 0;
    let lastFrame = 0;
    let raf = 0;
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
      lastFrame = now;
      // 0.4초 안에 받은 값이 있으면 소리에 맞춰, 아니면 쉬는 점으로
      const live = now - barsAt.current < 400;
      if (!live) {
        goal.fill(0);
      } else if (barsAt.current !== seen) {
        // 새 막대(초당 25번)가 왔을 때만 목표 높이를 다시 정한다.
        const step = seen ? Math.min(0.5, (barsAt.current - seen) / 1000) : 0.04;
        seen = barsAt.current;
        const db = new Float32Array(AURA_HALF);
        let peak = 0;
        for (let i = 0; i < AURA_HALF; i++) {
          const a = FROM + Math.floor((i * (TO - FROM)) / AURA_HALF);
          const b = Math.max(a + 1, FROM + Math.floor(((i + 1) * (TO - FROM)) / AURA_HALF));
          let m = 0;
          for (let k = a; k < b; k++) m = Math.max(m, bars.current[k] ?? 0);
          db[i] = (m / 255) * DB_RANGE + TILT_DB * (a - FROM);
          peak = Math.max(peak, db[i]);
        }
        ref = Math.max(peak, ref - 3 * step);
        for (let i = 0; i < AURA_HALF; i++) {
          // 칸마다 1.5초 평균: 박자·소리가 그 칸의 평소보다 커질 때 튀어 오른다.
          base[i] = Number.isNaN(base[i]) ? db[i] : base[i] + (db[i] - base[i]) * Math.min(1, step / 1.5);
          const steady = Math.min(1, Math.max(0, (db[i] - (ref - 40)) / 40));
          const lift = Math.min(1, Math.max(0, (db[i] - base[i] + 2) / 10));
          goal[i] = 0.95 * Math.min(1, Math.pow(steady, 1.2) * (0.3 + 0.8 * lift));
        }
      }
      for (let i = 0; i < AURA_HALF; i++) {
        // 빠르게 오르고(0.03초) 천천히 내려온다(0.16초).
        const tau = goal[i] > shown[i] ? 0.03 : 0.16;
        shown[i] = reduce ? goal[i] : shown[i] + (goal[i] - shown[i]) * (1 - Math.exp(-dt / tau));
      }

      const n = AURA_HALF * 2;
      const gap = Math.max(2, (w / n) * 0.42);
      const bw = (w - gap * (n - 1)) / n;
      const dot = Math.min(bw, 4);
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, colors.low);
      grad.addColorStop(1, colors.high);
      ctx.fillStyle = grad;
      ctx.shadowColor = colors.high;
      const t = now / 1000;
      for (let j = 0; j < n; j++) {
        const i = j < AURA_HALF ? AURA_HALF - 1 - j : j - AURA_HALF;
        const v = shown[i];
        // 쉬는 동안에는 가운데부터 물결치듯 아주 조금 오르내린다.
        const breathe = reduce ? 0 : ((Math.sin(t * 1.7 - i * 0.38) + 1) / 2) * (1 - Math.min(1, v * 4)) * 3;
        const bh = Math.min(h, dot + v * (h - dot) + breathe);
        ctx.globalAlpha = 0.5 + 0.5 * Math.min(1, v * 1.6);
        ctx.shadowBlur = 6 + 14 * v;
        ctx.beginPath();
        ctx.roundRect(j * (bw + gap), h - bh, bw, bh, bw / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      stopTheme();
    };
  }, []);

  return <canvas ref={canvas} className={className} style={{ width }} aria-hidden="true" />;
}
