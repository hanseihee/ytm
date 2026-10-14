// YouTube Music 기능 모음. 요청은 숨은 엔진 창(로그인된 music.youtube.com) 안에서 나간다.
import { engineCall } from '../tauri';
import {
  parseAccount,
  parseAddToPlaylist,
  parseComments,
  parseMoods,
  parseWatchTabs,
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
} from './parse';
import type { Continuation, Endpoint, Track, WatchTabs } from './types';

type Json = Record<string, unknown>;

/** 읽기만 하는 요청(같은 요청을 다시 보내도 계정이 바뀌지 않는 것) */
const READ_ONLY = new Set(['browse', 'next', 'search', 'music/get_search_suggestions', 'account/account_menu', 'music/get_queue', 'playlist/get_add_to_playlist']);

async function api<T = Json>(endpoint: string, body: Json = {}, query: Json = {}): Promise<T> {
  try {
    return await engineCall<T>('api', { endpoint, body, query });
  } catch (err) {
    // 앱을 켠 직후 엔진 안에서 세 번 다시 보내고도 400이 나는 일이 가끔 있었다(2026-10-14 홈 화면).
    // 읽기 요청만 조금 더 기다렸다 한 번 더 보낸다.
    if (!READ_ONLY.has(endpoint) || !String(err).startsWith('http_400')) throw err;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return engineCall<T>('api', { endpoint, body, query });
  }
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
/** 내 재생목록 아래 "추천" 곡 같은 덧붙는 묶음 */
export const playlistSections = async (c: Continuation) => parseContinuationItems(await continueBrowse('browse', c)).shelves;

// ── 둘러보기(분위기·장르, 최신 음악, YouTube Music 차트) ─────────────────────

export const moods = async () => parseMoods(await api('browse', { browseId: 'FEmusic_moods_and_genres' }));
export const moodCategory = async (params: string) =>
  parseBrowseGeneric(await api('browse', { browseId: 'FEmusic_moods_and_genres_category', params }));
export const newReleases = async () => parseBrowseGeneric(await api('browse', { browseId: 'FEmusic_new_releases' }));
/** country: ISO 나라 코드(KR, US …), 전 세계는 ZZ. 고르지 않으면 계정 위치를 따른다(페루로 잡히기도 했다, 2026-10-14). */
export const ytmCharts = async (country = 'KR') =>
  parseBrowseGeneric(await api('browse', { browseId: 'FEmusic_charts', formData: { selectedValues: [country] } }));

// ── 보관함 더 보기(최근 재생·앨범·아티스트·구독) ───────────────────────────

export const history = async () => parseBrowseGeneric(await api('browse', { browseId: 'FEmusic_history' }));
export const libraryAlbums = async () => parseBrowseGeneric(await api('browse', { browseId: 'FEmusic_liked_albums' }));
/** 보관함 곡의 아티스트 */
export const libraryArtists = async () => parseBrowseGeneric(await api('browse', { browseId: 'FEmusic_library_corpus_track_artists' }));
/** 구독한 아티스트 */
export const librarySubscriptions = async () => parseBrowseGeneric(await api('browse', { browseId: 'FEmusic_library_corpus_artists' }));
export const libraryMore = async (c: Continuation) => parseContinuationItems(await continueBrowse('browse', c));

/** 아티스트 구독 / 취소(channelId: UC…) */
export const setSubscribed = (channelId: string, subscribed: boolean, params?: string) =>
  api(subscribed ? 'subscription/subscribe' : 'subscription/unsubscribe', { channelIds: [channelId], ...(subscribed && params ? { params } : {}) });

// ── 지금 곡의 탭(가사·관련 항목·댓글) ────────────────────────────────────────

/** next 응답은 곡마다 한 번만 받아 가사·관련 항목·댓글이 같이 쓴다. */
const watchTabsCache = new Map<string, Promise<WatchTabs>>();
export function watchTabs(videoId: string): Promise<WatchTabs> {
  let hit = watchTabsCache.get(videoId);
  if (!hit) {
    hit = api('next', { videoId, isAudioOnly: true }).then(parseWatchTabs);
    hit.catch(() => watchTabsCache.delete(videoId));
    watchTabsCache.set(videoId, hit);
    if (watchTabsCache.size > 30) watchTabsCache.delete(watchTabsCache.keys().next().value!);
  }
  return hit;
}

/** 관련 항목(추천 곡·재생목록·비슷한 아티스트…). 없으면 빈 목록. */
export async function related(videoId: string) {
  const { relatedBrowseId } = await watchTabs(videoId);
  if (!relatedBrowseId) return { title: '', shelves: [] };
  return parseBrowseGeneric(await api('browse', { browseId: relatedBrowseId }));
}

/** 댓글 첫 쪽. 댓글을 막은 곡이면 빈 목록. */
export async function comments(videoId: string) {
  const { commentsToken } = await watchTabs(videoId);
  if (!commentsToken) return { comments: [] };
  return parseComments(await api('next', { continuation: commentsToken }));
}
export const commentsMore = async (token: string) => parseComments(await api('next', { continuation: token }));
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

/** 재생목록 안에서 곡 자리 옮기기: setVideoId 곡을 beforeSetVideoId 곡 앞으로(없으면 맨 끝으로) */
export const movePlaylistItem = (playlistId: string, setVideoId: string, beforeSetVideoId?: string) =>
  api('browse/edit_playlist', {
    playlistId: stripVL(playlistId),
    actions: [{ action: 'ACTION_MOVE_VIDEO_BEFORE', setVideoId, ...(beforeSetVideoId ? { movedSetVideoIdSuccessor: beforeSetVideoId } : {}) }],
  });

// ── 가사 ───────────────────────────────────────────────────────────────────

export async function ytLyrics(videoId: string) {
  const id = (await watchTabs(videoId)).lyricsBrowseId;
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

/** 노래(음원)↔영상(뮤직비디오) 전환. 짝 버전이 없으면 no_counterpart. 바뀐 재생 상태를 돌려준다. */
export const avSwitch = (video: boolean) => engineCall('avSwitch', { video });
/**
 * 엔진 화면을 영상만 보이게(앱이 영상 창·지금 재생 화면에 띄울 때). pip: 화면 속 화면 단추.
 * layout: fill(가득) · window(데스크톱 영상 창) · card(iOS 지금 재생), inset: 좌우 여백(너비 비율), colors: 영상 색 알림
 */
export const videoView = (on: boolean, pip = false, opts: { layout?: 'fill' | 'window' | 'card'; inset?: number; colors?: boolean } = {}) =>
  engineCall('videoView', { on, pip, ...opts });

/** 클릭 추적값은 빼고 보낸다(commandMetadata는 YouTube Music이 화면 주소를 정할 때 쓰므로 남긴다). */
function cleanEndpoint(endpoint: Endpoint): Endpoint {
  const out: Endpoint = {};
  for (const [key, value] of Object.entries(endpoint)) {
    if (key !== 'clickTrackingParams') out[key] = value;
  }
  return out;
}
