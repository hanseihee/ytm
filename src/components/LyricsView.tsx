import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { locale, t } from '../i18n';
import { activeLine, loadLyrics, LYRIC_OFFSET_MAX, LYRIC_OFFSET_STEP, lyricsOffset, setLyricsOffset, type Lyrics } from '../lib/lyrics';
import { keepVisualizer, onSpectrum } from '../lib/eq';
import { cssColor, themeStore } from '../lib/theme';
import * as ytm from '../lib/ytm/client';
import { patchPlayer, usePlayer, usePosition } from '../state/player';
import { LYRIC_SCALES, setLyricsView, stepLyricScale, toastError, toggleLyrics, useLyricScale, useLyricsView } from '../state/ui';
import { Cover } from './Cover';
import { Icon } from './Icon';

/** YouTube Music 썸네일 주소의 크기 지정(=w120-h120…)을 크게 바꾼다. */
const largeArt = (url: string) => url.replace(/=w\d+-h\d+/, '=w1200-h1200');

/** 사용자가 직접 굴린 뒤 이 시간 동안은 자동 따라가기를 멈춘다. */
const MANUAL_SCROLL_PAUSE_MS = 4000;

function SyncedLines({ lyrics, scale, offset }: { lyrics: Lyrics; scale: number; offset: number }) {
  const lines = lyrics.synced!;
  const position = usePosition(20);
  const active = activeLine(lines, position + offset);
  const box = useRef<HTMLDivElement>(null);
  const manualUntil = useRef(0);

  useEffect(() => {
    const el = box.current;
    if (!el || Date.now() < manualUntil.current) return;
    const line = el.querySelector<HTMLElement>(`[data-line="${Math.max(0, active)}"]`);
    if (!line) return;
    const target = line.offsetTop - el.clientHeight * 0.36 + line.offsetHeight / 2;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
    // 글자 크기를 바꾸면 줄 위치가 달라지므로 현재 줄을 다시 맞춘다.
  }, [active, scale]);

  const seek = (time: number) => {
    manualUntil.current = 0;
    const to = Math.max(0, time - offset);
    patchPlayer({ position: to });
    ytm.control('seek', to).catch((err) => toastError(err, t('이동하지 못했습니다')));
  };

  return (
    <div
      className="lyrics__scroll"
      ref={box}
      onWheel={() => (manualUntil.current = Date.now() + MANUAL_SCROLL_PAUSE_MS)}
      onPointerDown={() => (manualUntil.current = Date.now() + MANUAL_SCROLL_PAUSE_MS)}
    >
      <div className="lyrics__pad" />
      {lines.map((line, i) => (
        <button
          key={`${line.time}-${i}`}
          type="button"
          data-line={i}
          className={`lyric${i === active ? ' is-active' : i < active ? ' is-past' : ''}${line.text ? '' : ' lyric--gap'}`}
          onClick={() => seek(line.time)}
        >
          {line.text || '♪'}
        </button>
      ))}
      <div className="lyrics__pad" />
    </div>
  );
}

/** 앨범 표지 크기(styles.css .lyrics__cover-inner가 쓸 수 있는 높이로 정한다). 표지 아래 스펙트럼도 같은 너비. */
const ART_SIZE = 'var(--cover-size)';
/** 스펙트럼 한쪽 막대 수. 낮은 음이 가운데, 높은 음이 양 끝으로 퍼진다. */
const AURA_HALF = 24;

/**
 * 앨범 표지 아래 스펙트럼: 가운데서 양옆으로 퍼지는 좌우 대칭 막대, 은은한 빛과 바닥에 비친 그림자.
 * 색은 테마를 따른다(앨범 색 테마면 표지에서 뽑은 색). 맥은 오디오 캡처를 이미 허용했을 때만 움직이고(권한을 묻지 않는다),
 * 멈췄거나 소리 정보가 없으면 작은 점들이 천천히 숨 쉬듯 움직인다.
 */
function CoverSpectrum({ playing }: { playing: boolean }) {
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

  return <canvas ref={canvas} className="lyrics__aura" style={{ width: ART_SIZE }} aria-hidden="true" />;
}

/** 앨범 표지 크게 + 제목·가수 + 지금 부르는 가사 두 줄(누르면 가사 보기) */
function CoverStage({ lyrics, offset, artwork, title, artist }: { lyrics?: Lyrics | null; offset: number; artwork: string; title: string; artist: string }) {
  const playing = usePlayer((s) => s.playing);
  const position = usePosition(4);
  const lines = lyrics?.synced?.filter((l) => l.text.trim()) ?? [];
  const at = lines.length ? Math.max(0, activeLine(lines, position + offset)) : -1;
  const plain = !lines.length ? (lyrics?.plain ?? '').split('\n').map((l) => l.trim()).filter(Boolean) : [];
  const now = at >= 0 ? lines[at].text : plain[0];
  const next = at >= 0 ? lines[at + 1]?.text : plain[1];
  return (
    <div className="lyrics__cover">
      <div className="lyrics__cover-inner">
        <Cover src={artwork ? largeArt(artwork) : undefined} size={ART_SIZE} className={`lyrics__art${playing ? '' : ' is-paused'}`} />
        <CoverSpectrum playing={playing} />
        <div className="lyrics__cover-text">
          <div className="lyrics__cover-title">{title || t('재생 중인 곡이 없습니다')}</div>
          {artist && <div className="lyrics__cover-artist">{artist}</div>}
        </div>
        {now && (
          <button type="button" className="lyrics__preview" title={t('가사 보기')} onClick={() => setLyricsView('lyrics')}>
            <span className="lyrics__preview-now">{now}</span>
            {next && <span className="lyrics__preview-next">{next}</span>}
          </button>
        )}
      </div>
    </div>
  );
}

export function LyricsView() {
  const videoId = usePlayer((s) => s.videoId);
  const title = usePlayer((s) => s.title);
  const artist = usePlayer((s) => s.artist);
  const album = usePlayer((s) => s.album);
  const duration = usePlayer((s) => s.duration);
  const artwork = usePlayer((s) => s.artwork);
  const ad = usePlayer((s) => s.ad);
  const avOther = usePlayer((s) => s.avOther ?? '');
  const avShift = usePlayer((s) => s.avShift ?? 0);
  const [state, setState] = useState<{ id: string; lyrics?: Lyrics | null; error?: boolean }>({ id: '' });
  const current = useRef(state);
  current.current = state;

  useEffect(() => {
    if (!videoId || ad || !title) return;
    // 노래↔영상만 바꿨으면 짝 버전 가사를 그대로 쓰고 시간만 옮긴다(다시 찾느라 깜빡이지 않게).
    if (avOther && current.current.id === avOther && current.current.lyrics) return;
    let alive = true;
    setState({ id: videoId });
    loadLyrics({ videoId, title, artist, album, duration }).then(
      (lyrics) => alive && setState({ id: videoId, lyrics }),
      () => alive && setState({ id: videoId, error: true }),
    );
    return () => {
      alive = false;
    };
    // 곡이 바뀔 때만 다시 찾는다(길이는 곡 시작 직후 0일 수 있어 첫 값만 쓴다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, ad, title]);

  const scale = useLyricScale();
  // 짝 버전(노래↔영상) 가사를 쓰는 중이면 그 버전 기준 시간으로 옮긴다(짝 버전 위치 = 지금 위치 + avShift).
  const borrowed = !!avOther && state.id === avOther && state.id !== videoId;
  const lyricsId = borrowed ? state.id : videoId;
  const shift = borrowed ? avShift : 0;
  const [offset, setOffset] = useState(() => lyricsOffset(lyricsId));
  useEffect(() => setOffset(lyricsOffset(lyricsId)), [lyricsId]);
  const nudge = (delta: number) => setOffset(setLyricsOffset(lyricsId, delta === 0 ? 0 : offset + delta));
  const bg = { '--art': artwork ? `url("${artwork}")` : 'none', '--lyric-scale': scale } as CSSProperties;
  const loading = (state.id !== videoId && !borrowed) || (state.lyrics === undefined && !state.error);
  const view = useLyricsView();

  return (
    <section className="lyrics" style={bg} aria-label={view === 'cover' ? t('지금 재생') : t('가사')}>
      <div className="lyrics__backdrop" aria-hidden="true" />
      <header className="lyrics__head">
        {view === 'lyrics' ? (
          <div className="lyrics__track">
            {videoId && <Cover src={artwork || undefined} size={48} className="lyrics__thumb" />}
            <div className="lyrics__track-text">
              <div className="lyrics__title">{title || t('재생 중인 곡이 없습니다')}</div>
              {artist && <div className="lyrics__artist">{artist}</div>}
            </div>
          </div>
        ) : (
          <div />
        )}
        <div className="lyrics__tools">
          <div className="seg" role="radiogroup" aria-label={t('크게 볼 것')}>
            <button type="button" role="radio" aria-checked={view === 'lyrics'} className={`seg__btn${view === 'lyrics' ? ' is-on' : ''}`} onClick={() => setLyricsView('lyrics')}>
              {t('가사')}
            </button>
            <button type="button" role="radio" aria-checked={view === 'cover'} className={`seg__btn${view === 'cover' ? ' is-on' : ''}`} onClick={() => setLyricsView('cover')}>
              {t('앨범 표지')}
            </button>
          </div>
          {view === 'lyrics' && (
            <div className="textsize" role="group" aria-label={t('가사 글자 크기')}>
              <button
                type="button"
                className="textsize__btn"
                aria-label={t('가사 글자 작게')}
                title={t('작게 (⌘-)')}
                disabled={scale <= LYRIC_SCALES[0]}
                onClick={() => stepLyricScale(-1)}
              >
                <span className="textsize__glyph textsize__glyph--sm" aria-hidden="true">{t('가')}</span>
              </button>
              <button type="button" className="textsize__value" title={t('기본 크기로 (⌘0)')} onClick={() => stepLyricScale(0)}>
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                className="textsize__btn"
                aria-label={t('가사 글자 크게')}
                title={t('크게 (⌘=)')}
                disabled={scale >= LYRIC_SCALES[LYRIC_SCALES.length - 1]}
                onClick={() => stepLyricScale(1)}
              >
                <span className="textsize__glyph textsize__glyph--lg" aria-hidden="true">{t('가')}</span>
              </button>
            </div>
          )}
          {view === 'lyrics' && state.lyrics?.synced && (
            <div className="textsize lyric-sync" role="group" aria-label={t('가사 싱크')}>
              <button type="button" className="textsize__btn" aria-label={t('가사를 0.5초 늦게')} title={t('가사가 빠를 때')} disabled={offset <= -LYRIC_OFFSET_MAX} onClick={() => nudge(-LYRIC_OFFSET_STEP)}>
                <Icon name="back" size={14} />
              </button>
              <button type="button" className="textsize__value" title={t('싱크 원래대로')} onClick={() => nudge(0)}>
                {offset === 0
                  ? t('싱크')
                  : t('{n}초', { n: `${offset > 0 ? '+' : ''}${offset.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` })}
              </button>
              <button type="button" className="textsize__btn" aria-label={t('가사를 0.5초 빠르게')} title={t('가사가 늦을 때')} disabled={offset >= LYRIC_OFFSET_MAX} onClick={() => nudge(LYRIC_OFFSET_STEP)}>
                <Icon name="forward" size={14} />
              </button>
            </div>
          )}
          <button type="button" className="icon-btn" aria-label={t('가사 닫기')} onClick={() => toggleLyrics(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </header>

      {view === 'cover' ? (
        <CoverStage lyrics={!loading && !ad ? state.lyrics : null} offset={offset + shift} artwork={ad ? '' : artwork} title={ad ? t('광고') : title} artist={ad ? 'YouTube Music' : artist} />
      ) : !videoId ? (
        <p className="lyrics__empty">{t('곡을 재생하면 가사가 여기에 나옵니다.')}</p>
      ) : ad ? (
        <p className="lyrics__empty">{t('광고가 끝나면 가사를 보여 드립니다.')}</p>
      ) : loading ? (
        <p className="lyrics__empty">{t('가사를 찾는 중…')}</p>
      ) : state.error ? (
        <p className="lyrics__empty">{t('가사를 불러오지 못했습니다. 인터넷 연결을 확인하세요.')}</p>
      ) : !state.lyrics ? (
        <p className="lyrics__empty">{t('이 곡의 가사를 찾지 못했습니다.')}</p>
      ) : state.lyrics.synced ? (
        <SyncedLines lyrics={state.lyrics} scale={scale} offset={offset + shift} />
      ) : (
        <div className="lyrics__scroll">
          <div className="lyrics__plain">{state.lyrics.plain}</div>
        </div>
      )}

      {view === 'lyrics' && state.lyrics && (state.id === videoId || borrowed) && (
        <footer className="lyrics__source">
          {state.lyrics.synced
            ? t('가사 제공: {source}', { source: state.lyrics.source })
            : t('가사 제공: {source} (시간 정보 없음)', { source: state.lyrics.source })}
        </footer>
      )}
    </section>
  );
}
