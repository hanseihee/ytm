// 보관함·계정·엔진 연결 상태와, 곡·플레이리스트에 대한 동작(좋아요·추가·삭제 등).
import { createStore, useStore } from '../lib/store';
import { getEngineStatus, onEngineStatus, type EngineStatus } from '../lib/tauri';
import * as ytm from '../lib/ytm/client';
import type { Account, Card, Track } from '../lib/ytm/types';
import { t } from '../i18n';
import { playerStore } from './player';
import { toast, toastError } from './ui';

interface LibraryState {
  status: EngineStatus;
  account?: Account;
  /** 좋아요 표시한 곡 videoId */
  liked: Set<string>;
  likedLoaded: boolean;
  /** 이 실행에서 싫어요 표시한 곡 videoId(지금 곡은 재생 바의 likeStatus를 따른다) */
  disliked: Set<string>;
  playlists: Card[];
  playlistsLoaded: boolean;
  /** 보관함 화면 등이 다시 불러와야 할 때 올라가는 숫자 */
  revision: number;
}

export const libraryStore = createStore<LibraryState>({
  status: { ready: false, host: '', path: '', loggedIn: false, subscriber: false },
  liked: new Set(),
  likedLoaded: false,
  disliked: new Set(),
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
    libraryStore.set((s) => ({ ...s, account: undefined, liked: new Set(), likedLoaded: false, disliked: new Set(), playlists: [], playlistsLoaded: false }));
  }
}

export async function startLibrarySync() {
  onStatus(await getEngineStatus());
  return onEngineStatus(onStatus);
}

// ── 곡 동작 ────────────────────────────────────────────────────────────────

/** 좋아요·싫어요 표시를 한꺼번에 바꾼다(실패하면 되돌릴 때도 쓴다). */
function setMarks(videoId: string, marks: { liked: boolean; disliked: boolean }) {
  libraryStore.set((s) => {
    const liked = new Set(s.liked);
    const disliked = new Set(s.disliked);
    if (marks.liked) liked.add(videoId);
    else liked.delete(videoId);
    if (marks.disliked) disliked.add(videoId);
    else disliked.delete(videoId);
    return { ...s, liked, disliked };
  });
}

export async function toggleLike(track: Pick<Track, 'videoId' | 'title'>) {
  const s = libraryStore.get();
  const was = s.liked.has(track.videoId);
  const wasDisliked = s.disliked.has(track.videoId);
  // 좋아요와 싫어요는 함께 있을 수 없다(YouTube Music이 좋아요를 누르면 싫어요를 지운다).
  setMarks(track.videoId, { liked: !was, disliked: was ? wasDisliked : false });
  try {
    await ytm.setTrackLiked(track.videoId, !was);
    toast(was ? t("'{title}' 좋아요를 취소했습니다", { title: track.title }) : t('{title|을} 좋아요 표시한 곡에 추가했습니다', { title: track.title }));
    bump();
  } catch (err) {
    setMarks(track.videoId, { liked: was, disliked: wasDisliked });
    toastError(err, t('좋아요를 바꾸지 못했습니다'));
  }
}

/** 싫어요 표시가 되어 있는지. 지금 곡은 YouTube Music 재생 바의 상태(likeStatus)를 따른다. */
export function isDisliked(videoId: string): boolean {
  const p = playerStore.get();
  if (p.videoId === videoId && !p.ad) return p.likeStatus === 'DISLIKE';
  return libraryStore.get().disliked.has(videoId);
}

/** 지금 곡이 다른 곡으로 바뀔 때까지 기다린다(ms 안에 바뀌면 true). */
function waitTrackChange(videoId: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (playerStore.get().videoId !== videoId) return resolve(true);
    const stop = playerStore.subscribe(() => {
      if (playerStore.get().videoId === videoId) return;
      clearTimeout(timer);
      stop();
      resolve(true);
    });
    const timer = setTimeout(() => {
      stop();
      resolve(false);
    }, ms);
  });
}

/** 지금 곡 싫어요 뒤 YouTube Music이 스스로 넘기기를 기다리는 시간. 넘기지 않으면 앱이 넘긴다. */
const DISLIKE_SKIP_WAIT_MS = 2500;

/**
 * 싫어요 / 취소. 지금 곡이면 YouTube Music 재생 바의 싫어요 단추를 눌러 재생 바 상태를 맞추고, 웹 플레이어처럼 다음 곡으로
 * 넘어간다(YouTube Music은 지금 곡이 DISLIKE가 되면 넘긴다, 2026-10-16 분석 — 넘기지 않으면 앱이 넘긴다).
 * 다른 곡은 API로 바꾼다.
 */
export async function toggleDislike(track: Pick<Track, 'videoId' | 'title'>) {
  const p = playerStore.get();
  const current = p.videoId === track.videoId && !p.ad;
  const was = isDisliked(track.videoId);
  const wasLiked = libraryStore.get().liked.has(track.videoId);
  setMarks(track.videoId, { liked: was ? wasLiked : false, disliked: !was });
  try {
    let skipped = false;
    if (current && (await ytm.control('dislike')) === true) {
      if (!was) {
        if (!(await waitTrackChange(track.videoId, DISLIKE_SKIP_WAIT_MS))) await ytm.control('next');
        skipped = true;
      }
    } else {
      await ytm.setTrackDisliked(track.videoId, !was);
      // 재생 바 단추를 누르지 못했어도 지금 곡이면 웹처럼 다음 곡으로 넘긴다.
      if (current && !was) {
        await ytm.control('next');
        skipped = true;
      }
    }
    toast(
      was
        ? t("'{title}' 싫어요를 취소했습니다", { title: track.title })
        : skipped
          ? t('{title|을} 싫어요 표시하고 다음 곡으로 넘겼습니다', { title: track.title })
          : t('{title|을} 싫어요 표시했습니다. 비슷한 곡이 덜 추천됩니다', { title: track.title }),
    );
    if (!was && wasLiked) bump();
  } catch (err) {
    setMarks(track.videoId, { liked: wasLiked, disliked: was });
    toastError(err, t('싫어요를 바꾸지 못했습니다'));
  }
}

export async function addTracksToPlaylist(playlist: { playlistId: string; title: string }, tracks: Track[]) {
  try {
    await ytm.addToPlaylist(playlist.playlistId, tracks.map((t) => t.videoId));
    toast(
      tracks.length === 1
        ? t("'{playlist}'에 {title|을} 추가했습니다", { playlist: playlist.title, title: tracks[0].title })
        : t("'{playlist}'에 {n}곡을 추가했습니다", { playlist: playlist.title, n: tracks.length }),
    );
    bump();
  } catch (err) {
    toastError(err, t('플레이리스트에 추가하지 못했습니다'));
  }
}

export async function removeTracksFromPlaylist(playlistId: string, tracks: Track[]) {
  try {
    await ytm.removeFromPlaylist(playlistId, tracks);
    toast(
      tracks.length === 1
        ? t('{title|을} 플레이리스트에서 뺐습니다', { title: tracks[0].title })
        : t('{n}곡을 플레이리스트에서 뺐습니다', { n: tracks.length }),
    );
    bump();
    return true;
  } catch (err) {
    toastError(err, t('플레이리스트에서 빼지 못했습니다'));
    return false;
  }
}

export async function createPlaylist(title: string, description: string, privacy: ytm.Privacy, tracks: Track[] = []) {
  try {
    const id = await ytm.createPlaylist(title, description, privacy, tracks.map((t) => t.videoId));
    toast(t("'{title}' 플레이리스트를 만들었습니다", { title }));
    await loadPlaylists();
    bump();
    return id;
  } catch (err) {
    toastError(err, t('플레이리스트를 만들지 못했습니다'));
    return undefined;
  }
}

export async function renamePlaylist(playlistId: string, title: string, description?: string) {
  try {
    await ytm.renamePlaylist(playlistId, title, description);
    toast(t('플레이리스트 정보를 바꿨습니다'));
    await loadPlaylists();
    bump();
    return true;
  } catch (err) {
    toastError(err, t('플레이리스트 정보를 바꾸지 못했습니다'));
    return false;
  }
}

export async function deletePlaylist(playlistId: string, title: string) {
  try {
    await ytm.deletePlaylist(playlistId);
    toast(t("'{title}' 플레이리스트를 삭제했습니다", { title }));
    await loadPlaylists();
    bump();
    return true;
  } catch (err) {
    toastError(err, t('플레이리스트를 삭제하지 못했습니다'));
    return false;
  }
}

export async function setSaved(playlistId: string, title: string, saved: boolean) {
  try {
    await ytm.setCollectionSaved(playlistId, saved);
    toast(saved ? t('{title|을} 보관함에 저장했습니다', { title }) : t('{title|을} 보관함에서 뺐습니다', { title }));
    await loadPlaylists();
    bump();
    return true;
  } catch (err) {
    toastError(err, t('보관함을 바꾸지 못했습니다'));
    return false;
  }
}

// ── 재생 ───────────────────────────────────────────────────────────────────

export async function playTrack(track: Track) {
  if (!track.available) {
    toast(t('이 곡은 지금 계정으로 재생할 수 없습니다'), 'error');
    return;
  }
  try {
    await ytm.playTrack(track);
  } catch (err) {
    toastError(err, t('재생하지 못했습니다'));
  }
}

/** what: 실패 알림에 넣을 동작 이름(부르는 쪽이 t()로 바꿔 넘긴다. 없으면 '재생') */
export async function playEndpoint(endpoint: Parameters<typeof ytm.play>[0], what?: string) {
  try {
    await ytm.play(endpoint);
  } catch (err) {
    toastError(err, what === undefined ? t('재생하지 못했습니다') : t('{what}하지 못했습니다', { what }));
  }
}

/** 엔진이 한 번에 대기열에 넣는 곡 수(engine.js queueAdd) */
const QUEUE_ADD_MAX = 200;

/**
 * 보이는 순서대로 재생(정렬한 목록): 첫 곡을 그 곡의 믹스로 시작하고 나머지를 바로 뒤에 넣는다(차트의 "1위부터 재생"과 같은 방식).
 * 목록 맥락(playlistId)으로 시작하면 원래 순서의 곡들이 뒤에 다시 이어지므로 맥락 없이 시작한다.
 */
export async function playInOrder(tracks: Track[]) {
  const list = tracks.filter((track) => track.available);
  if (!list.length) return;
  const [first, ...rest] = list;
  const queued = rest.slice(0, QUEUE_ADD_MAX);
  try {
    await ytm.playTrack({ ...first, play: { watchEndpoint: { videoId: first.videoId } } });
    if (queued.length) await ytm.queueAdd({ videoIds: queued.map((track) => track.videoId) }, 'next');
    toast(t('{n}곡을 이 순서대로 재생합니다', { n: queued.length + 1 }));
  } catch (err) {
    toastError(err, t('이 순서대로 재생하지 못했습니다'));
  }
}

export async function enqueue(target: { videoId?: string; playlistId?: string }, title: string, position: 'next' | 'end') {
  try {
    await ytm.queueAdd(target, position);
    toast(position === 'next' ? t('{title|을} 다음에 재생합니다', { title }) : t('{title|을} 대기열 끝에 추가했습니다', { title }));
  } catch (err) {
    toastError(err, t('대기열에 추가하지 못했습니다'));
  }
}
