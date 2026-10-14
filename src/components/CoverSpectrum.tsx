// 앨범 표지 아래 스펙트럼(앨범 표지 화면·전체 화면 모드가 같이 쓴다).
import { useEffect, useRef, useState } from 'react';
import { keepVisualizer, onSpectrum } from '../lib/eq';
import { cssColor, themeStore } from '../lib/theme';

/** 막대 수: 받는 막대(30Hz~16kHz 로그 간격) 48개를 이퀄라이저 패널과 같은 순서로 그대로 그린다. */
const BARS = 48;

/**
 * 앨범 표지 아래 스펙트럼: 왼쪽 저음 → 가운데 보컬 → 오른쪽 고음(이퀄라이저 패널과 같은 순서), 은은한 빛과 바닥에 비친 그림자.
 * 처음에는 가운데가 저음인 좌우 대칭이었는데, 패널과 다르게 움직여 보여 같은 순서로 바꿨다(2026-10-14).
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
    // 높이 = 최근 가장 큰 소리 아래 40dB 안에서 얼마나 큰지(대역 사이 크기 차이는 그대로 살린다)를 1.8제곱, 최대 92%.
    // 합성 팝으로 맞춘 값(2026-10-14): 끝까지(90% 이상) 차는 시간 0.9%(예전 표지 54%), 평균 높이 0.42,
    // 이퀄라이저 패널 막대와의 상관 0.98(같이 움직인다).
    const shown = new Float32Array(BARS);
    const goal = new Float32Array(BARS);
    /** 받는 값 0~255 = −100~−10dB */
    const DB_RANGE = 90;
    /** 높은 음은 원래 약해서 막대 하나마다 0.4dB씩만 살짝 올린다(패널처럼 저음이 큰 모양은 남는다). */
    const TILT_DB = 0.4;
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
        const db = new Float32Array(BARS);
        let peak = 0;
        for (let i = 0; i < BARS; i++) {
          db[i] = ((bars.current[i] ?? 0) / 255) * DB_RANGE + TILT_DB * i;
          peak = Math.max(peak, db[i]);
        }
        ref = Math.max(peak, ref - 3 * step);
        for (let i = 0; i < BARS; i++) goal[i] = 0.92 * Math.pow(Math.min(1, Math.max(0, (db[i] - (ref - 40)) / 40)), 1.8);
      }
      for (let i = 0; i < BARS; i++) {
        // 빠르게 오르고(0.03초) 천천히 내려온다(0.16초).
        const tau = goal[i] > shown[i] ? 0.03 : 0.16;
        shown[i] = reduce ? goal[i] : shown[i] + (goal[i] - shown[i]) * (1 - Math.exp(-dt / tau));
      }

      const n = BARS;
      const gap = Math.max(2, (w / n) * 0.42);
      const bw = (w - gap * (n - 1)) / n;
      const dot = Math.min(bw, 4);
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, colors.low);
      grad.addColorStop(1, colors.high);
      ctx.fillStyle = grad;
      ctx.shadowColor = colors.high;
      const t = now / 1000;
      for (let i = 0; i < n; i++) {
        const v = shown[i];
        // 쉬는 동안에는 왼쪽에서 오른쪽으로 물결치듯 아주 조금 오르내린다.
        const breathe = reduce ? 0 : ((Math.sin(t * 1.7 - i * 0.38) + 1) / 2) * (1 - Math.min(1, v * 4)) * 3;
        const bh = Math.min(h, dot + v * (h - dot) + breathe);
        ctx.globalAlpha = 0.5 + 0.5 * Math.min(1, v * 1.6);
        ctx.shadowBlur = 6 + 14 * v;
        ctx.beginPath();
        ctx.roundRect(i * (bw + gap), h - bh, bw, bh, bw / 2);
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
