import { createElement, type MouseEvent } from 'react';
import { lastChartId } from '../lib/spotify';
import { Logo } from './Logo';
import { showEngine } from '../lib/tauri';
import { deletePlaylist, useLibrary } from '../state/library';
import { go, navStore, routeForBrowse, useRoute } from '../state/nav';
import { openDialog, openMenu, toastError } from '../state/ui';
import { Cover } from './Cover';
import { ConfirmDialog, NewPlaylistDialog } from './Dialogs';
import { Icon, type IconName } from './Icon';
import { cardMenu } from './menus';

function NavItem({ icon, label, active, onClick }: { icon: IconName; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`side__nav${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} title={label} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

export function Sidebar() {
  const route = useRoute();
  const playlists = useLibrary((s) => s.playlists);
  const loaded = useLibrary((s) => s.playlistsLoaded);
  const account = useLibrary((s) => s.account);
  const loggedIn = useLibrary((s) => s.status.loggedIn);
  const currentId = route.name === 'playlist' ? route.id : '';

  const playlistMenu = (e: MouseEvent, card: (typeof playlists)[number]) => {
    e.preventDefault();
    const entries = cardMenu(card);
    if (card.browseId) {
      const id = card.browseId;
      entries.push({
        label: '플레이리스트 삭제…',
        danger: true,
        action: () =>
          openDialog(
            createElement(ConfirmDialog, {
              title: '플레이리스트 삭제',
              message: `'${card.title}'을(를) 삭제합니다. 내가 만든 플레이리스트만 삭제할 수 있고, 되돌릴 수 없습니다.`,
              confirmLabel: '삭제',
              onConfirm: async () => {
                const ok = await deletePlaylist(id, card.title);
                if (ok && navStore.get().stack[navStore.get().index]?.name === 'playlist') go({ name: 'library' });
                return ok;
              },
            }),
          ),
      });
    }
    openMenu(e.clientX, e.clientY, entries);
  };

  const accountMenu = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(r.left, r.top - 120, [
      { label: 'YouTube Music 웹 화면 열기', action: () => showEngine('web').catch((err) => toastError(err)) },
      { label: '다른 계정으로 로그인', action: () => showEngine('login').catch((err) => toastError(err)) },
      { label: 'YouTube Music 다시 연결', action: () => showEngine('reload').catch((err) => toastError(err)) },
    ]);
  };

  return (
    <nav className="side" aria-label="주 메뉴">
      <div className="side__brand" data-tauri-drag-region>
        <Logo size={24} />
        <span className="side__brand-text">YTM Desktop</span>
      </div>
      <div className="side__group">
        <NavItem icon="home" label="홈" active={route.name === 'home'} onClick={() => go({ name: 'home' })} />
        <NavItem icon="search" label="검색" active={route.name === 'search'} onClick={() => go({ name: 'search', query: '' })} />
        <NavItem icon="library" label="보관함" active={route.name === 'library'} onClick={() => go({ name: 'library' })} />
        <NavItem icon="chart" label="차트" active={route.name === 'spotify'} onClick={() => go({ name: 'spotify', id: lastChartId() })} />
      </div>

      <div className="side__section">
        <span>내 음악</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="새 플레이리스트"
          disabled={!loggedIn}
          onClick={() => openDialog(createElement(NewPlaylistDialog, { onCreated: (id: string) => go({ name: 'playlist', id: `VL${id}` }) }))}
        >
          <Icon name="plus" size={18} />
        </button>
      </div>
      <div className="side__list">
        <button type="button" className={`side__pl${route.name === 'liked' ? ' is-active' : ''}`} title="좋아요 표시한 곡" onClick={() => go({ name: 'liked' })}>
          <span className="side__liked" aria-hidden="true"><Icon name="heart" size={16} filled /></span>
          <span className="side__pl-text">
            <span className="side__pl-title">좋아요 표시한 곡</span>
          </span>
        </button>
        {loggedIn && !loaded && <p className="side__hint">플레이리스트를 불러오는 중…</p>}
        {playlists.map((p) => (
          <button
            key={p.browseId}
            type="button"
            className={`side__pl${currentId === p.browseId ? ' is-active' : ''}`}
            onClick={() => p.browseId && go(routeForBrowse(p.browseId))}
            onContextMenu={(e) => playlistMenu(e, p)}
            title={p.title}
          >
            <Cover src={p.thumbnail} size={36} />
            <span className="side__pl-text">
              <span className="side__pl-title">{p.title}</span>
              <span className="side__pl-sub">{p.subtitle}</span>
            </span>
          </button>
        ))}
      </div>

      <button type="button" className={`side__nav side__settings${route.name === 'settings' ? ' is-active' : ''}`} title="설정" onClick={() => go({ name: 'settings' })}>
        <Icon name="settings" size={20} />
        <span>설정</span>
      </button>
      {account && (
        <button type="button" className="side__account" title={account.name} onClick={accountMenu}>
          <Cover src={account.photo} size={28} round />
          <span className="side__account-name">{account.name}</span>
          <Icon name="more" size={16} />
        </button>
      )}
    </nav>
  );
}
