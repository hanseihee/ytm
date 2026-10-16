// iOS 앱의 데이터 묶음(JavaScriptCore). 화면은 SwiftUI가 그리고, YouTube Music 응답 해석·Spotify 짝짓기·
// 가사 찾기는 데스크톱과 같은 코드(src/lib)를 그대로 돌려 결과를 맞춘다.
// 앱은 __coreCall(id, 이름, 인자 JSON 배열)로 부르고, 결과는 __native.done으로 JSON을 받는다.
import './polyfills';
import { setLang } from '../../i18n';
import { loadLyrics, lyricsOffset, setLyricsOffset } from '../../lib/lyrics';
import { clearPlays, flushPlays, recordState, statsSummary } from '../../lib/stats';
import * as spotify from '../../lib/spotify';
import * as ytm from '../../lib/ytm/client';
import { native } from './native';

const api: Record<string, (...args: never[]) => unknown> = {
  // 언어(앱이 정한 언어: 'ko'·'en'·'ja'·'zh-CN'·'zh-TW'·'es'·'pt-BR'·'fr'·'de'·'id')
  setLanguage: (lang: string) => setLang(lang),
  // 둘러보기
  home: ytm.home,
  homeMore: ytm.homeMore,
  search: ytm.search,
  searchMore: ytm.searchMore,
  suggestions: ytm.suggestions,
  album: ytm.album,
  playlist: ytm.playlist,
  playlistMore: ytm.playlistMore,
  artist: ytm.artist,
  browse: ytm.browse,
  // 둘러보기
  moods: ytm.moods,
  moodCategory: ytm.moodCategory,
  newReleases: ytm.newReleases,
  ytmCharts: ytm.ytmCharts,
  // 보관함
  likedSongs: ytm.likedSongs,
  libraryPlaylists: ytm.libraryPlaylists,
  account: ytm.account,
  setTrackLiked: ytm.setTrackLiked,
  setCollectionSaved: ytm.setCollectionSaved,
  addToPlaylistOptions: ytm.addToPlaylistOptions,
  createPlaylist: ytm.createPlaylist,
  addToPlaylist: ytm.addToPlaylist,
  removeFromPlaylist: ytm.removeFromPlaylist,
  renamePlaylist: ytm.renamePlaylist,
  deletePlaylist: ytm.deletePlaylist,
  movePlaylistItem: ytm.movePlaylistItem,
  playlistSections: ytm.playlistSections,
  history: ytm.history,
  libraryAlbums: ytm.libraryAlbums,
  libraryArtists: ytm.libraryArtists,
  librarySubscriptions: ytm.librarySubscriptions,
  libraryMore: ytm.libraryMore,
  setSubscribed: ytm.setSubscribed,
  // 재생
  play: ytm.play,
  playTrack: ytm.playTrack,
  playPlaylist: ytm.playPlaylist,
  playRadio: ytm.playRadio,
  queueAdd: ytm.queueAdd,
  queue: ytm.queue,
  queueJump: ytm.queueJump,
  control: ytm.control,
  avSwitch: ytm.avSwitch,
  videoView: ytm.videoView,
  // 지금 곡 탭
  related: ytm.related,
  comments: ytm.comments,
  commentsMore: ytm.commentsMore,
  // 청취 통계(이 기기)
  recordState,
  flushPlays,
  statsSummary,
  clearPlays,
  // 가사
  lyrics: loadLyrics,
  lyricsOffset,
  setLyricsOffset,
  // 차트(멜론·지니·Spotify·빌보드 등)
  charts: () => spotify.localizedCharts(),
  chartGroups: () => spotify.localizedChartGroups(),
  chartKind: spotify.chartKind,
  spotifyPlaylist: spotify.fetchPlaylist,
  matchTrack: spotify.matchTrack,
  playlistIdFrom: (input: string) => spotify.playlistIdFrom(input) ?? null,
  savedPlaylistId: (id: string) => spotify.savedPlaylistId(id) ?? null,
  isSynced: spotify.isSynced,
  chartTitle: spotify.chartTitle,
  todayLabel: spotify.todayLabel,
  playInChartOrder: spotify.playInChartOrder,
  syncToYouTubeMusic: (p: spotify.SpotifyPlaylist, tracks: never[]) => spotify.syncToYouTubeMusic(p, tracks, 'Garak'),
  describeSpotifyError: spotify.describeSpotifyError,
};

(globalThis as unknown as { __coreCall: (id: number, name: string, argsJSON: string) => void }).__coreCall = (id, name, argsJSON) => {
  Promise.resolve()
    .then(() => {
      const fn = api[name] as ((...args: unknown[]) => unknown) | undefined;
      if (!fn) throw new Error(`unknown_core ${name}`);
      return fn(...(JSON.parse(argsJSON) as unknown[]));
    })
    .then(
      (value) => native.done(id, true, JSON.stringify(value === undefined ? null : value)),
      (err: unknown) => native.done(id, false, typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)),
    );
};
