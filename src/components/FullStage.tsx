// 전체 화면 모드: 모니터에 틀어 두는 화면(YouTube 플레이리스트 채널 essential; 영상처럼 차분하게).
// 흐린 표지 배경 위에 큰 앨범 표지, 앨범·제목·가수, 지금 가사 세 줄(이전·지금·다음), 스펙트럼, 맨 아래 얇은 진행 막대.
// 마우스를 3초 움직이지 않으면 커서와 조작 단추를 숨긴다. 이 모드 동안은 화면이 꺼지지 않는다. Esc로 나간다.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { activeLine, type Lyrics } from '../lib/lyrics';
import * as ytm from '../lib/ytm/client';
import { formatTime, patchPlayer, playerStore, usePlayer, usePosition } from '../state/player';
import { toastError } from '../state/ui';
import { Cover, largeArt } from './Cover';
import { CoverSpectrum } from './CoverSpectrum';
import { Icon } from './Icon';

/** 이만큼 움직임이 없으면 커서·조작 단추를 숨긴다 */
const IDLE_MS = 3000;

const run = (p: Promise<unknown>) => p.catch((err) => toastError(err));

export function FullStage({ lyrics, offset, onExit }: { lyrics?: Lyrics | null; offset: number; onExit: () => void }) {
  const title = usePlayer((s) => s.title);
  const artist = usePlayer((s) => s.artist);
  const album = usePlayer((s) => s.album);
  const artwork = usePlayer((s) => s.artwork);
  const playing = usePlayer((s) => s.playing);
  const duration = usePlayer((s) => s.duration);
  const ad = usePlayer((s) => s.ad);
  const position = usePosition(8);
  const [idle, setIdle] = useState(false);
  const exit = useRef(onExit);
  exit.current = onExit;

  // 창을 전체 화면으로, 화면 꺼짐 막기. 초록 단추·⌃⌘F로 전체 화면을 끝내도 이 모드를 닫는다.
  useEffect(() => {
    const win = getCurrentWindow();
    let alive = true;
    let wasFull = false;
    void win.setFullscreen(true).catch((err) => console.warn('[stage] 전체 화면 실패', err));
    void invoke('keep_awake', { on: true }).catch((err) => console.warn('[stage] 화면 꺼짐 막기 실패', err));
    const unlisten = win.onResized(() => {
      void win.isFullscreen().then((full) => {
        if (!alive) return;
        if (wasFull && !full) exit.current();
        wasFull = full;
      });
    });
    return () => {
      alive = false;
      void unlisten.then((f) => f());
      void win.setFullscreen(false).catch(() => undefined);
      void invoke('keep_awake', { on: false }).catch(() => undefined);
    };
  }, []);

  // 가만히 두면 커서·단추를 숨긴다. 스페이스(재생/일시정지)는 앱 전체 단축키가 받는다.
  useEffect(() => {
    let last = Date.now();
    const wake = () => {
      last = Date.now();
      setIdle(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        exit.current();
        return;
      }
      wake();
    };
    const timer = window.setInterval(() => Date.now() - last > IDLE_MS && setIdle(true), 500);
    window.addEventListener('mousemove', wake);
    window.addEventListener('mousedown', wake);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('mousedown', wake);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const toggle = () => {
    patchPlayer({ playing: !playerStore.get().playing });
    void run(ytm.control('toggle'));
  };

  // 시간 맞춤 가사가 있을 때만 이전·지금·다음 줄(첫 줄 전에는 ♪와 첫 줄)
  const lines = lyrics?.synced?.filter((l) => l.text.trim()) ?? [];
  const at = lines.length ? activeLine(lines, position + offset) : -1;
  const prev = at > 0 ? lines[at - 1].text : '';
  const now = at >= 0 ? lines[at].text : '♪';
  const next = lines[at + 1]?.text ?? '';
  const art = artwork && !ad ? largeArt(artwork) : '';
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return createPortal(
    <div className={`stage${idle ? ' is-idle' : ''}`} style={{ '--art': art ? `url("${art}")` : 'none' } as CSSProperties} role="dialog" aria-modal="true" aria-label={t('전체 화면')}>
      <div className="stage__bg" aria-hidden="true" />
      <div className="stage__shade" aria-hidden="true" />
      <button type="button" className="icon-btn stage__exit" aria-label={t('전체 화면 끝내기')} title={t('전체 화면 끝내기 (Esc)')} onClick={onExit}>
        <Icon name="close" size={22} />
      </button>

      <div className="stage__main">
        <Cover src={art || undefined} size="var(--stage-art)" className={`stage__art${playing ? '' : ' is-paused'}`} />
        <div className="stage__info">
          {album && !ad && <div className="stage__album">{album}</div>}
          <h1 className="stage__title">{ad ? t('광고') : title || t('재생 중인 곡이 없습니다')}</h1>
          {artist && <div className="stage__artist">{ad ? 'YouTube Music' : artist}</div>}
          {lines.length > 0 && !ad && (
            <div className="stage__lyrics">
              <p className="stage__line stage__line--prev">{prev}</p>
              <p key={at} className="stage__line stage__line--now">{now}</p>
              <p className="stage__line stage__line--next">{next}</p>
            </div>
          )}
          <CoverSpectrum playing={playing} width="min(100%, 560px)" className="stage__aura" />
        </div>
      </div>

      <footer className="stage__foot">
        <div className="stage__controls">
          <button type="button" className="icon-btn" aria-label={t('이전 곡')} onClick={() => void run(ytm.control('previous'))}>
            <Icon name="previous" size={24} />
          </button>
          <button type="button" className="play-btn stage__play" aria-label={playing ? t('일시정지') : t('재생')} onClick={toggle}>
            <Icon name={playing ? 'pause' : 'play'} size={24} />
          </button>
          <button type="button" className="icon-btn" aria-label={t('다음 곡')} onClick={() => void run(ytm.control('next'))}>
            <Icon name="next" size={24} />
          </button>
        </div>
        <div className="stage__progress" aria-hidden="true">
          <span>{formatTime(position)}</span>
          <div className="stage__bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
