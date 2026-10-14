// InnerTube(WEB_REMIX) 응답 → 앱 데이터.
// 원본은 렌더러가 깊게 중첩된 JSON이고 계정·지역·실험 설정에 따라 모양이 조금씩 달라서,
// 정해진 경로를 하나만 믿지 않고 알려진 형태를 차례로 찾아본다.
// (2026-10-14 로그인 전 한국 지역 응답 + 로그인 후 응답으로 확인)

import type {
  Account,
  ArtistPage,
  Card,
  CardKind,
  Collection,
  CollectionHeader,
  Continuation,
  Endpoint,
  HomePage,
  LyricsData,
  MoreLink,
  PlaylistOption,
  QueueItem,
  Ref,
  SearchChip,
  SearchResult,
  Shelf,
  Suggestions,
  TopResult,
  Track,
  Comment,
  CommentsPage,
  MoodItem,
  MoodsPage,
  WatchTabs,
} from './types';

// 원본 JSON은 형태가 고정되지 않아 여기서만 느슨한 타입을 쓴다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

// ── 기본 도구 ──────────────────────────────────────────────────────────────

export function text(t: Raw): string {
  if (!t) return '';
  if (typeof t === 'string') return t;
  if (typeof t.simpleText === 'string') return t.simpleText;
  if (Array.isArray(t.runs)) return t.runs.map((r: Raw) => r?.text ?? '').join('');
  if (typeof t.content === 'string') return t.content;
  return '';
}

const runs = (t: Raw): Raw[] => (Array.isArray(t?.runs) ? t.runs : []);

/** 객체의 첫 번째(유일한) 키 이름과 값. 렌더러 묶음 `{ musicShelfRenderer: {...} }`를 풀 때 쓴다. */
function only(o: Raw): [string, Raw] {
  if (!o || typeof o !== 'object') return ['', undefined];
  const key = Object.keys(o).find((k) => k !== 'trackingParams') ?? '';
  return [key, o[key]];
}

/** 깊이 우선으로 key를 가진 첫 값을 찾는다(경로가 바뀌어도 버티기 위한 마지막 수단). */
export function findKey(o: Raw, key: string, depth = 12): Raw {
  if (!o || typeof o !== 'object' || depth < 0) return undefined;
  if (key in o) return o[key];
  for (const v of Object.values(o)) {
    const found = findKey(v, key, depth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function findAll(o: Raw, key: string, out: Raw[] = [], depth = 16): Raw[] {
  if (!o || typeof o !== 'object' || depth < 0) return out;
  if (Array.isArray(o)) {
    for (const v of o) findAll(v, key, out, depth - 1);
    return out;
  }
  for (const [k, v] of Object.entries(o)) {
    if (k === key) out.push(v);
    findAll(v, key, out, depth - 1);
  }
  return out;
}

const SEP = /^\s*[•·]\s*$/;

/** "3:45" "1:02:03" → 초 */
export function parseDuration(value: string | undefined): number | undefined {
  if (!value || !/^\d+(:\d{1,2}){1,2}$/.test(value.trim())) return undefined;
  return value.trim().split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** 썸네일 목록에서 가장 큰 것을 골라 원하는 크기로 바꾼다. */
export function thumbnail(o: Raw, size = 544): string | undefined {
  const list: Raw[] =
    o?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    o?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ??
    o?.thumbnail?.thumbnails ??
    o?.thumbnails ??
    findKey(o, 'thumbnails') ??
    [];
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const best = [...list].sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0))[0];
  return best?.url ? resizeThumb(best.url, size) : undefined;
}

/** googleusercontent 이미지 주소의 크기 표시(=w60-h60, =s120)를 바꾼다. i.ytimg.com은 그대로. */
export function resizeThumb(url: string, size: number): string {
  if (!/googleusercontent\.com|ggpht\.com/.test(url)) return url;
  if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
  if (/=s\d+/.test(url)) return url.replace(/=s\d+/, `=s${size}`);
  return url;
}

function pageType(endpoint: Raw): string {
  return (
    endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ?? ''
  );
}

function kindFromPageType(type: string, label = ''): CardKind {
  switch (type) {
    case 'MUSIC_PAGE_TYPE_ALBUM':
    case 'MUSIC_PAGE_TYPE_AUDIOBOOK':
      if (/^(싱글|Single)/i.test(label)) return 'single';
      if (/^EP\b/i.test(label)) return 'ep';
      return 'album';
    case 'MUSIC_PAGE_TYPE_PLAYLIST':
      return 'playlist';
    case 'MUSIC_PAGE_TYPE_ARTIST':
    case 'MUSIC_PAGE_TYPE_LIBRARY_ARTIST':
      return 'artist';
    case 'MUSIC_PAGE_TYPE_USER_CHANNEL':
      return 'profile';
    case 'MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE':
      return 'podcast';
    case 'MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_TRACK_PAGE':
      return 'episode';
    default:
      return 'other';
  }
}

/** 검색·목록에서 맨 앞에 붙는 종류 표시. 아티스트 이름으로 착각하지 않도록 걸러낸다. */
const TYPE_LABELS = new Set([
  '노래', '동영상', '앨범', '싱글', 'EP', '재생목록', '아티스트', '에피소드', '팟캐스트', '프로필',
  'Song', 'Video', 'Album', 'Single', 'Playlist', 'Artist', 'Episode', 'Podcast', 'Profile',
]);

const watchOf = (endpoint: Raw): Raw => endpoint?.watchEndpoint;

function musicVideoType(endpoint: Raw): string {
  return (
    endpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType ?? ''
  );
}

function overlayEndpoint(r: Raw): Raw {
  const overlay = r?.overlay ?? r?.thumbnailOverlay;
  return overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
}

function moreFrom(endpoint: Raw, title?: string): MoreLink | undefined {
  const b = endpoint?.browseEndpoint;
  return b?.browseId ? { browseId: b.browseId, params: b.params, title } : undefined;
}

/** 원본의 런 목록에서 아티스트·앨범 링크를 골라낸다. */
function refsFromRuns(list: Raw[]): { artists: Ref[]; album?: Ref; others: string[] } {
  const artists: Ref[] = [];
  let album: Ref | undefined;
  const others: string[] = [];
  for (const run of list) {
    const value = String(run?.text ?? '');
    if (!value || SEP.test(value)) continue;
    const type = pageType(run?.navigationEndpoint);
    const id = run?.navigationEndpoint?.browseEndpoint?.browseId;
    if (type === 'MUSIC_PAGE_TYPE_ARTIST' || type === 'MUSIC_PAGE_TYPE_USER_CHANNEL' || type === 'MUSIC_PAGE_TYPE_LIBRARY_ARTIST') {
      artists.push({ name: value, id });
    } else if (type === 'MUSIC_PAGE_TYPE_ALBUM') {
      album = { name: value, id };
    } else {
      others.push(value);
    }
  }
  return { artists, album, others };
}

/** 링크 없는 "아이유, 박명수" 같은 줄을 아티스트 목록으로. */
function plainArtists(value: string): Ref[] {
  return value
    .split(/\s*(?:,|&| 및 )\s*/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

// ── 곡·카드 ────────────────────────────────────────────────────────────────

/** musicResponsiveListItemRenderer → 곡 또는 카드 */
export function parseListItem(r: Raw, fallback?: Partial<Track>): { track?: Track; card?: Card } {
  if (!r) return {};
  const columns: Raw[] = (r.flexColumns ?? []).map(
    (c: Raw) => c?.musicResponsiveListItemFlexColumnRenderer?.text ?? c?.musicResponsiveListItemFixedColumnRenderer?.text,
  );
  const fixed: Raw[] = (r.fixedColumns ?? []).map((c: Raw) => c?.musicResponsiveListItemFixedColumnRenderer?.text);
  const title = text(columns[0]);
  const nav = r.navigationEndpoint;
  const overlay = overlayEndpoint(r);
  const titleNav = runs(columns[0])[0]?.navigationEndpoint;
  const videoId: string | undefined =
    r.playlistItemData?.videoId ?? watchOf(overlay)?.videoId ?? watchOf(titleNav)?.videoId ?? watchOf(nav)?.videoId;

  // 앨범·플레이리스트·아티스트 줄(검색 결과 등)
  if (nav?.browseEndpoint && !r.playlistItemData) {
    const subtitleRuns = columns.slice(1).flatMap((c) => runs(c));
    const subtitle = subtitleRuns.map((x) => x?.text ?? '').join('');
    const firstLabel = String(subtitleRuns[0]?.text ?? '');
    const kind = kindFromPageType(pageType(nav), firstLabel);
    return {
      card: {
        kind,
        title,
        subtitle,
        thumbnail: thumbnail(r.thumbnail, kind === 'artist' ? 400 : 400),
        browseId: nav.browseEndpoint.browseId,
        params: nav.browseEndpoint.params,
        play: overlay,
        playlistId: overlay?.watchPlaylistEndpoint?.playlistId,
      },
    };
  }
  if (!videoId) return {};

  const restRuns = columns.slice(1).flatMap((c) => runs(c));
  const { artists, album, others } = refsFromRuns(restRuns);
  // 링크 없는 아티스트: 두 번째 칸(종류 표시는 건너뜀)
  let names = artists;
  if (names.length === 0) {
    const second = runs(columns[1]).map((x: Raw) => String(x?.text ?? '')).filter((v: string) => v && !SEP.test(v));
    const candidate = second.find((v: string) => !TYPE_LABELS.has(v) && !parseDuration(v) && !/^조회수|회$|^\d+(\.\d+)?[만천억]?회?$/.test(v));
    if (candidate) names = plainArtists(candidate);
  }
  const isCount = (v: string) => /(회|회 재생|재생)$|plays?$|views?$/i.test(v);
  let albumRef = album;
  let countText: string | undefined;
  if (!albumRef && columns.length >= 3) {
    const third = text(columns[2]);
    // 검색 결과의 세 번째 칸은 앨범이 아니라 재생 수("383만회 재생")일 때가 있다.
    if (third && isCount(third)) countText = third;
    else if (third && !parseDuration(third)) albumRef = { name: third };
  }
  const durationText = text(fixed[0]) || others.find((v) => parseDuration(v)) || '';
  const extra = countText ?? others.find(isCount);
  const videoType = musicVideoType(overlay) || musicVideoType(titleNav) || musicVideoType(nav);
  const indexText = text(r.index);

  return {
    track: {
      videoId,
      title: title || fallback?.title || '',
      artists: names.length ? names : (fallback?.artists ?? []),
      album: albumRef ?? fallback?.album,
      duration: parseDuration(durationText) ?? fallback?.duration,
      thumbnail: thumbnail(r.thumbnail, 226) ?? fallback?.thumbnail,
      setVideoId: r.playlistItemData?.playlistSetVideoId,
      play: (watchOf(overlay) ? overlay : undefined) ?? (watchOf(titleNav) ? titleNav : undefined) ?? { watchEndpoint: { videoId } },
      isVideo: videoType ? videoType !== 'MUSIC_VIDEO_TYPE_ATV' : false,
      available: r.musicItemRendererDisplayPolicy !== 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT',
      index: indexText ? Number(indexText) || undefined : undefined,
      extra,
    },
  };
}

/** musicTwoRowItemRenderer → 카드 */
export function parseTwoRow(r: Raw): Card | undefined {
  if (!r) return undefined;
  const nav = r.navigationEndpoint;
  const title = text(r.title);
  const subtitle = text(r.subtitle);
  const play = r.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
  if (nav?.browseEndpoint) {
    const kind = kindFromPageType(pageType(nav), String(runs(r.subtitle)[0]?.text ?? ''));
    return {
      kind,
      title,
      subtitle,
      thumbnail: thumbnail(r.thumbnailRenderer, 400),
      browseId: nav.browseEndpoint.browseId,
      params: nav.browseEndpoint.params,
      play,
      playlistId: play?.watchPlaylistEndpoint?.playlistId,
    };
  }
  const watch = watchOf(nav);
  if (watch?.videoId) {
    const type = musicVideoType(nav);
    return {
      kind: type && type !== 'MUSIC_VIDEO_TYPE_ATV' ? 'video' : 'song',
      title,
      subtitle,
      thumbnail: thumbnail(r.thumbnailRenderer, 400),
      videoId: watch.videoId,
      play: nav,
    };
  }
  if (nav?.watchPlaylistEndpoint) {
    return { kind: 'playlist', title, subtitle, thumbnail: thumbnail(r.thumbnailRenderer, 400), play: nav, playlistId: nav.watchPlaylistEndpoint.playlistId };
  }
  return undefined;
}

/** 대기열·다음 곡 목록의 playlistPanelVideoRenderer → 곡 */
export function parsePanelVideo(r: Raw): Track | undefined {
  if (!r?.videoId) return undefined;
  const byline = runs(r.longBylineText).length ? runs(r.longBylineText) : runs(r.shortBylineText);
  const { artists, album, others } = refsFromRuns(byline);
  return {
    videoId: r.videoId,
    title: text(r.title),
    artists: artists.length ? artists : others[0] ? plainArtists(others[0]) : [],
    album,
    duration: parseDuration(text(r.lengthText)),
    thumbnail: thumbnail(r.thumbnail, 226),
    play: r.navigationEndpoint ?? { watchEndpoint: { videoId: r.videoId } },
    isVideo: (musicVideoType(r.navigationEndpoint) || 'MUSIC_VIDEO_TYPE_ATV') !== 'MUSIC_VIDEO_TYPE_ATV',
    available: true,
  };
}

function itemsOf(contents: Raw[], fallback?: Partial<Track>): { tracks: Track[]; cards: Card[] } {
  const tracks: Track[] = [];
  const cards: Card[] = [];
  for (const item of contents ?? []) {
    const [kind, r] = only(item);
    if (kind === 'musicResponsiveListItemRenderer') {
      const parsed = parseListItem(r, fallback);
      if (parsed.track) tracks.push(parsed.track);
      if (parsed.card) cards.push(parsed.card);
    } else if (kind === 'musicTwoRowItemRenderer') {
      const card = parseTwoRow(r);
      if (card) cards.push(card);
    } else if (kind === 'playlistPanelVideoRenderer') {
      const track = parsePanelVideo(r);
      if (track) tracks.push(track);
    } else if (kind === 'playlistPanelVideoWrapperRenderer') {
      const track = parsePanelVideo(r?.primaryRenderer?.playlistPanelVideoRenderer);
      if (track) tracks.push(track);
    }
  }
  return { tracks, cards };
}

// ── 이어받기 ───────────────────────────────────────────────────────────────

export function continuationOf(o: Raw): Continuation | undefined {
  const next = o?.continuations?.[0]?.nextContinuationData?.continuation;
  if (next) return { token: next, style: 'query' };
  const items: Raw[] = o?.contents ?? o?.items ?? [];
  const last = items[items.length - 1];
  const token = last?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
  if (token) return { token, style: 'body' };
  return undefined;
}

/** 이어받기 응답에서 새 항목과 다음 이어받기 값을 꺼낸다. */
export function parseContinuationItems(resp: Raw, fallback?: Partial<Track>): { tracks: Track[]; cards: Card[]; shelves: Shelf[]; continuation?: Continuation } {
  const cc = resp?.continuationContents;
  if (cc) {
    const [kind, body] = only(cc);
    if (kind === 'sectionListContinuation') {
      return { tracks: [], cards: [], shelves: parseSections(body.contents ?? []), continuation: continuationOf(body) };
    }
    const { tracks, cards } = itemsOf(body?.contents ?? body?.items ?? [], fallback);
    return { tracks, cards, shelves: [], continuation: continuationOf(body) };
  }
  const actions: Raw[] = resp?.onResponseReceivedActions ?? resp?.onResponseReceivedCommands ?? [];
  const items: Raw[] = actions.flatMap(
    (a: Raw) => a?.appendContinuationItemsAction?.continuationItems ?? a?.reloadContinuationItemsCommand?.continuationItems ?? [],
  );
  const { tracks, cards } = itemsOf(items, fallback);
  const shelves = parseSections(items.filter((i: Raw) => !i.musicResponsiveListItemRenderer && !i.musicTwoRowItemRenderer));
  return { tracks, cards, shelves, continuation: continuationOf({ contents: items }) };
}

// ── 묶음(Shelf) ────────────────────────────────────────────────────────────

export function parseSections(contents: Raw[]): Shelf[] {
  const shelves: Shelf[] = [];
  let loose: Shelf | undefined; // 제목 없는 itemSectionRenderer를 하나로 모은다
  for (const section of contents ?? []) {
    const [kind, r] = only(section);
    if (kind === 'musicShelfRenderer') {
      const { tracks, cards } = itemsOf(r.contents);
      const headerTitle = text(r.title) || text(r.header?.musicShelfHeaderRenderer?.title);
      shelves.push({
        title: headerTitle,
        tracks,
        cards,
        more: moreFrom(r.bottomEndpoint ?? runs(r.title)[0]?.navigationEndpoint, text(r.bottomText)),
        continuation: continuationOf(r),
      });
    } else if (kind === 'musicCarouselShelfRenderer') {
      const header = r.header?.musicCarouselShelfBasicHeaderRenderer ?? r.header?.musicImmersiveCarouselShelfBasicHeaderRenderer;
      const { tracks, cards } = itemsOf(r.contents);
      shelves.push({
        title: text(header?.title),
        tracks,
        cards,
        more: moreFrom(
          header?.moreContentButton?.buttonRenderer?.navigationEndpoint ?? runs(header?.title)[0]?.navigationEndpoint,
          text(header?.title),
        ),
      });
    } else if (kind === 'musicPlaylistShelfRenderer') {
      const { tracks, cards } = itemsOf(r.contents);
      shelves.push({ title: '', tracks, cards, continuation: continuationOf(r) });
    } else if (kind === 'gridRenderer') {
      const { tracks, cards } = itemsOf(r.items);
      shelves.push({ title: text(r.header?.gridHeaderRenderer?.title), tracks, cards, continuation: continuationOf(r) });
    } else if (kind === 'itemSectionRenderer') {
      const { tracks, cards } = itemsOf(r.contents);
      if (!loose) {
        loose = { title: '', tracks: [], cards: [] };
        shelves.push(loose);
      }
      loose.tracks.push(...tracks);
      loose.cards.push(...cards);
      // 안에 묶음이 또 들어 있는 경우
      const inner = parseSections((r.contents ?? []).filter((c: Raw) => !c.musicResponsiveListItemRenderer && !c.musicTwoRowItemRenderer));
      shelves.push(...inner.filter((s) => s.tracks.length || s.cards.length));
    }
  }
  return shelves.filter((s) => s.tracks.length > 0 || s.cards.length > 0);
}

function sectionListOf(resp: Raw): Raw {
  const tabs: Raw[] =
    resp?.contents?.singleColumnBrowseResultsRenderer?.tabs ??
    resp?.contents?.tabbedSearchResultsRenderer?.tabs ??
    resp?.contents?.twoColumnBrowseResultsRenderer?.tabs ??
    [];
  const tab = tabs.find((t: Raw) => t?.tabRenderer?.selected) ?? tabs[0];
  return tab?.tabRenderer?.content?.sectionListRenderer ?? resp?.contents?.sectionListRenderer;
}

// ── 검색 ───────────────────────────────────────────────────────────────────

function parseTopCard(r: Raw): TopResult | undefined {
  if (!r) return undefined;
  const titleRun = runs(r.title)[0];
  const nav = titleRun?.navigationEndpoint ?? r.onTap;
  const subtitle = text(r.subtitle);
  const { tracks } = itemsOf(r.contents ?? []);
  const thumb = thumbnail(r.thumbnail, 544);
  if (nav?.browseEndpoint) {
    const firstLabel = String(runs(r.subtitle)[0]?.text ?? '');
    return {
      card: {
        kind: kindFromPageType(pageType(nav), firstLabel),
        title: text(r.title),
        subtitle,
        thumbnail: thumb,
        browseId: nav.browseEndpoint.browseId,
        params: nav.browseEndpoint.params,
      },
      tracks,
    };
  }
  const watch = watchOf(nav);
  if (watch?.videoId) {
    const { artists, album } = refsFromRuns(runs(r.subtitle));
    return {
      track: {
        videoId: watch.videoId,
        title: text(r.title),
        artists,
        album,
        thumbnail: thumb,
        play: nav,
        isVideo: (musicVideoType(nav) || 'MUSIC_VIDEO_TYPE_ATV') !== 'MUSIC_VIDEO_TYPE_ATV',
        available: true,
      },
      tracks,
    };
  }
  return tracks.length ? { tracks } : undefined;
}

export function parseSearch(resp: Raw): SearchResult {
  const list = sectionListOf(resp);
  const chipsRaw: Raw[] = list?.header?.chipCloudRenderer?.chips ?? [];
  const chips: SearchChip[] = chipsRaw.map((c: Raw) => {
    const r = c.chipCloudChipRenderer ?? {};
    return {
      label: text(r.text),
      params: r.navigationEndpoint?.searchEndpoint?.params ?? r.onDeselectedCommand?.searchEndpoint?.params,
      selected: !!r.isSelected,
    };
  }).filter((c) => c.label);
  const contents: Raw[] = list?.contents ?? [];
  const topRaw = contents.find((c: Raw) => c.musicCardShelfRenderer)?.musicCardShelfRenderer;
  const top = parseTopCard(topRaw);
  const shelves = parseSections(contents.filter((c: Raw) => !c.musicCardShelfRenderer));
  return { chips, top, shelves };
}

export function parseSuggestions(resp: Raw): Suggestions {
  const queries: string[] = [];
  const tracks: Track[] = [];
  const cards: Card[] = [];
  for (const section of resp?.contents ?? []) {
    for (const item of section?.searchSuggestionsSectionRenderer?.contents ?? []) {
      const [kind, r] = only(item);
      if (kind === 'searchSuggestionRenderer' || kind === 'historySuggestionRenderer') {
        const q = r?.navigationEndpoint?.searchEndpoint?.query ?? text(r?.suggestion);
        if (q) queries.push(q);
      } else if (kind === 'musicResponsiveListItemRenderer') {
        const parsed = parseListItem(r);
        if (parsed.track) tracks.push(parsed.track);
        if (parsed.card) cards.push(parsed.card);
      }
    }
  }
  return { queries, tracks, cards };
}

// ── 홈·탐색 ────────────────────────────────────────────────────────────────

export function parseHome(resp: Raw): HomePage {
  const list = sectionListOf(resp);
  return { shelves: parseSections(list?.contents ?? []), continuation: continuationOf(list) };
}

/** "더보기"로 여는 일반 탐색 화면(아티스트 음반 목록 등) */
export function parseBrowseGeneric(resp: Raw): { title: string; shelves: Shelf[]; continuation?: Continuation } {
  const list = sectionListOf(resp);
  const title = text(resp?.header?.musicHeaderRenderer?.title) || text(findKey(resp?.header, 'title'));
  return { title, shelves: parseSections(list?.contents ?? []), continuation: continuationOf(list) };
}

// ── 앨범·플레이리스트 ──────────────────────────────────────────────────────

function headerButtons(buttons: Raw[]): { play?: Endpoint; shuffle?: Endpoint; radio?: Endpoint; saved?: boolean; savePlaylistId?: string } {
  let play: Endpoint | undefined;
  let shuffle: Endpoint | undefined;
  let radio: Endpoint | undefined;
  let saved: boolean | undefined;
  let savePlaylistId: string | undefined;
  for (const button of buttons ?? []) {
    const [kind, r] = only(button);
    if (kind === 'musicPlayButtonRenderer') play = r.playNavigationEndpoint;
    if (kind === 'toggleButtonRenderer') {
      const icon = r.defaultIcon?.iconType ?? '';
      if (/BOOKMARK|LIBRARY_ADD|LIBRARY_SAVED/.test(icon)) {
        saved = !!r.isToggled;
        // 보관함 저장 단추가 가리키는 재생목록(앨범은 OLAK5uy_…)
        savePlaylistId = r.defaultServiceEndpoint?.likeEndpoint?.target?.playlistId ?? r.toggledServiceEndpoint?.likeEndpoint?.target?.playlistId;
      }
    }
    if (kind === 'menuRenderer') {
      for (const item of r.items ?? []) {
        const nav = item?.menuNavigationItemRenderer;
        const icon = nav?.icon?.iconType ?? '';
        if (icon === 'MUSIC_SHUFFLE') shuffle = nav.navigationEndpoint;
        if (icon === 'MIX') radio = nav.navigationEndpoint;
      }
    }
    if (kind === 'buttonRenderer') {
      const icon = r.icon?.iconType ?? '';
      if (icon === 'MUSIC_SHUFFLE') shuffle = r.navigationEndpoint;
      if (icon === 'MIX') radio = r.navigationEndpoint;
    }
  }
  return { play, shuffle, radio, saved, savePlaylistId };
}

function parseResponsiveHeader(h: Raw, kind: CardKind, editable: boolean): CollectionHeader {
  const subtitleRuns = runs(h.subtitle).map((r: Raw) => String(r?.text ?? '')).filter((v: string) => v && !SEP.test(v));
  const typeLabel = subtitleRuns[0] ?? '';
  const year = subtitleRuns.find((v: string) => /^\d{4}(년)?$/.test(v));
  const strapline = refsFromRuns(runs(h.straplineTextOne));
  const artists = strapline.artists.length ? strapline.artists : strapline.others.map((name) => ({ name }));
  const description =
    text(h.description?.musicDescriptionShelfRenderer?.description) || text(h.description);
  const buttons = headerButtons(h.buttons);
  // 앨범의 재생 단추는 watchEndpoint(첫 곡 + playlistId)라 watchPlaylistEndpoint만 보면 놓친다(2026-10-14 "Love poem").
  const endpointPlaylist = (e?: Endpoint) => ((e?.['watchPlaylistEndpoint'] ?? e?.['watchEndpoint']) as Raw | undefined)?.playlistId as string | undefined;
  const playlistId = endpointPlaylist(buttons.play) ?? buttons.savePlaylistId ?? endpointPlaylist(buttons.shuffle);
  return {
    kind: kind === 'album' ? kindFromPageType('MUSIC_PAGE_TYPE_ALBUM', typeLabel) : kind,
    title: text(h.title),
    typeLabel,
    year: year?.replace('년', ''),
    artists,
    stats: text(h.secondSubtitle),
    description: description || undefined,
    thumbnail: thumbnail(h.thumbnail, 544),
    play: buttons.play,
    shuffle: buttons.shuffle,
    radio: buttons.radio,
    playlistId,
    saved: buttons.saved,
    editable,
    author: artists[0],
  };
}

/** 앨범(MPREb_…) 화면 */
export function parseAlbum(resp: Raw, browseId?: string): Collection {
  const two = resp?.contents?.twoColumnBrowseResultsRenderer;
  let header: CollectionHeader | undefined;
  if (two) {
    const first = two.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
    const h = first?.musicResponsiveHeaderRenderer;
    if (h) header = parseResponsiveHeader(h, 'album', false);
  }
  if (!header) {
    // 옛 형태(musicDetailHeaderRenderer)
    const h = resp?.header?.musicDetailHeaderRenderer ?? {};
    const sub = refsFromRuns(runs(h.subtitle));
    header = {
      kind: 'album',
      title: text(h.title),
      typeLabel: sub.others[0] ?? '앨범',
      year: sub.others.find((v) => /^\d{4}$/.test(v)),
      artists: sub.artists,
      stats: text(h.secondSubtitle),
      description: text(h.description) || undefined,
      thumbnail: thumbnail(h.thumbnail, 544),
      editable: false,
    };
  }
  const secondary = two?.secondaryContents?.sectionListRenderer?.contents ?? sectionListOf(resp)?.contents ?? [];
  const fallback: Partial<Track> = {
    artists: header.artists,
    album: { name: header.title, id: browseId },
    thumbnail: header.thumbnail ? resizeThumb(header.thumbnail, 226) : undefined,
  };
  const trackShelf = secondary.find((c: Raw) => c.musicShelfRenderer)?.musicShelfRenderer;
  const { tracks } = itemsOf(trackShelf?.contents ?? [], fallback);
  // 앨범 곡은 썸네일·앨범 칸이 비어 있으므로 앨범 값으로 채운다.
  for (const t of tracks) {
    t.album = { name: header.title, id: browseId };
    t.thumbnail = t.thumbnail ?? fallback.thumbnail;
    if (!t.artists.length) t.artists = header.artists;
    const watch = (t.play as Raw).watchEndpoint;
    if (watch && !watch.playlistId && header.playlistId) watch.playlistId = header.playlistId;
  }
  const shelves = parseSections(secondary.filter((c: Raw) => !c.musicShelfRenderer));
  return { header, tracks, shelves, continuation: continuationOf(trackShelf) };
}

/** 플레이리스트(VL…) 화면 — 좋아요 표시한 곡(VLLM) 포함 */
export function parsePlaylist(resp: Raw): Collection {
  const two = resp?.contents?.twoColumnBrowseResultsRenderer;
  const headerSection = two?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0] ?? {};
  let header: CollectionHeader;
  const editableHeader = headerSection.musicEditablePlaylistDetailHeaderRenderer;
  const responsive = editableHeader?.header?.musicResponsiveHeaderRenderer ?? headerSection.musicResponsiveHeaderRenderer;
  if (responsive) {
    header = parseResponsiveHeader(responsive, 'playlist', !!editableHeader);
    const edit = editableHeader?.editHeader?.musicPlaylistEditHeaderRenderer;
    if (edit) header.privacy = edit.privacy;
  } else {
    const h = resp?.header?.musicDetailHeaderRenderer ?? resp?.header?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicDetailHeaderRenderer ?? {};
    header = {
      kind: 'playlist',
      title: text(h.title),
      typeLabel: '재생목록',
      artists: refsFromRuns(runs(h.subtitle)).artists,
      stats: text(h.secondSubtitle),
      description: text(h.description) || undefined,
      thumbnail: thumbnail(h.thumbnail, 544),
      editable: !!resp?.header?.musicEditablePlaylistDetailHeaderRenderer,
    };
  }
  const secondary = two?.secondaryContents?.sectionListRenderer?.contents ?? sectionListOf(resp)?.contents ?? [];
  const shelfRaw = secondary.find((c: Raw) => c.musicPlaylistShelfRenderer)?.musicPlaylistShelfRenderer ??
    secondary.find((c: Raw) => c.musicShelfRenderer)?.musicShelfRenderer;
  const { tracks } = itemsOf(shelfRaw?.contents ?? []);
  if (!header.playlistId && shelfRaw?.playlistId) header.playlistId = shelfRaw.playlistId;
  const shelves = parseSections(secondary.filter((c: Raw) => !c.musicPlaylistShelfRenderer && !c.musicShelfRenderer));
  // 곡 목록 이어받기(곡이 많을 때)와 따로, 묶음 목록 끝의 이어받기는 내 재생목록의 "추천" 곡 묶음을 준다(2026-10-14 확인).
  const sectionList = two?.secondaryContents?.sectionListRenderer ?? sectionListOf(resp);
  const sectionsContinuation = sectionList?.continuations?.[0]?.nextContinuationData?.continuation;
  return {
    header,
    tracks,
    shelves,
    continuation: continuationOf(shelfRaw),
    sectionsContinuation: sectionsContinuation ? { token: sectionsContinuation, style: 'query' } : undefined,
  };
}

// ── 아티스트 ───────────────────────────────────────────────────────────────

export function parseArtist(resp: Raw): ArtistPage {
  const [, h] = only(resp?.header ?? {});
  const sub = h?.subscriptionButton?.subscribeButtonRenderer;
  const shuffle = h?.playButton?.buttonRenderer?.navigationEndpoint;
  const radio = h?.startRadioButton?.buttonRenderer?.navigationEndpoint;
  const list = sectionListOf(resp);
  const shelves = parseSections(list?.contents ?? []);
  const descriptionShelf = (list?.contents ?? []).find((c: Raw) => c.musicDescriptionShelfRenderer)?.musicDescriptionShelfRenderer;
  return {
    name: text(h?.title),
    thumbnail: thumbnail(h?.thumbnail, 1200),
    description: text(h?.description) || text(descriptionShelf?.description) || undefined,
    subscribers: text(sub?.longSubscriberCountText) || text(sub?.subscriberCountText) || undefined,
    channelId: sub?.channelId,
    subscribed: sub?.subscribed,
    subscribeParams: (sub?.serviceEndpoints ?? []).find((e: Raw) => e?.subscribeEndpoint)?.subscribeEndpoint?.params,
    shuffle,
    radio,
    shelves,
  };
}

// ── 다음 곡·가사 ───────────────────────────────────────────────────────────

function watchNextTabs(resp: Raw): Raw[] {
  return resp?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs ?? [];
}

/** next 응답에서 가사 화면 browseId(MPLYt…) */
export function lyricsBrowseId(resp: Raw): string | undefined {
  for (const tab of watchNextTabs(resp)) {
    const id = tab?.tabRenderer?.endpoint?.browseEndpoint?.browseId;
    if (typeof id === 'string' && id.startsWith('MPLY')) return id;
  }
  return undefined;
}

/** next 응답의 탭: 가사(MPLY…)·관련 항목(MPTR…) browseId, 댓글 첫 쪽 이어받기 값 */
export function parseWatchTabs(resp: Raw): WatchTabs {
  const out: WatchTabs = {};
  for (const tab of watchNextTabs(resp)) {
    const t = tab?.tabRenderer;
    const id = t?.endpoint?.browseEndpoint?.browseId;
    const pageType = t?.endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
    if (typeof id === 'string' && (id.startsWith('MPLY') || pageType === 'MUSIC_PAGE_TYPE_TRACK_LYRICS')) out.lyricsBrowseId = id;
    else if (typeof id === 'string' && (id.startsWith('MPTR') || pageType === 'MUSIC_PAGE_TYPE_TRACK_RELATED')) out.relatedBrowseId = id;
    else if (!id) {
      // 댓글 탭은 주소 대신 처음 불러올 이어받기 값을 품고 있다(2026-10-14 확인).
      const token = t?.content?.sectionListRenderer?.continuations?.[0]?.reloadContinuationData?.continuation;
      if (typeof token === 'string' && t?.content?.sectionListRenderer?.targetId) out.commentsToken = token;
    }
  }
  return out;
}

/**
 * 댓글(next + continuation 응답). 내용은 frameworkUpdates의 commentEntityPayload에 있고,
 * 순서는 commentThreadRenderer → commentViewModel.commentKey로 잇는다(2026-10-14 확인).
 */
export function parseComments(resp: Raw): CommentsPage {
  const payloads = new Map<string, Raw>();
  for (const m of resp?.frameworkUpdates?.entityBatchUpdate?.mutations ?? []) {
    const p = m?.payload?.commentEntityPayload;
    if (p?.key) payloads.set(p.key, p);
  }
  const groups: Raw[] = (resp?.onResponseReceivedEndpoints ?? []).flatMap(
    (e: Raw) => e?.reloadContinuationItemsCommand?.continuationItems ?? e?.appendContinuationItemsAction?.continuationItems ?? [],
  );
  let countText: string | undefined;
  let continuation: string | undefined;
  const comments: Comment[] = [];
  for (const item of groups) {
    if (item?.commentsHeaderRenderer) {
      countText = text(item.commentsHeaderRenderer.countText) || undefined;
    } else if (item?.commentThreadRenderer) {
      const vm = item.commentThreadRenderer.commentViewModel?.commentViewModel;
      const p = vm?.commentKey ? payloads.get(vm.commentKey) : undefined;
      if (!p) continue;
      const author = p.author ?? {};
      const toolbar = p.toolbar ?? {};
      comments.push({
        id: p.properties?.commentId ?? vm.commentId ?? vm.commentKey,
        author: author.displayName ?? '',
        avatar: author.avatarThumbnailUrl || undefined,
        text: p.properties?.content?.content ?? '',
        published: p.properties?.publishedTime ?? '',
        likes: String(toolbar.likeCountNotliked ?? '').trim(),
        replies: String(toolbar.replyCount ?? '').trim(),
        isArtist: !!(author.isArtist || author.isCreator),
      });
    } else if (item?.continuationItemRenderer) {
      // 묶음 끝의 것이 다음 쪽(답글 이어받기는 스레드 안에 들어 있어 여기 오지 않는다)
      const token = item.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token
        ?? item.continuationItemRenderer.button?.buttonRenderer?.command?.continuationCommand?.token;
      if (token) continuation = token;
    }
  }
  return { countText, comments, continuation };
}

/** 분위기·장르 첫 화면: 묶음별 단추(musicNavigationButtonRenderer) */
export function parseMoods(resp: Raw): MoodsPage {
  const list = sectionListOf(resp);
  const sections: MoodsPage['sections'] = [];
  for (const section of list?.contents ?? []) {
    const grid = section?.gridRenderer;
    if (!grid) continue;
    const items: MoodItem[] = [];
    for (const it of grid.items ?? []) {
      const b = it?.musicNavigationButtonRenderer;
      const ep = b?.clickCommand?.browseEndpoint;
      if (!b || !ep?.browseId) continue;
      const argb = Number(b.solid?.leftStripeColor);
      items.push({
        label: text(b.buttonText),
        browseId: ep.browseId,
        params: ep.params,
        color: Number.isFinite(argb) && argb > 0 ? `#${(argb & 0xffffff).toString(16).padStart(6, '0')}` : undefined,
      });
    }
    if (items.length) sections.push({ title: text(grid.header?.gridHeaderRenderer?.title), items });
  }
  return { title: text(resp?.header?.musicHeaderRenderer?.title), sections };
}

export function parseLyrics(resp: Raw): LyricsData | undefined {
  const list = resp?.contents?.sectionListRenderer ?? sectionListOf(resp);
  const shelf = (list?.contents ?? []).find((c: Raw) => c.musicDescriptionShelfRenderer)?.musicDescriptionShelfRenderer;
  const body = text(shelf?.description);
  if (!body) return undefined;
  return { text: body, source: text(shelf?.footer) || undefined };
}

export function parseWatchNextQueue(resp: Raw): Track[] {
  const queue = watchNextTabs(resp)[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
  return itemsOf(queue?.contents ?? []).tracks;
}

/** 엔진이 YouTube Music 대기열 저장소에서 읽어 온 값: { items, automix, selected } */
export function parseQueue(raw: Raw): { items: (QueueItem | null)[]; automix: Track[] } {
  const selected = typeof raw?.selected === 'number' ? raw.selected : -1;
  const items = (raw?.items ?? []).map((data: Raw, i: number) => {
    const track = parsePanelVideo(data);
    return track ? { track, selected: i === selected } : null;
  });
  const automix = (raw?.automix ?? []).map((data: Raw) => parsePanelVideo(data)).filter(Boolean) as Track[];
  return { items, automix };
}

// ── 보관함·계정 ────────────────────────────────────────────────────────────

export function parseLibraryPlaylists(resp: Raw): { cards: Card[]; continuation?: Continuation } {
  const shelves = parseSections(sectionListOf(resp)?.contents ?? []);
  const cards = shelves.flatMap((s) => s.cards).filter((c) => c.browseId);
  const grid = findKey(resp, 'gridRenderer');
  return { cards, continuation: continuationOf(grid) };
}

export function parseAddToPlaylist(resp: Raw): PlaylistOption[] {
  const renderer = findKey(resp, 'addToPlaylistRenderer');
  const out: PlaylistOption[] = [];
  for (const p of renderer?.playlists ?? []) {
    const r = p?.playlistAddToOptionRenderer;
    if (!r?.playlistId) continue;
    out.push({
      playlistId: r.playlistId,
      title: text(r.title),
      thumbnail: thumbnail(r.thumbnail, 120),
      contains: r.containsSelectedVideos === 'ALL' || r.containsSelectedVideos === true,
    });
  }
  return out;
}

export function parseAccount(resp: Raw): Account | undefined {
  const header = findKey(resp, 'activeAccountHeaderRenderer');
  if (!header) return undefined;
  return {
    name: text(header.accountName),
    handle: text(header.channelHandle) || undefined,
    photo: thumbnail(header.accountPhoto, 88),
  };
}
