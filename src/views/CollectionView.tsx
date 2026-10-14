import { createElement, useState, type MouseEvent } from 'react';
import { useAsync } from '../lib/useAsync';
import * as ytm from '../lib/ytm/client';
import type { Collection, Track } from '../lib/ytm/types';
import { deletePlaylist, enqueue, playEndpoint, playTrack, setSaved, useLibrary } from '../state/library';
import { go } from '../state/nav';
import { openDialog, openMenu, type MenuEntry } from '../state/ui';
import { ShelfView } from '../components/Cards';
import { Cover } from '../components/Cover';
import { ConfirmDialog, RenamePlaylistDialog } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { ArtistLinks, TrackList } from '../components/TrackList';
import { addToPlaylistEntry } from '../components/menus';
import { obj } from '../lib/ko';
import { Empty, ErrorState, LoadMore, Loading } from './common';

type Kind = 'album' | 'playlist' | 'liked';

function load(kind: Kind, id: string): Promise<Collection> {
  if (kind === 'album') return ytm.album(id);
  if (kind === 'liked') return ytm.likedSongs();
  return ytm.playlist(id);
}

export function CollectionView({ kind, id = '' }: { kind: Kind; id?: string }) {
  // 플레이리스트는 곡을 넣고 빼면 다시 불러온다(보관함 변경 번호를 열쇠에 넣는다).
  const revision = useLibrary((s) => s.revision);
  const key = kind === 'album' ? `album:${id}` : `${kind}:${id}:${revision}`;
  const res = useAsync(key, () => load(kind, id));
  const [busy, setBusy] = useState(false);
  const [saved, setSavedLocal] = useState<boolean | undefined>(undefined);

  if (res.loading && !res.data) return <div className="page"><Loading /></div>;
  if (res.error) return <div className="page"><ErrorState message={res.error} onRetry={res.reload} /></div>;
  const data = res.data;
  if (!data) return null;
  const h = data.header;
  const title = kind === 'liked' ? '좋아요 표시한 곡' : h.title;
  const playlistId = h.playlistId ?? (kind === 'playlist' && id.startsWith('VL') ? id.slice(2) : undefined) ?? (kind === 'liked' ? 'LM' : undefined);
  const isSaved = saved ?? h.saved;
  const editable = h.editable && kind === 'playlist';

  const more = async () => {
    if (!data.continuation || busy) return;
    setBusy(true);
    try {
      const page = await ytm.playlistMore(data.continuation);
      res.setData((prev) => ({ ...prev, tracks: [...prev.tracks, ...page.tracks], continuation: page.continuation }));
    } catch (err) {
      console.warn('[collection] 더 불러오기 실패', err);
      res.setData((prev) => ({ ...prev, continuation: undefined }));
    } finally {
      setBusy(false);
    }
  };

  const playAll = () => {
    if (h.play) void playEndpoint(h.play);
    else if (playlistId) void playEndpoint({ watchPlaylistEndpoint: { playlistId } });
    else if (data.tracks[0]) void playTrack(data.tracks[0]);
  };
  const shuffle = () => {
    if (h.shuffle) void playEndpoint(h.shuffle, '셔플 재생');
    else if (playlistId) void playEndpoint({ watchPlaylistEndpoint: { playlistId, params: 'wAEB8gECKAE%3D' } }, '셔플 재생');
  };

  const onRemoved = (track: Track) =>
    res.setData((prev) => ({ ...prev, tracks: prev.tracks.filter((t) => t.setVideoId !== track.setVideoId) }));

  const menu = (e: MouseEvent) => {
    const entries: MenuEntry[] = [];
    if (playlistId) {
      entries.push(
        { label: '다음에 재생', action: () => enqueue({ playlistId }, title, 'next') },
        { label: '대기열 끝에 추가', action: () => enqueue({ playlistId }, title, 'end') },
      );
    }
    if (h.radio) entries.push({ label: '믹스 시작', action: () => playEndpoint(h.radio!, '믹스를 시작') });
    if (data.tracks.length) entries.push(addToPlaylistEntry(data.tracks.filter((t) => t.available)));
    if (editable && playlistId) {
      entries.push(
        { label: '', separator: true },
        { label: '정보 바꾸기…', action: () => openDialog(createElement(RenamePlaylistDialog, { playlistId, title: h.title, description: h.description, onDone: res.reload })) },
        {
          label: '플레이리스트 삭제…',
          danger: true,
          action: () =>
            openDialog(
              createElement(ConfirmDialog, {
                title: '플레이리스트 삭제',
                message: `${obj(h.title)} 삭제합니다. 되돌릴 수 없습니다.`,
                confirmLabel: '삭제',
                onConfirm: async () => {
                  const ok = await deletePlaylist(playlistId, h.title);
                  if (ok) go({ name: 'library' });
                  return ok;
                },
              }),
            ),
        },
      );
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(r.left, r.bottom + 6, entries);
  };

  const canSave = !!playlistId && !editable && kind !== 'liked';
  return (
    <div className="page">
      <header className="hero">
        {kind === 'liked' ? (
          <div className="hero__art hero__art--liked" aria-hidden="true"><Icon name="heart" size={72} filled /></div>
        ) : (
          <Cover src={h.thumbnail} size={232} className="hero__art" />
        )}
        <div className="hero__text">
          <span className="hero__type">{kind === 'liked' ? '자동 플레이리스트' : h.typeLabel || (kind === 'album' ? '앨범' : '플레이리스트')}</span>
          <h1 className="hero__title">{title}</h1>
          <div className="hero__meta">
            <ArtistLinks artists={h.artists} className="hero__artists" />
            {h.year && <span>{h.year}</span>}
            {h.stats && <span>{h.stats}</span>}
          </div>
          {h.description && <p className="hero__desc">{h.description}</p>}
          <div className="hero__actions">
            <button type="button" className="btn btn--primary btn--play" onClick={playAll} disabled={!data.tracks.length && !h.play}>
              <Icon name="play" size={18} /> 재생
            </button>
            <button type="button" className="btn btn--quiet" onClick={shuffle} disabled={!h.shuffle && !playlistId}>
              <Icon name="shuffle" size={17} /> 셔플
            </button>
            {canSave && (
              <button
                type="button"
                className={`btn btn--quiet${isSaved ? ' is-on' : ''}`}
                onClick={async () => {
                  const ok = await setSaved(playlistId!, title, !isSaved);
                  if (ok) setSavedLocal(!isSaved);
                }}
              >
                <Icon name="bookmark" size={17} filled={!!isSaved} /> {isSaved ? '보관함에 있음' : '보관함에 저장'}
              </button>
            )}
            <button type="button" className="icon-btn icon-btn--round" aria-label="더 보기" onClick={menu}>
              <Icon name="more" size={20} />
            </button>
          </div>
        </div>
      </header>

      {data.tracks.length === 0 ? (
        <Empty title={kind === 'liked' ? '아직 좋아요 표시한 곡이 없습니다' : '곡이 없습니다'}>
          <p>{kind === 'liked' ? '곡 옆의 하트를 누르면 여기에 모입니다.' : editable ? '곡의 ⋯ 메뉴에서 "플레이리스트에 추가"를 고르세요.' : ''}</p>
        </Empty>
      ) : (
        <TrackList
          tracks={data.tracks}
          numbered={kind === 'album'}
          showCover={kind !== 'album'}
          showAlbum={kind !== 'album'}
          editablePlaylistId={editable ? playlistId : undefined}
          onRemoved={onRemoved}
        />
      )}
      {data.continuation && <LoadMore onReach={more} busy={busy} />}
      {data.shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={s} />)}
    </div>
  );
}
