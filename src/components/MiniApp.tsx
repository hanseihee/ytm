// 미니 플레이어 창(index.html#mini): 늘 위에 떠 있는 작은 재생기. 큰 창과 같은 엔진 상태를 받아 그린다.
// 표지 오른쪽에 지금 부르는 가사 두 줄(지금 줄·다음 줄)이 작게 나오고(가사 단추로 끄고 켬), 다음 트랙 단추를 누르면 창이 아래로 늘어나
// 다음 곡 목록이 나온다. 진행 막대는 눌러서·끌어서 옮긴다.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import { t } from '../i18n';
import { useLang } from '../i18n/react';
import * as ytm from '../lib/ytm/client';
import { miniPin } from '../lib/tauri';
import { startAlbumTheme } from '../lib/theme';
import { startLibrarySync, toggleLike, useLiked } from '../state/library';
import { useTrackLyrics } from '../state/lyrics';
import { activeLine } from '../lib/lyrics';
import { formatTime, patchPlayer, playerStore, startPlayerSync, usePlayer, usePosition } from '../state/player';
import { toastError } from '../state/ui';
import { Toasts } from './ContextMenu';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { TrackItem, useQueue } from './QueuePanel';
import { playTrack } from '../state/library';

const run = (p: Promise<unknown>, what: string) => p.catch((err) => toastError(err, what));

/** 창 크기(논리 픽셀). 아래 칸을 펼치면 아래로 늘어난다. src-tauri/src/desktop.rs의 처음 크기와 같게. */
const MINI_WIDTH = 380;
const MINI_HEIGHT = 152;
const MINI_OPEN_HEIGHT = 372;
const QUEUE_KEY = 'ytm-desktop:mini-queue';
const LYRICS_KEY = 'ytm-desktop:mini-lyrics';

function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function saveFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // 저장하지 못해도 이번에는 바뀐다.
  }
}

/** 창 높이를 맞추고, 늘린 창이 화면(작업 영역) 아래로 넘치면 위로 올린다. */
async function fitWindow(open: boolean) {
  const win = getCurrentWindow();
  await win.setSize(new LogicalSize(MINI_WIDTH, open ? MINI_OPEN_HEIGHT : MINI_HEIGHT));
  if (!open) return;
  const [monitor, pos, size] = await Promise.all([currentMonitor(), win.outerPosition(), win.outerSize()]);
  if (!monitor) return;
  const top = monitor.workArea.position.y;
  const bottom = top + monitor.workArea.size.height;
  if (pos.y + size.height > bottom) await win.setPosition(new PhysicalPosition(pos.x, Math.max(top, bottom - size.height)));
}

/** 진행 막대: 누르거나 끌어서 옮긴다(가리키면 굵어지고 손잡이가 나온다). 키보드는 ←→ 5초, Home·End. */
function MiniSeek() {
  const duration = usePlayer((s) => s.duration);
  const ad = usePlayer((s) => s.ad);
  const has = usePlayer((s) => !!s.videoId);
  const position = usePosition(10);
  const [drag, setDrag] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  /** 누르고 있는 중(상태가 다시 그려지기 전에 손을 떼도 알 수 있게 ref로) */
  const pressed = useRef(false);
  const disabled = !has || ad || duration <= 0;
  const value = drag ?? position;
  const ratio = (v: number) => (duration > 0 ? Math.max(0, Math.min(1, v / duration)) : 0);
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  const commit = (v: number) => {
    setDrag(null);
    patchPlayer({ position: v });
    void run(ytm.control('seek', v), t('이동하지 못했습니다'));
  };
  return (
    <div
      ref={bar}
      className={`mini-seek${drag !== null ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
      style={{ '--fill': `${ratio(value) * 100}%` } as CSSProperties}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={t('재생 위치')}
      aria-disabled={disabled}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${formatTime(value)} / ${formatTime(duration)}`}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 포인터를 잡지 못해도 누른 자리로는 옮긴다.
        }
        pressed.current = true;
        setDrag(at(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!disabled && pressed.current) setDrag(at(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!pressed.current) return;
        pressed.current = false;
        commit(at(e.clientX));
      }}
      onPointerCancel={() => {
        pressed.current = false;
        setDrag(null);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        const to = e.key === 'ArrowLeft' ? position - 5 : e.key === 'ArrowRight' ? position + 5 : e.key === 'Home' ? 0 : e.key === 'End' ? duration - 1 : null;
        if (to === null) return;
        e.preventDefault();
        commit(Math.max(0, Math.min(duration - 1, to)));
      }}
    >
      <span className="mini-seek__track">
        <span className="mini-seek__fill" />
      </span>
      <span className="mini-seek__knob" />
    </div>
  );
}

/** 펼친 다음 트랙: 다음에 나올 곡과 이어서 자동 재생될 곡. 누르면 그 곡으로 간다. */
function MiniQueue() {
  const { data, error, items, upcoming, automix, jump } = useQueue();
  const message =
    error && !data ? t('대기열을 읽지 못했습니다.') : !data ? t('불러오는 중…') : items.length === 0 || (!upcoming.length && !automix.length) ? t('곡을 재생하면 다음에 나올 곡이 여기에 쌓입니다.') : '';
  return (
    <section className="mini-panel mini-queue" aria-label={t('다음 트랙')}>
      {message ? (
        <p className="mini-panel__empty">{message}</p>
      ) : (
        <div className="mini-queue__list">
          {upcoming.length > 0 && <h3 className="mini-queue__head">{t('다음 트랙')}</h3>}
          {upcoming.map(({ item, index }) => (
            <TrackItem key={`q-${index}-${item.track.videoId}`} track={item.track} withMenu={false} onClick={() => jump(index)} />
          ))}
          {automix.length > 0 && <h3 className="mini-queue__head">{t('이어서 자동 재생')}</h3>}
          {automix.map((track, i) => (
            <TrackItem key={`a-${i}-${track.videoId}`} track={track} withMenu={false} onClick={() => void playTrack(track)} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 표지 오른쪽 가사 두 줄: 지금 부르는 줄과 다음 줄. 시간 맞춤 가사가 있을 때만(없으면 아무것도 그리지 않는다). */
function MiniLyricLines() {
  const ad = usePlayer((s) => s.ad);
  const { lyrics, loading, offset, shift } = useTrackLyrics();
  const position = usePosition(4);
  const lines = !loading && !ad ? (lyrics?.synced?.filter((l) => l.text.trim()) ?? []) : [];
  if (!lines.length) return null;
  const at = activeLine(lines, position + offset + shift);
  const now = at >= 0 ? lines[at].text : '';
  const next = lines[at + 1]?.text ?? '';
  return (
    <div className="mini-app__lyrics" aria-live="off">
      {/* 줄이 바뀌면 key가 바뀌어 살짝 올라오며 나타난다 */}
      <div key={`n${at}`} className="mini-app__lyric is-now" title={now}>
        {now || '♪'}
      </div>
      <div key={`x${at}`} className="mini-app__lyric" title={next}>
        {next}
      </div>
    </div>
  );
}

export function MiniApp() {
  // 미니 창은 이 컴포넌트가 맨 위라, 언어가 바뀌면 여기서 다시 그린다.
  useLang();
  const videoId = usePlayer((s) => s.videoId);
  const title = usePlayer((s) => s.title);
  const artist = usePlayer((s) => s.artist);
  const artwork = usePlayer((s) => s.artwork);
  const playing = usePlayer((s) => s.playing);
  const ad = usePlayer((s) => s.ad);
  const liked = useLiked(videoId);
  const [pinned, setPinned] = useState(true);
  const [queueOpen, setQueueOpen] = useState(() => loadFlag(QUEUE_KEY, false));
  const [showLyrics, setShowLyrics] = useState(() => loadFlag(LYRICS_KEY, true));
  const mac = /Mac/i.test(navigator.platform);

  useEffect(() => {
    // 청취 기록은 큰 창이 남긴다(같은 곡을 두 번 세지 않게).
    const stops = [startPlayerSync(false), startLibrarySync(), Promise.resolve(startAlbumTheme(() => playerStore.get().artwork, (fn) => playerStore.subscribe(fn)))];
    return () => {
      for (const p of stops) void p.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    void fitWindow(queueOpen).catch((err) => console.warn('[mini] 창 크기를 바꾸지 못했습니다', err));
  }, [queueOpen]);
  const toggleQueue = () => {
    setQueueOpen(!queueOpen);
    saveFlag(QUEUE_KEY, !queueOpen);
  };
  const toggleShowLyrics = () => {
    setShowLyrics(!showLyrics);
    saveFlag(LYRICS_KEY, !showLyrics);
  };

  const has = !!videoId;
  const toggle = () => {
    patchPlayer({ playing: !playing });
    void run(ytm.control('toggle'), t('재생을 바꾸지 못했습니다'));
  };

  return (
    <div className={`mini-app${mac ? ' mini-app--mac' : ''}${queueOpen ? ' is-open' : ''}`} style={{ '--art': artwork ? `url("${artwork}")` : 'none' } as CSSProperties}>
      <div className="mini-app__backdrop" aria-hidden="true" />
      <div className="mini-app__drag" data-tauri-drag-region>
        <span data-tauri-drag-region>YTMusic</span>
        <div className="mini-app__top-tools">
          <button
            type="button"
            className={`icon-btn mini-app__tool${pinned ? ' is-on' : ''}`}
            aria-label={pinned ? t('늘 위에 두지 않기') : t('늘 위에 두기')}
            title={pinned ? t('늘 위에 두지 않기') : t('늘 위에 두기')}
            aria-pressed={pinned}
            onClick={() => miniPin(!pinned).then(() => setPinned(!pinned), (err) => toastError(err))}
          >
            <Icon name="pin" size={14} />
          </button>
          <button type="button" className="icon-btn mini-app__tool" aria-label={t('큰 창 열기')} title={t('큰 창 열기')} onClick={() => void invoke('show_main_window').catch((err) => toastError(err))}>
            <Icon name="external" size={14} />
          </button>
        </div>
      </div>
      <div className="mini-app__body">
        <Cover src={artwork} size={84} className="mini-app__art" />
        <div className="mini-app__side">
          <div className="mini-app__title" title={title}>{has ? (ad ? t('광고') : title) : t('재생 중인 곡 없음')}</div>
          <div className="mini-app__artist" title={artist}>{has ? (ad ? 'YouTube Music' : artist) : t('큰 창에서 곡을 고르세요')}</div>
          {has && showLyrics && <MiniLyricLines />}
          <div className="mini-app__controls">
            <button type="button" className={`icon-btn${liked ? ' is-on' : ''}`} aria-label={liked ? t('좋아요 취소') : t('좋아요')} disabled={!has || ad} onClick={() => toggleLike({ videoId, title })}>
              <Icon name="heart" size={17} filled={liked} />
            </button>
            <button type="button" className="icon-btn" aria-label={t('이전 곡')} disabled={!has} onClick={() => run(ytm.control('previous'), t('이전 곡으로 가지 못했습니다'))}>
              <Icon name="previous" size={20} />
            </button>
            <button type="button" className="play-btn mini-app__play" aria-label={playing ? t('일시정지') : t('재생')} disabled={!has} onClick={toggle}>
              <Icon name={playing ? 'pause' : 'play'} size={20} />
            </button>
            <button type="button" className="icon-btn" aria-label={t('다음 곡')} disabled={!has} onClick={() => run(ytm.control('next'), t('다음 곡으로 가지 못했습니다'))}>
              <Icon name="next" size={20} />
            </button>
            <span className="mini-app__gap" />
            <button type="button" className={`icon-btn${showLyrics ? ' is-on' : ''}`} aria-label={t('가사')} title={t('가사')} aria-pressed={showLyrics} onClick={toggleShowLyrics}>
              <Icon name="lyrics" size={18} />
            </button>
            <button type="button" className={`icon-btn${queueOpen ? ' is-on' : ''}`} aria-label={t('다음 트랙')} title={t('다음 트랙')} aria-pressed={queueOpen} onClick={toggleQueue}>
              <Icon name="queue" size={18} />
            </button>
          </div>
        </div>
      </div>
      <MiniSeek />
      {queueOpen && <MiniQueue />}
      <Toasts />
    </div>
  );
}
