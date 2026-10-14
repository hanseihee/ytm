// 보관함: 재생목록 · 앨범 · 아티스트 · 구독 · 최근 재생 탭.
import { createElement, useState } from 'react';
import { lastChartId } from '../lib/spotify';
import { useAsync } from '../lib/useAsync';
import * as ytm from '../lib/ytm/client';
import type { Card, Continuation } from '../lib/ytm/types';
import { loadPlaylists, useLibrary } from '../state/library';
import { go, replace, type LibraryTab } from '../state/nav';
import { openDialog } from '../state/ui';
import { CardGrid, ShelfView } from '../components/Cards';
import { NewPlaylistDialog } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { Empty, ErrorState, LoadMore, Loading } from './common';

const TABS: { id: LibraryTab; label: string }[] = [
  { id: 'playlists', label: '재생목록' },
  { id: 'albums', label: '앨범' },
  { id: 'artists', label: '아티스트' },
  { id: 'subscriptions', label: '구독' },
  { id: 'history', label: '최근 재생' },
];

function Playlists() {
  const playlists = useLibrary((s) => s.playlists);
  const loaded = useLibrary((s) => s.playlistsLoaded);
  const likedCount = useLibrary((s) => s.liked.size);
  return (
    <>
      <div className="library-pins">
        <button type="button" className="pin pin--liked" onClick={() => go({ name: 'liked' })}>
          <Icon name="heart" size={28} filled />
          <span className="pin__title">좋아요 표시한 곡</span>
          <span className="pin__sub">{likedCount ? `${likedCount}곡 이상` : '하트를 누른 곡'}</span>
        </button>
        <button type="button" className="pin pin--chart" onClick={() => go({ name: 'spotify', id: lastChartId() })}>
          <span className="pin__rank">100</span>
          <span className="pin__title">차트</span>
          <span className="pin__sub">멜론·지니·Spotify·빌보드 등을 YouTube Music으로</span>
        </button>
        <button type="button" className="pin pin--chart" onClick={() => go({ name: 'stats' })}>
          <span className="pin__rank"><Icon name="stats" size={22} /></span>
          <span className="pin__title">청취 통계</span>
          <span className="pin__sub">이 기기에서 많이 들은 곡·아티스트</span>
        </button>
      </div>
      <h2 className="shelf__title">플레이리스트</h2>
      {!loaded ? (
        <Loading />
      ) : playlists.length === 0 ? (
        <Empty title="저장한 플레이리스트가 없습니다">
          <p>새 플레이리스트를 만들거나, 마음에 드는 앨범·플레이리스트의 "보관함에 저장"을 누르세요.</p>
        </Empty>
      ) : (
        <CardGrid cards={playlists} />
      )}
    </>
  );
}

/** 앨범·아티스트·구독: 카드 격자 + 이어받기 */
function CardTab({ tab }: { tab: 'albums' | 'artists' | 'subscriptions' }) {
  const load = tab === 'albums' ? ytm.libraryAlbums : tab === 'artists' ? ytm.libraryArtists : ytm.librarySubscriptions;
  const revision = useLibrary((s) => s.revision);
  const res = useAsync(`library:${tab}:${revision}`, async () => {
    const page = await load();
    const shelf = page.shelves[0];
    return { cards: page.shelves.flatMap((s) => s.cards), continuation: shelf?.continuation as Continuation | undefined };
  });
  const [busy, setBusy] = useState(false);
  const more = async () => {
    const c = res.data?.continuation;
    if (!c || busy) return;
    setBusy(true);
    try {
      const page = await ytm.libraryMore(c);
      res.setData((prev) => ({ cards: [...prev.cards, ...page.cards], continuation: page.continuation }));
    } catch (err) {
      console.warn('[library] 더 불러오기 실패', err);
      res.setData((prev) => ({ ...prev, continuation: undefined }));
    } finally {
      setBusy(false);
    }
  };
  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorState message={res.error} onRetry={res.reload} />;
  const cards: Card[] = res.data?.cards ?? [];
  if (!cards.length) {
    const text = tab === 'albums' ? '보관함에 저장한 앨범이 없습니다' : tab === 'artists' ? '보관함 곡의 아티스트가 없습니다' : '구독한 아티스트가 없습니다';
    return <Empty title={text} />;
  }
  return (
    <>
      <CardGrid cards={cards} />
      {res.data?.continuation && <LoadMore onReach={more} busy={busy} />}
    </>
  );
}

function History() {
  const res = useAsync('library:history', () => ytm.history());
  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorState message={res.error} onRetry={res.reload} />;
  const shelves = res.data?.shelves ?? [];
  if (!shelves.length) return <Empty title="최근에 들은 곡이 없습니다" />;
  return (
    <>
      <p className="field__hint">YouTube Music 계정의 재생 기록이라 다른 기기에서 들은 곡도 나옵니다.</p>
      {shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={s} />)}
    </>
  );
}

export function LibraryView({ tab = 'playlists' }: { tab?: LibraryTab }) {
  return (
    <div className="page">
      <header className="page__head">
        <h1 className="page__title">보관함</h1>
        {tab === 'playlists' && (
          <div className="page__tools">
            <button type="button" className="btn btn--quiet" onClick={() => void loadPlaylists()}>새로 고침</button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => openDialog(createElement(NewPlaylistDialog, { onCreated: (id: string) => go({ name: 'playlist', id: `VL${id}` }) }))}
            >
              <Icon name="plus" size={17} /> 새 플레이리스트
            </button>
          </div>
        )}
      </header>
      <div className="chips" role="tablist" aria-label="보관함">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={`chip${t.id === tab ? ' is-on' : ''}`} onClick={() => replace({ name: 'library', tab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'playlists' ? <Playlists /> : tab === 'history' ? <History /> : <CardTab tab={tab} />}
    </div>
  );
}
