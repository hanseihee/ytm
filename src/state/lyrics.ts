// 지금 곡의 가사(큰 창 가사 화면과 미니 플레이어가 함께 쓴다).
// 곡이 바뀔 때만 다시 찾고, 노래↔영상만 바꿨으면 짝 버전 가사를 그대로 쓰며 시간만 옮긴다.
import { useEffect, useRef, useState } from 'react';
import { loadLyrics, LYRICS_OFFSET_KEY, lyricsOffset, setLyricsOffset, type Lyrics } from '../lib/lyrics';
import { usePlayer } from './player';

export interface TrackLyrics {
  /** 가사를 찾은 곡(짝 버전 가사를 빌려 쓰면 그 곡) */
  id: string;
  lyrics?: Lyrics | null;
  error?: boolean;
  /** 찾는 중 */
  loading: boolean;
  /** 짝 버전(노래↔영상) 가사를 빌려 쓰는 중 */
  borrowed: boolean;
  /** 곡마다 맞춘 싱크(초) */
  offset: number;
  /** 가사 시간 = 재생 위치 + offset + shift */
  shift: number;
  /** 싱크 바꾸기(0이면 원래대로) */
  nudge: (delta: number) => void;
}

export function useTrackLyrics(): TrackLyrics {
  const videoId = usePlayer((s) => s.videoId);
  const title = usePlayer((s) => s.title);
  const artist = usePlayer((s) => s.artist);
  const album = usePlayer((s) => s.album);
  const duration = usePlayer((s) => s.duration);
  const ad = usePlayer((s) => s.ad);
  const avOther = usePlayer((s) => s.avOther ?? '');
  const avShift = usePlayer((s) => s.avShift ?? 0);
  const [state, setState] = useState<{ id: string; lyrics?: Lyrics | null; error?: boolean }>({ id: '' });
  const current = useRef(state);
  current.current = state;

  useEffect(() => {
    if (!videoId || ad || !title) return;
    // 노래↔영상만 바꿨으면 짝 버전 가사를 그대로 쓰고 시간만 옮긴다(다시 찾느라 깜빡이지 않게).
    if (avOther && current.current.id === avOther && current.current.lyrics) return;
    let alive = true;
    setState({ id: videoId });
    loadLyrics({ videoId, title, artist, album, duration }).then(
      (lyrics) => alive && setState({ id: videoId, lyrics }),
      () => alive && setState({ id: videoId, error: true }),
    );
    return () => {
      alive = false;
    };
    // 곡이 바뀔 때만 다시 찾는다(길이는 곡 시작 직후 0일 수 있어 첫 값만 쓴다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, ad, title]);

  // 짝 버전(노래↔영상) 가사를 쓰는 중이면 그 버전 기준 시간으로 옮긴다(짝 버전 위치 = 지금 위치 + avShift).
  const borrowed = !!avOther && state.id === avOther && state.id !== videoId;
  const lyricsId = borrowed ? state.id : videoId;
  const [offset, setOffset] = useState(() => lyricsOffset(lyricsId));
  useEffect(() => {
    setOffset(lyricsOffset(lyricsId));
    // 다른 창(큰 창·미니 플레이어)에서 싱크를 바꾸면 따라간다.
    const onStorage = (e: StorageEvent) => e.key === LYRICS_OFFSET_KEY && setOffset(lyricsOffset(lyricsId));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [lyricsId]);

  return {
    ...state,
    loading: (state.id !== videoId && !borrowed) || (state.lyrics === undefined && !state.error),
    borrowed,
    offset,
    shift: borrowed ? avShift : 0,
    nudge: (delta) => setOffset(setLyricsOffset(lyricsId, delta === 0 ? 0 : offset + delta)),
  };
}
