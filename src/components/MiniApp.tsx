// 미니 플레이어 창(index.html#mini): 늘 위에 떠 있는 작은 재생기. 큰 창과 같은 엔진 상태를 받아 그린다.
import { useEffect, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as ytm from '../lib/ytm/client';
import { miniPin } from '../lib/tauri';
import { startAlbumTheme } from '../lib/theme';
import { startLibrarySync, toggleLike, useLiked } from '../state/library';
import { patchPlayer, playerStore, startPlayerSync, usePlayer, usePosition } from '../state/player';
import { toastError } from '../state/ui';
import { Toasts } from './ContextMenu';
import { Cover } from './Cover';
import { Icon } from './Icon';

const run = (p: Promise<unknown>, what: string) => p.catch((err) => toastError(err, what));

export function MiniApp() {
  const videoId = usePlayer((s) => s.videoId);
  const title = usePlayer((s) => s.title);
  const artist = usePlayer((s) => s.artist);
  const artwork = usePlayer((s) => s.artwork);
  const playing = usePlayer((s) => s.playing);
  const duration = usePlayer((s) => s.duration);
  const ad = usePlayer((s) => s.ad);
  const liked = useLiked(videoId);
  const position = usePosition(4);
  const [pinned, setPinned] = useState(true);
  const mac = /Mac/i.test(navigator.platform);

  useEffect(() => {
    // 청취 기록은 큰 창이 남긴다(같은 곡을 두 번 세지 않게).
    const stops = [startPlayerSync(false), startLibrarySync(), Promise.resolve(startAlbumTheme(() => playerStore.get().artwork, (fn) => playerStore.subscribe(fn)))];
    return () => {
      for (const p of stops) void p.then((stop) => stop());
    };
  }, []);

  const has = !!videoId;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const toggle = () => {
    patchPlayer({ playing: !playing });
    void run(ytm.control('toggle'), '재생을 바꾸지 못했습니다');
  };

  return (
    <div className={`mini-app${mac ? ' mini-app--mac' : ''}`} style={{ '--art': artwork ? `url("${artwork}")` : 'none' } as CSSProperties}>
      <div className="mini-app__backdrop" aria-hidden="true" />
      <div className="mini-app__drag" data-tauri-drag-region>
        <span data-tauri-drag-region>YTM</span>
      </div>
      <div className="mini-app__body">
        <Cover src={artwork} size={84} className="mini-app__art" />
        <div className="mini-app__side">
          <div className="mini-app__title" title={title}>{has ? (ad ? '광고' : title) : '재생 중인 곡 없음'}</div>
          <div className="mini-app__artist" title={artist}>{has ? (ad ? 'YouTube Music' : artist) : '큰 창에서 곡을 고르세요'}</div>
          <div className="mini-app__controls">
            <button type="button" className={`icon-btn${liked ? ' is-on' : ''}`} aria-label={liked ? '좋아요 취소' : '좋아요'} disabled={!has || ad} onClick={() => toggleLike({ videoId, title })}>
              <Icon name="heart" size={17} filled={liked} />
            </button>
            <button type="button" className="icon-btn" aria-label="이전 곡" disabled={!has} onClick={() => run(ytm.control('previous'), '이전 곡으로 가지 못했습니다')}>
              <Icon name="previous" size={20} />
            </button>
            <button type="button" className="play-btn mini-app__play" aria-label={playing ? '일시정지' : '재생'} disabled={!has} onClick={toggle}>
              <Icon name={playing ? 'pause' : 'play'} size={20} />
            </button>
            <button type="button" className="icon-btn" aria-label="다음 곡" disabled={!has} onClick={() => run(ytm.control('next'), '다음 곡으로 가지 못했습니다')}>
              <Icon name="next" size={20} />
            </button>
            <span className="mini-app__gap" />
            <button
              type="button"
              className={`icon-btn${pinned ? ' is-on' : ''}`}
              aria-label={pinned ? '늘 위에 두지 않기' : '늘 위에 두기'}
              title={pinned ? '늘 위에 두지 않기' : '늘 위에 두기'}
              aria-pressed={pinned}
              onClick={() => miniPin(!pinned).then(() => setPinned(!pinned), (err) => toastError(err))}
            >
              <Icon name="up" size={17} />
            </button>
            <button type="button" className="icon-btn" aria-label="큰 창 열기" title="큰 창 열기" onClick={() => void invoke('show_main_window').catch((err) => toastError(err))}>
              <Icon name="external" size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="mini-app__progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <Toasts />
    </div>
  );
}
