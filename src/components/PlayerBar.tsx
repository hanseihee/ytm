import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as ytm from '../lib/ytm/client';
import { toggleLike, useLiked } from '../state/library';
import { formatTime, patchPlayer, usePlayer, usePosition } from '../state/player';
import { openMenu, toastError, togglePanel, toggleLyrics, useLayout, type MenuEntry } from '../state/ui';
import { cancelSleep, SLEEP_MINUTES, sleepLabel, startSleep, startSleepAfterTrack, useSleep } from '../state/sleep';
import { miniWindow, videoWindow } from '../lib/tauri';
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

/** 노래(음원) ↔ 영상(뮤직비디오) 전환. 영상으로 바꾸면 영상 창을 띄우고, 노래로 바꾸면 닫는다. */
export async function switchAv(video: boolean) {
  try {
    await ytm.avSwitch(video);
    await videoWindow(video);
  } catch (err) {
    toastError(err, video ? '영상으로 바꾸지 못했습니다' : '노래로 바꾸지 못했습니다');
  }
}

export function AvToggle({ compact = false }: { compact?: boolean }) {
  const available = usePlayer((s) => !!s.avAvailable && !s.ad);
  const video = usePlayer((s) => !!s.avVideo);
  if (!available) return null;
  return (
    <div className={`avtoggle${compact ? ' avtoggle--compact' : ''}`} role="radiogroup" aria-label="노래·영상">
      <button type="button" role="radio" aria-checked={!video} className={!video ? 'is-on' : ''} onClick={() => video && void switchAv(false)}>노래</button>
      <button type="button" role="radio" aria-checked={video} className={video ? 'is-on' : ''} onClick={() => !video && void switchAv(true)}>영상</button>
    </div>
  );
}

function SleepButton() {
  const sleep = useSleep((s) => s);
  const has = usePlayer((s) => !!s.videoId);
  const [, tick] = useState(0);
  useEffect(() => {
    if (sleep.mode !== 'time') return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [sleep.mode]);
  const on = sleep.mode !== 'off';
  const menu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const entries: MenuEntry[] = SLEEP_MINUTES.map((m) => ({ label: m >= 60 ? `${m / 60}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`, action: () => startSleep(m) }));
    entries.push({ label: '지금 곡이 끝나면', action: startSleepAfterTrack, disabled: !has });
    if (on) entries.push({ label: '', separator: true }, { label: '수면 타이머 끄기', action: () => cancelSleep() });
    openMenu(r.left - 120, r.top - 10 - entries.length * 36, entries);
  };
  return (
    <button type="button" className={`icon-btn sleep-btn${on ? ' is-on' : ''}`} aria-label={on ? `수면 타이머 ${sleepLabel(sleep)}` : '수면 타이머'} title="수면 타이머" onClick={menu}>
      <Icon name="moon" size={18} />
      {on && <span className="sleep-btn__left">{sleepLabel(sleep)}</span>}
    </button>
  );
}

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
  const videoOpen = useLayout((s) => s.video);
  const avAvailable = usePlayer((s) => !!s.avAvailable);
  const avVideo = usePlayer((s) => !!s.avVideo);
  const picture = usePlayer((s) => !!s.avVideo || !!s.hasPicture || !!s.avAvailable);
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
              <AvToggle compact />
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
        <button
          type="button"
          className={`icon-btn${videoOpen ? ' is-on' : ''}`}
          aria-label={videoOpen ? '영상 창 닫기' : '영상 보기'}
          title={videoOpen ? '영상 창 닫기' : '영상 보기'}
          aria-pressed={videoOpen}
          disabled={!has || !picture || ad}
          onClick={() => {
            if (videoOpen) void videoWindow(false).catch((err) => toastError(err));
            // 노래 쪽이면 영상으로 바꾸고, 원래 영상(짝 없음)이면 창만 띄운다.
            else if (avAvailable && !avVideo) void switchAv(true);
            else void videoWindow(true).catch((err) => toastError(err, '영상 창을 열지 못했습니다'));
          }}
        >
          <Icon name="video" size={19} />
        </button>
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
        <SleepButton />
        <button type="button" className="icon-btn" aria-label="미니 플레이어" title="미니 플레이어 (⌃⌥M)" onClick={() => void miniWindow(true).catch((err) => toastError(err))}>
          <Icon name="mini" size={19} />
        </button>
        <Volume />
      </div>
    </footer>
  );
}
