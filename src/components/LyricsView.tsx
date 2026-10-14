import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { activeLine, loadLyrics, LYRIC_OFFSET_MAX, LYRIC_OFFSET_STEP, lyricsOffset, setLyricsOffset, type Lyrics } from '../lib/lyrics';
import * as ytm from '../lib/ytm/client';
import { patchPlayer, usePlayer, usePosition } from '../state/player';
import { LYRIC_SCALES, stepLyricScale, toastError, toggleLyrics, useLyricScale } from '../state/ui';
import { Icon } from './Icon';

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
    ytm.control('seek', to).catch((err) => toastError(err, '이동하지 못했습니다'));
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

  return (
    <section className="lyrics" style={bg} aria-label="가사">
      <div className="lyrics__backdrop" aria-hidden="true" />
      <header className="lyrics__head">
        <div className="lyrics__track">
          <div className="lyrics__title">{title || '재생 중인 곡이 없습니다'}</div>
          {artist && <div className="lyrics__artist">{artist}</div>}
        </div>
        <div className="lyrics__tools">
          <div className="textsize" role="group" aria-label="가사 글자 크기">
            <button
              type="button"
              className="textsize__btn"
              aria-label="가사 글자 작게"
              title="작게 (⌘-)"
              disabled={scale <= LYRIC_SCALES[0]}
              onClick={() => stepLyricScale(-1)}
            >
              <span className="textsize__glyph textsize__glyph--sm" aria-hidden="true">가</span>
            </button>
            <button type="button" className="textsize__value" title="기본 크기로 (⌘0)" onClick={() => stepLyricScale(0)}>
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              className="textsize__btn"
              aria-label="가사 글자 크게"
              title="크게 (⌘=)"
              disabled={scale >= LYRIC_SCALES[LYRIC_SCALES.length - 1]}
              onClick={() => stepLyricScale(1)}
            >
              <span className="textsize__glyph textsize__glyph--lg" aria-hidden="true">가</span>
            </button>
          </div>
          {state.lyrics?.synced && (
            <div className="textsize lyric-sync" role="group" aria-label="가사 싱크">
              <button type="button" className="textsize__btn" aria-label="가사를 0.5초 늦게" title="가사가 빠를 때" disabled={offset <= -LYRIC_OFFSET_MAX} onClick={() => nudge(-LYRIC_OFFSET_STEP)}>
                <Icon name="back" size={14} />
              </button>
              <button type="button" className="textsize__value" title="싱크 원래대로" onClick={() => nudge(0)}>
                {offset === 0 ? '싱크' : `${offset > 0 ? '+' : ''}${offset.toFixed(1)}초`}
              </button>
              <button type="button" className="textsize__btn" aria-label="가사를 0.5초 빠르게" title="가사가 늦을 때" disabled={offset >= LYRIC_OFFSET_MAX} onClick={() => nudge(LYRIC_OFFSET_STEP)}>
                <Icon name="forward" size={14} />
              </button>
            </div>
          )}
          <button type="button" className="icon-btn" aria-label="가사 닫기" onClick={() => toggleLyrics(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </header>

      {!videoId ? (
        <p className="lyrics__empty">곡을 재생하면 가사가 여기에 나옵니다.</p>
      ) : ad ? (
        <p className="lyrics__empty">광고가 끝나면 가사를 보여 드립니다.</p>
      ) : loading ? (
        <p className="lyrics__empty">가사를 찾는 중…</p>
      ) : state.error ? (
        <p className="lyrics__empty">가사를 불러오지 못했습니다. 인터넷 연결을 확인하세요.</p>
      ) : !state.lyrics ? (
        <p className="lyrics__empty">이 곡의 가사를 찾지 못했습니다.</p>
      ) : state.lyrics.synced ? (
        <SyncedLines lyrics={state.lyrics} scale={scale} offset={offset + shift} />
      ) : (
        <div className="lyrics__scroll">
          <div className="lyrics__plain">{state.lyrics.plain}</div>
        </div>
      )}

      {state.lyrics && state.id === videoId && (
        <footer className="lyrics__source">
          가사 제공: {state.lyrics.source}
          {state.lyrics.synced ? '' : ' (시간 정보 없음)'}
        </footer>
      )}
    </section>
  );
}
