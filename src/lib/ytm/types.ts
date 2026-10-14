// 앱 화면이 쓰는 YouTube Music 데이터 형태. 원본(InnerTube 렌더러)은 parse.ts에서만 다룬다.

/** YouTube Music이 쓰는 이동·재생 명령 원본(watchEndpoint, watchPlaylistEndpoint, browseEndpoint …). */
export type Endpoint = Record<string, unknown>;

export interface Ref {
  name: string;
  id?: string;
}

export interface Track {
  videoId: string;
  title: string;
  artists: Ref[];
  album?: Ref;
  /** 초 */
  duration?: number;
  thumbnail?: string;
  /** 플레이리스트 안에서 이 곡 자리를 가리키는 값(삭제할 때 필요) */
  setVideoId?: string;
  /** 이 곡을 지금 목록 맥락(앨범·플레이리스트)에서 재생하는 명령 */
  play: Endpoint;
  /** 뮤직비디오·일반 영상이면 true, 음원(ATV)이면 false */
  isVideo: boolean;
  /** 재생할 수 없게 회색 처리된 곡 */
  available: boolean;
  /** 앨범 수록 순서 등 원본이 주는 번호 */
  index?: number;
  /** 아티스트 인기곡 재생 수 같은 보조 정보 */
  extra?: string;
}

export type CardKind =
  | 'album'
  | 'single'
  | 'ep'
  | 'playlist'
  | 'artist'
  | 'song'
  | 'video'
  | 'episode'
  | 'podcast'
  | 'profile'
  | 'other';

export interface Card {
  kind: CardKind;
  title: string;
  subtitle: string;
  thumbnail?: string;
  /** 상세 화면으로 갈 때 쓰는 browseId(앨범 MPREb_…, 플레이리스트 VL…, 아티스트 UC…) */
  browseId?: string;
  /** browseEndpoint params(아티스트 음반 목록 등) */
  params?: string;
  /** 곡·영상 카드 */
  videoId?: string;
  /** 썸네일 재생 버튼 명령 */
  play?: Endpoint;
  /** 앨범·플레이리스트의 재생 목록 id(보관함 저장·다음에 재생에 씀) */
  playlistId?: string;
}

export interface MoreLink {
  title?: string;
  browseId: string;
  params?: string;
}

export interface Shelf {
  title: string;
  /** 곡 목록 */
  tracks: Track[];
  /** 앨범·플레이리스트·아티스트 카드 */
  cards: Card[];
  more?: MoreLink;
  /** 이어서 더 불러오는 값 */
  continuation?: Continuation;
}

export interface Continuation {
  token: string;
  /** "query": ?ctoken= 방식(옛 nextContinuationData), "body": 본문 continuation 방식 */
  style: 'query' | 'body';
}

export interface SearchChip {
  label: string;
  params?: string;
  selected: boolean;
}

export interface TopResult {
  card?: Card;
  track?: Track;
  tracks: Track[];
}

export interface SearchResult {
  chips: SearchChip[];
  top?: TopResult;
  shelves: Shelf[];
}

export interface Suggestions {
  queries: string[];
  tracks: Track[];
  cards: Card[];
}

export interface CollectionHeader {
  kind: CardKind;
  title: string;
  /** "앨범", "싱글", "재생목록" 같은 종류 표시 */
  typeLabel: string;
  year?: string;
  artists: Ref[];
  /** 곡 수·길이 등 원본이 주는 요약 */
  stats?: string;
  description?: string;
  thumbnail?: string;
  /** 전체 재생 */
  play?: Endpoint;
  /** 셔플 재생 */
  shuffle?: Endpoint;
  /** 믹스(라디오) */
  radio?: Endpoint;
  playlistId?: string;
  /** 보관함에 저장되어 있는지(원본이 알려줄 때) */
  saved?: boolean;
  /** 내가 만든 플레이리스트(이름 바꾸기·삭제·곡 빼기 가능) */
  editable: boolean;
  privacy?: string;
  author?: Ref;
}

export interface Collection {
  header: CollectionHeader;
  tracks: Track[];
  continuation?: Continuation;
  /** 앨범 아래 "다른 버전" 같은 추가 묶음 */
  shelves: Shelf[];
  /** 곡 목록 아래 묶음을 더 불러오는 값(내 재생목록의 "추천" 곡 등) */
  sectionsContinuation?: Continuation;
}

export interface ArtistPage {
  name: string;
  thumbnail?: string;
  description?: string;
  subscribers?: string;
  shuffle?: Endpoint;
  radio?: Endpoint;
  channelId?: string;
  subscribed?: boolean;
  /** 구독 단추의 subscribeEndpoint.params */
  subscribeParams?: string;
  shelves: Shelf[];
}

export interface HomePage {
  shelves: Shelf[];
  continuation?: Continuation;
}

export interface QueueItem {
  track: Track;
  selected: boolean;
}

export interface PlaylistOption {
  playlistId: string;
  title: string;
  thumbnail?: string;
  /** 고른 곡이 이미 들어 있음 */
  contains: boolean;
}

export interface LyricsData {
  text: string;
  source?: string;
}

export interface Account {
  name: string;
  handle?: string;
  photo?: string;
}

/** 분위기·장르 단추 */
export interface MoodItem {
  label: string;
  browseId: string;
  params?: string;
  /** 단추 왼쪽 띠 색(#rrggbb) */
  color?: string;
}

export interface MoodsPage {
  title: string;
  sections: { title: string; items: MoodItem[] }[];
}

export interface Comment {
  id: string;
  author: string;
  avatar?: string;
  text: string;
  /** "3일 전" */
  published: string;
  likes: string;
  replies: string;
  /** 아티스트·채널 주인 */
  isArtist: boolean;
}

export interface CommentsPage {
  /** "댓글 137개" */
  countText?: string;
  comments: Comment[];
  /** 다음 쪽 이어받기 값 */
  continuation?: string;
}

/** 지금 곡의 "다음 트랙/가사/댓글/관련 항목" 탭 정보(next 응답) */
export interface WatchTabs {
  lyricsBrowseId?: string;
  relatedBrowseId?: string;
  commentsToken?: string;
}
