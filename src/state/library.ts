// 보관함·계정·엔진 연결 상태와, 곡·플레이리스트에 대한 동작(좋아요·추가·삭제 등).
import { createStore, useStore } from '../lib/store';
import { getEngineStatus, onEngineStatus, type EngineStatus } from '../lib/tauri';
import * as ytm from '../lib/ytm/client';
import type { Account, Card, Track } from '../lib/ytm/types';
import { obj } from '../lib/ko';
import { toast, toastError } from './ui';

interface LibraryState {
  status: EngineStatus;
  account?: Account;
  /** 좋아요 표시한 곡 videoId */
  liked: Set<string>;
  likedLoaded: boolean;
  playlists: Card[];
  playlistsLoaded: boolean;
  /** 보관함 화면 등이 다시 불러와야 할 때 올라가는 숫자 */
  revision: number;
}

export const libraryStore = createStore<LibraryState>({
  status: { ready: false, host: '', path: '', loggedIn: false, subscriber: false },
  liked: new Set(),
  likedLoaded: false,
  playlists: [],
  playlistsLoaded: false,
  revision: 0,
});

export const useLibrary = <S>(select: (s: LibraryState) => S) => useStore(libraryStore, select);
export const useLiked = (videoId: string | undefined) => useLibrary((s) => !!videoId && s.liked.has(videoId));

const bump = () => libraryStore.set((s) => ({ ...s, revision: s.revision + 1 }));

/** 좋아요 목록은 처음 몇 쪽만 미리 읽어 하트 표시에 쓴다(많으면 나머지는 화면에서 이어받기). */
const LIKED_PAGES = 10;

async function loadLiked() {
  try {
    const first = await ytm.likedSongs();
    const ids = new Set(first.tracks.map((t) => t.videoId));
    libraryStore.set((s) => ({ ...s, liked: new Set(ids), likedLoaded: true }));
    let next = first.continuation;
    for (let page = 1; next && page < LIKED_PAGES; page++) {
      const more = await ytm.playlistMore(next);
      more.tracks.forEach((t) => ids.add(t.videoId));
      next = more.continuation;
    }
    libraryStore.set((s) => ({ ...s, liked: new Set(ids) }));
  } catch (err) {
    console.warn('[library] 좋아요 목록 실패', err);
  }
}

export async function loadPlaylists() {
  try {
    const { cards } = await ytm.libraryPlaylists();
    // "좋아요 표시한 곡"은 사이드바에 따로 있으므로 뺀다.
    const playlists = cards.filter((c) => c.kind === 'playlist' && c.browseId !== 'VLLM');
    libraryStore.set((s) => ({ ...s, playlists, playlistsLoaded: true }));
  } catch (err) {
    console.warn('[library] 플레이리스트 목록 실패', err);
    libraryStore.set((s) => ({ ...s, playlistsLoaded: true }));
  }
}

async function loadAccount() {
  try {
    const account = await ytm.account();
    libraryStore.set((s) => ({ ...s, account }));
  } catch (err) {
    console.warn('[library] 계정 정보 실패', err);
  }
}

let loadedFor = '';
function onStatus(status: EngineStatus) {
  libraryStore.set((s) => ({ ...s, status }));
  const key = status.ready && status.loggedIn ? 'in' : 'out';
  if (key === loadedFor) return;
  loadedFor = key;
  if (key === 'in') {
    void loadAccount();
    void loadLiked();
    void loadPlaylists();
  } else {
    libraryStore.set((s) => ({ ...s, account: undefined, liked: new Set(), likedLoaded: false, playlists: [], playlistsLoaded: false }));
  }
}

export async function startLibrarySync() {
  onStatus(await getEngineStatus());
  return onEngineStatus(onStatus);
}

// ── 곡 동작 ────────────────────────────────────────────────────────────────

export async function toggleLike(track: Pick<Track, 'videoId' | 'title'>) {
  const was = libraryStore.get().liked.has(track.videoId);
  const apply = (liked: boolean) =>
    libraryStore.set((s) => {
      const next = new Set(s.liked);
      if (liked) next.add(track.videoId);
      else next.delete(track.videoId);
      return { ...s, liked: next };
    });
  apply(!was);
  try {
    await ytm.setTrackLiked(track.videoId, !was);
    toast(was ? `'${track.title}' 좋아요를 취소했습니다` : `${obj(track.title)} 좋아요 표시한 곡에 추가했습니다`);
    bump();
  } catch (err) {
    apply(was);
    toastError(err, '좋아요를 바꾸지 못했습니다');
  }
}

export async function addTracksToPlaylist(playlist: { playlistId: string; title: string }, tracks: Track[]) {
  try {
    await ytm.addToPlaylist(playlist.playlistId, tracks.map((t) => t.videoId));
    toast(tracks.length === 1 ? `'${playlist.title}'에 ${obj(tracks[0].title)} 추가했습니다` : `'${playlist.title}'에 ${tracks.length}곡을 추가했습니다`);
    bump();
  } catch (err) {
    toastError(err, '플레이리스트에 추가하지 못했습니다');
  }
}

export async function removeTracksFromPlaylist(playlistId: string, tracks: Track[]) {
  try {
    await ytm.removeFromPlaylist(playlistId, tracks);
    toast(tracks.length === 1 ? `${obj(tracks[0].title)} 플레이리스트에서 뺐습니다` : `${tracks.length}곡을 플레이리스트에서 뺐습니다`);
    bump();
    return true;
  } catch (err) {
    toastError(err, '플레이리스트에서 빼지 못했습니다');
    return false;
  }
}

export async function createPlaylist(title: string, description: string, privacy: ytm.Privacy, tracks: Track[] = []) {
  try {
    const id = await ytm.createPlaylist(title, description, privacy, tracks.map((t) => t.videoId));
    toast(`'${title}' 플레이리스트를 만들었습니다`);
    await loadPlaylists();
    bump();
    return id;
  } catch (err) {
    toastError(err, '플레이리스트를 만들지 못했습니다');
    return undefined;
  }
}

export async function renamePlaylist(playlistId: string, title: string, description?: string) {
  try {
    await ytm.renamePlaylist(playlistId, title, description);
    toast('플레이리스트 정보를 바꿨습니다');
    await loadPlaylists();
    bump();
    return true;
  } catch (err) {
    toastError(err, '플레이리스트 정보를 바꾸지 못했습니다');
    return false;
  }
}

export async function deletePlaylist(playlistId: string, title: string) {
  try {
    await ytm.deletePlaylist(playlistId);
    toast(`'${title}' 플레이리스트를 삭제했습니다`);
    await loadPlaylists();
    bump();
    return true;
  } catch (err) {
    toastError(err, '플레이리스트를 삭제하지 못했습니다');
    return false;
  }
}

export async function setSaved(playlistId: string, title: string, saved: boolean) {
  try {
    await ytm.setCollectionSaved(playlistId, saved);
    toast(saved ? `${obj(title)} 보관함에 저장했습니다` : `${obj(title)} 보관함에서 뺐습니다`);
    await loadPlaylists();
    bump();
    return true;
  } catch (err) {
    toastError(err, '보관함을 바꾸지 못했습니다');
    return false;
  }
}

// ── 재생 ───────────────────────────────────────────────────────────────────

export async function playTrack(track: Track) {
  if (!track.available) {
    toast('이 곡은 지금 계정으로 재생할 수 없습니다', 'error');
    return;
  }
  try {
    await ytm.playTrack(track);
  } catch (err) {
    toastError(err, '재생하지 못했습니다');
  }
}

export async function playEndpoint(endpoint: Parameters<typeof ytm.play>[0], what = '재생') {
  try {
    await ytm.play(endpoint);
  } catch (err) {
    toastError(err, `${what}하지 못했습니다`);
  }
}

export async function enqueue(target: { videoId?: string; playlistId?: string }, title: string, position: 'next' | 'end') {
  try {
    await ytm.queueAdd(target, position);
    toast(position === 'next' ? `${obj(title)} 다음에 재생합니다` : `${obj(title)} 대기열 끝에 추가했습니다`);
  } catch (err) {
    toastError(err, '대기열에 추가하지 못했습니다');
  }
}
