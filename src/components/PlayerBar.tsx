import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as ytm from '../lib/ytm/client';
import { toggleLike, useLiked } from '../state/library';
import { formatTime, patchPlayer, usePlayer, usePosition } from '../state/player';
import { toastError, togglePanel, toggleLyrics, useLayout } from '../state/ui';
import { useEq } from '../lib/eq';
import { Cover } from './Cover';
import { Icon } from './Icon';

const run = (p: Promise<unknown>, what: string) => p.catch((err) => toastError(err, what));

function Seek() {
  const duration = usePlayer((s) => s.duration);
  const ad = usePlayer((s) => s.ad);
  const hasTrack = usePlayer((s) => !!s.videoId);
  const position = usePosition(10);
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? position;
  const max = duration > 0 ? duration : 1;
  const style = { '--fill': `${Math.min(100, (value / max) * 100)}%` } as CSSProperties;
  const commit = (v: number) => {
    setDrag(null);
    patchPlayer({ position: v });
    void run(ytm.control('seek', v), '이동하지 못했습니다');
  };
  return (
    <div className="seek">
      <span className="seek__time">{hasTrack ? formatTime(value) : ''}</span>
      <input
        type="range"
        className="range seek__range"
        min={0}
        max={max}
        step={0.5}
        value={Math.min(value, max)}
        style={style}
        disabled={!hasTrack || ad || duration <= 0}
        aria-label="재생 위치"
        aria-valuetext={`${formatTime(value)} / ${formatTime(duration)}`}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') && commit(Number((e.target as HTMLInputElement).value))}
      />
      <span className="seek__time">{hasTrack ? formatTime(duration) : ''}</span>
    </div>
  );
}

function Volume() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const [local, setLocal] = useState<number | null>(null);
  const timer = useRef(0);
  const shown = muted ? 0 : (local ?? volume);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (v: number) => {
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void run(ytm.control('volume', v), '음량을 바꾸지 못했습니다').finally(() => setLocal(null));
    }, 120);
  };
  const style = { '--fill': `${shown}%` } as CSSProperties;
  return (
    <div className="volume">
      <button
        type="button"
        className="icon-btn"
        aria-label={muted || shown === 0 ? '소리 켜기' : '음소거'}
        onClick={() => run(ytm.control(muted ? 'unmute' : 'mute'), '음소거를 바꾸지 못했습니다')}
      >
        <Icon name={muted || shown === 0 ? 'mute' : 'volume'} size={19} />
      </button>
      <input
        type="range"
        className="range volume__range"
        min={0}
        max={100}
        step={1}
        value={shown}
        style={style}
        aria-label="음량"
        onChange={(e) => change(Number(e.target.value))}
      />
    </div>
  );
}

const REPEAT_LABEL: Record<string, string> = { NONE: '반복 안 함', ALL: '전체 반복', ONE: '한 곡 반복' };

export function PlayerBar() {
  const videoId = usePlayer((s) => s.videoId);
  const title = usePlayer((s) => s.title);
  const artist = usePlayer((s) => s.artist);
  const artwork = usePlayer((s) => s.artwork);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const ad = usePlayer((s) => s.ad);
  const repeat = usePlayer((s) => s.repeat);
  const liked = useLiked(videoId);
  const lyricsOn = useLayout((s) => s.lyrics);
  const queueOn = useLayout((s) => s.panel === 'queue');
  const eqOpen = useLayout((s) => s.panel === 'eq');
  const eqOn = useEq((s) => s.enabled);
  const has = !!videoId;

  const toggle = () => {
    patchPlayer({ playing: !playing });
    void run(ytm.control('toggle'), '재생을 바꾸지 못했습니다');
  };

  return (
    <footer className="player" aria-label="재생 바">
      <div className="player__now">
        {has ? (
          <>
            <button type="button" className="player__art" aria-label="가사 보기" onClick={() => toggleLyrics()}>
              <Cover src={artwork} size={56} />
            </button>
            <div className="player__meta">
              <div className="player__title" title={title}>{ad ? '광고' : title}</div>
              <div className="player__artist" title={artist}>{ad ? 'YouTube Music' : artist}</div>
            </div>
            <button
              type="button"
              className={`icon-btn player__like${liked ? ' is-on' : ''}`}
              aria-label={liked ? '좋아요 취소' : '좋아요'}
              aria-pressed={liked}
              disabled={ad}
              onClick={() => toggleLike({ videoId, title })}
            >
              <Icon name="heart" size={19} filled={liked} />
            </button>
          </>
        ) : (
          <div className="player__idle">곡을 고르면 여기에서 재생됩니다</div>
        )}
      </div>

      <div className="player__center">
        <div className="player__buttons">
          <button type="button" className="icon-btn" aria-label="대기열 섞기" disabled={!has} onClick={() => run(ytm.control('shuffle'), '섞지 못했습니다')}>
            <Icon name="shuffle" size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="이전 곡" disabled={!has} onClick={() => run(ytm.control('previous'), '이전 곡으로 가지 못했습니다')}>
            <Icon name="previous" size={22} />
          </button>
          <button type="button" className={`play-btn${buffering ? ' is-busy' : ''}`} aria-label={playing ? '일시정지' : '재생'} disabled={!has} onClick={toggle}>
            <Icon name={playing ? 'pause' : 'play'} size={22} />
          </button>
          <button type="button" className="icon-btn" aria-label="다음 곡" disabled={!has} onClick={() => run(ytm.control('next'), '다음 곡으로 가지 못했습니다')}>
            <Icon name="next" size={22} />
          </button>
          <button
            type="button"
            className={`icon-btn repeat${repeat !== 'NONE' ? ' is-on' : ''}`}
            aria-label={`반복: ${REPEAT_LABEL[repeat] ?? repeat}`}
            title={REPEAT_LABEL[repeat] ?? repeat}
            disabled={!has}
            onClick={() => run(ytm.control('repeat'), '반복을 바꾸지 못했습니다')}
          >
            <Icon name="repeat" size={18} />
            {repeat === 'ONE' && <span className="repeat__one">1</span>}
          </button>
        </div>
        <Seek />
      </div>

      <div className="player__side">
        <button type="button" className={`icon-btn${lyricsOn ? ' is-on' : ''}`} aria-label="가사" aria-pressed={lyricsOn} onClick={() => toggleLyrics()}>
          <Icon name="lyrics" size={19} />
        </button>
        <button type="button" className={`icon-btn${queueOn ? ' is-on' : ''}`} aria-label="대기열" aria-pressed={queueOn} onClick={() => togglePanel('queue')}>
          <Icon name="queue" size={19} />
        </button>
        <button
          type="button"
          className={`icon-btn${eqOpen ? ' is-on' : ''}`}
          aria-label={`이퀄라이저${eqOn ? ' (켜짐)' : ''}`}
          aria-pressed={eqOpen}
          onClick={() => togglePanel('eq')}
        >
          <Icon name="eq" size={19} />
          {eqOn && <span className="dot" aria-hidden="true" />}
        </button>
        <Volume />
      </div>
    </footer>
  );
}
