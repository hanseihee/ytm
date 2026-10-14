// YouTube Music 기능 모음. 요청은 숨은 엔진 창(로그인된 music.youtube.com) 안에서 나간다.
import { engineCall } from '../tauri';
import {
  parseAccount,
  parseAddToPlaylist,
  parseAlbum,
  parseArtist,
  parseBrowseGeneric,
  parseContinuationItems,
  parseHome,
  parseLibraryPlaylists,
  parseLyrics,
  parsePlaylist,
  parseQueue,
  parseSearch,
  parseSuggestions,
  lyricsBrowseId,
} from './parse';
import type { Continuation, Endpoint, Track } from './types';

type Json = Record<string, unknown>;

function api<T = Json>(endpoint: string, body: Json = {}, query: Json = {}): Promise<T> {
  return engineCall<T>('api', { endpoint, body, query });
}

/** 이어받기 요청: 옛 방식은 ?ctoken=&continuation=&type=next, 새 방식은 본문 continuation */
function continueBrowse(endpoint: 'browse' | 'search', c: Continuation) {
  return c.style === 'query'
    ? api(endpoint, {}, { ctoken: c.token, continuation: c.token, type: 'next' })
    : api(endpoint, { continuation: c.token });
}

// ── 둘러보기 ───────────────────────────────────────────────────────────────

export const home = async () => parseHome(await api('browse', { browseId: 'FEmusic_home' }));
export const homeMore = async (c: Continuation) => parseContinuationItems(await continueBrowse('browse', c));

export const search = async (query: string, params?: string) =>
  parseSearch(await api('search', params ? { query, params } : { query }));
export const searchMore = async (c: Continuation) => parseContinuationItems(await continueBrowse('search', c));
export const suggestions = async (input: string) =>
  parseSuggestions(await api('music/get_search_suggestions', { input }));

export const album = async (browseId: string) => parseAlbum(await api('browse', { browseId }), browseId);
export const playlist = async (browseId: string) =>
  parsePlaylist(await api('browse', { browseId: browseId.startsWith('VL') ? browseId : `VL${browseId}` }));
export const playlistMore = async (c: Continuation) => parseContinuationItems(await continueBrowse('browse', c));
export const artist = async (browseId: string) => parseArtist(await api('browse', { browseId }));
export const browse = async (browseId: string, params?: string) =>
  parseBrowseGeneric(await api('browse', params ? { browseId, params } : { browseId }));

// ── 보관함 ─────────────────────────────────────────────────────────────────

export const likedSongs = () => playlist('VLLM');
export const libraryPlaylists = async () => parseLibraryPlaylists(await api('browse', { browseId: 'FEmusic_liked_playlists' }));
export const account = async () => parseAccount(await api('account/account_menu'));

/** 곡 좋아요 / 취소 */
export const setTrackLiked = (videoId: string, liked: boolean) =>
  api(liked ? 'like/like' : 'like/removelike', { target: { videoId } });

/** 앨범·플레이리스트 보관함 저장 / 빼기 */
export const setCollectionSaved = (playlistId: string, saved: boolean) =>
  api(saved ? 'like/like' : 'like/removelike', { target: { playlistId } });

export const addToPlaylistOptions = async (videoIds: string[]) =>
  parseAddToPlaylist(await api('playlist/get_add_to_playlist', { videoIds }));

export type Privacy = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';

export async function createPlaylist(title: string, description: string, privacy: Privacy, videoIds: string[] = []) {
  const res = await api<{ playlistId?: string }>('playlist/create', {
    title,
    description,
    privacyStatus: privacy,
    ...(videoIds.length ? { videoIds } : {}),
  });
  if (!res.playlistId) throw new Error('플레이리스트를 만들지 못했습니다.');
  return res.playlistId;
}

const stripVL = (id: string) => (id.startsWith('VL') ? id.slice(2) : id);

export const addToPlaylist = (playlistId: string, videoIds: string[]) =>
  api<{ status?: string }>('browse/edit_playlist', {
    playlistId: stripVL(playlistId),
    actions: videoIds.map((addedVideoId) => ({ action: 'ACTION_ADD_VIDEO', addedVideoId, dedupeOption: 'DEDUPE_OPTION_SKIP' })),
  });

export const removeFromPlaylist = (playlistId: string, tracks: Pick<Track, 'videoId' | 'setVideoId'>[]) =>
  api('browse/edit_playlist', {
    playlistId: stripVL(playlistId),
    actions: tracks.map((t) => ({ action: 'ACTION_REMOVE_VIDEO', removedVideoId: t.videoId, setVideoId: t.setVideoId })),
  });

export const renamePlaylist = (playlistId: string, name: string, description?: string) =>
  api('browse/edit_playlist', {
    playlistId: stripVL(playlistId),
    actions: [
      { action: 'ACTION_SET_PLAYLIST_NAME', playlistName: name },
      ...(description !== undefined ? [{ action: 'ACTION_SET_PLAYLIST_DESCRIPTION', playlistDescription: description }] : []),
    ],
  });

export const deletePlaylist = (playlistId: string) => api('playlist/delete', { playlistId: stripVL(playlistId) });

// ── 가사 ───────────────────────────────────────────────────────────────────

export async function ytLyrics(videoId: string) {
  const next = await api('next', { videoId, isAudioOnly: true });
  const id = lyricsBrowseId(next);
  if (!id) return undefined;
  return parseLyrics(await api('browse', { browseId: id }));
}

// ── 재생 ───────────────────────────────────────────────────────────────────

/** YouTube Music 화면과 같은 방식으로 재생을 시작한다(대기열·자동 재생은 YouTube Music이 관리). */
export const play = (endpoint: Endpoint) => engineCall('play', { endpoint: cleanEndpoint(endpoint) });

/**
 * 곡 하나 재생. 앨범·플레이리스트 맥락(playlistId)이 있으면 그 목록 안에서, 없으면 그 곡의 믹스(RDAMVM…)로 시작한다.
 * 맨 videoId만 보내면 YouTube Music이 지난 세션 대기열 중간에 끼워 넣어 "현재 곡"이 엇갈렸다(2026-10-14 시험).
 */
export function playTrack(track: Track) {
  const watch = (track.play as { watchEndpoint?: Record<string, unknown> }).watchEndpoint;
  if (watch?.playlistId) return play(track.play);
  return play({ watchEndpoint: { ...(watch ?? {}), videoId: track.videoId, playlistId: `RDAMVM${track.videoId}`, params: 'wAEB' } });
}
export const playPlaylist = (playlistId: string, shuffle = false) =>
  play({ watchPlaylistEndpoint: shuffle ? { playlistId, params: 'wAEB8gECKAE%3D' } : { playlistId } });
/** 아티스트·곡 믹스(라디오) */
export const playRadio = (videoId: string) => play({ watchEndpoint: { videoId, playlistId: `RDAMVM${videoId}`, params: 'wAEB' } });

export const queueAdd = (target: { videoId?: string; videoIds?: string[]; playlistId?: string }, position: 'next' | 'end') =>
  engineCall('queueAdd', { ...target, position });

export const queue = async () => parseQueue(await engineCall<unknown>('queue'));
export const queueJump = (index: number) => engineCall('queueJump', { index });

export type ControlCommand =
  | 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seek' | 'seekBy'
  | 'volume' | 'mute' | 'unmute' | 'repeat' | 'shuffle' | 'like' | 'dislike';
export const control = (command: ControlCommand, value?: number) => engineCall('control', { command, value });

/** 클릭 추적값은 빼고 보낸다(commandMetadata는 YouTube Music이 화면 주소를 정할 때 쓰므로 남긴다). */
function cleanEndpoint(endpoint: Endpoint): Endpoint {
  const out: Endpoint = {};
  for (const [key, value] of Object.entries(endpoint)) {
    if (key !== 'clickTrackingParams') out[key] = value;
  }
  return out;
}
