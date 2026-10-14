import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import * as ytm from '../lib/ytm/client';
import type { QueueItem, Track } from '../lib/ytm/types';
import { playTrack } from '../state/library';
import { usePlayer, formatTime } from '../state/player';
import { openMenu, toastError, togglePanel } from '../state/ui';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { trackMenu } from './menus';

type QueueData = Awaited<ReturnType<typeof ytm.queue>>;

export function QueuePanel() {
  const videoId = usePlayer((s) => s.videoId);
  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    ytm.queue().then(
      (q) => {
        setData(q);
        setError(false);
      },
      (err) => {
        console.warn('[queue]', err);
        setError(true);
      },
    );
  }, []);

  // 곡이 바뀌면 대기열을 다시 읽는다(자동 재생으로 뒤가 늘어나기도 한다).
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => window.clearInterval(timer);
  }, [videoId, refresh]);

  const jump = (index: number) =>
    ytm.queueJump(index).then(() => setTimeout(refresh, 600), (err) => toastError(err, '그 곡으로 가지 못했습니다'));

  const row = (track: Track, key: string, current: boolean, onClick: () => void) => {
    const menu = (e: MouseEvent) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, trackMenu(track));
    };
    return (
      <button key={key} type="button" className={`qitem${current ? ' is-current' : ''}`} onClick={onClick} onContextMenu={menu}>
        <Cover src={track.thumbnail} size={40} />
        <span className="qitem__meta">
          <span className="qitem__title">{track.title}</span>
          <span className="qitem__artist">{track.artists.map((a) => a.name).join(', ')}</span>
        </span>
        <span className="qitem__time">{track.duration !== undefined ? formatTime(track.duration) : ''}</span>
      </button>
    );
  };

  const items = data?.items ?? [];
  const current = items.findIndex((i) => i?.selected);
  const now = current >= 0 ? (items[current] as QueueItem) : undefined;
  const upcoming = items.map((item, index) => ({ item, index })).slice(current + 1).filter((x): x is { item: QueueItem; index: number } => !!x.item);
  const automix = data?.automix ?? [];

  return (
    <aside className="panel" aria-label="대기열">
      <header className="panel__head">
        <h2 className="panel__title">대기열</h2>
        <button type="button" className="icon-btn" aria-label="대기열 닫기" onClick={() => togglePanel('queue')}>
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="panel__body">
        {error && !data ? (
          <p className="panel__empty">대기열을 읽지 못했습니다.</p>
        ) : !data ? (
          <p className="panel__empty">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="panel__empty">곡을 재생하면 다음에 나올 곡이 여기에 쌓입니다.</p>
        ) : (
          <>
            {now && (
              <>
                <h3 className="panel__section">지금 재생 중</h3>
                {row(now.track, `now-${current}`, true, () => undefined)}
              </>
            )}
            {upcoming.length > 0 && <h3 className="panel__section">다음 곡</h3>}
            {upcoming.map(({ item, index }) => row(item.track, `q-${index}-${item.track.videoId}`, false, () => jump(index)))}
            {automix.length > 0 && <h3 className="panel__section">이어서 자동 재생</h3>}
            {automix.map((t, i) => row(t, `a-${i}-${t.videoId}`, false, () => playTrack(t)))}
          </>
        )}
      </div>
    </aside>
  );
}
