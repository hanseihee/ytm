import { createElement } from 'react';
import { lastChartId } from '../lib/spotify';
import { loadPlaylists, useLibrary } from '../state/library';
import { go } from '../state/nav';
import { openDialog } from '../state/ui';
import { CardGrid } from '../components/Cards';
import { NewPlaylistDialog } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { Empty, Loading } from './common';

export function LibraryView() {
  const playlists = useLibrary((s) => s.playlists);
  const loaded = useLibrary((s) => s.playlistsLoaded);
  const likedCount = useLibrary((s) => s.liked.size);

  return (
    <div className="page">
      <header className="page__head">
        <h1 className="page__title">보관함</h1>
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
      </header>

      <div className="library-pins">
        <button type="button" className="pin pin--liked" onClick={() => go({ name: 'liked' })}>
          <Icon name="heart" size={28} filled />
          <span className="pin__title">좋아요 표시한 곡</span>
          <span className="pin__sub">{likedCount ? `${likedCount}곡 이상` : '하트를 누른 곡'}</span>
        </button>
        <button type="button" className="pin pin--chart" onClick={() => go({ name: 'spotify', id: lastChartId() })}>
          <span className="pin__rank">100</span>
          <span className="pin__title">차트</span>
          <span className="pin__sub">멜론 TOP 100 · Spotify Top 50을 YouTube Music으로</span>
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
    </div>
  );
}
