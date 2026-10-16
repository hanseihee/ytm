// 지금 곡의 자세한 정보(아티스트·앨범 링크). 재생 상태에는 이름 글자만 있어서, 곡이 바뀌면 대기열에서 같은 곡을 찾아 채운다.
// 새 대기열은 곡이 바뀐 뒤 조금 늦게 채워지므로(engine.js navigate 참고) 못 찾으면 몇 번 더 찾아본다.
import { createStore, useStore } from '../lib/store';
import type { PlayerState } from '../lib/tauri';
import * as ytm from '../lib/ytm/client';
import type { QueueItem, Track } from '../lib/ytm/types';
import { playerStore } from './player';

interface NowTrack {
  /** 찾은 곡의 videoId(못 찾았거나 찾는 중이면 track 없음) */
  id: string;
  track?: Track;
}

export const nowTrackStore = createStore<NowTrack>({ id: '' });
export const useNowTrack = () => useStore(nowTrackStore, (s) => s);

const RETRY_MS = [0, 1500, 4000, 8000];
let seq = 0;

async function resolve(videoId: string) {
  const mine = ++seq;
  for (const wait of RETRY_MS) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (mine !== seq) return;
    try {
      const { items } = await ytm.queue();
      const list = items.filter((i): i is QueueItem => !!i);
      const hit = list.find((i) => i.selected && i.track.videoId === videoId) ?? list.find((i) => i.track.videoId === videoId);
      if (hit) {
        if (mine === seq) nowTrackStore.set({ id: videoId, track: hit.track });
        return;
      }
    } catch (err) {
      console.warn('[now] 대기열에서 지금 곡을 찾지 못했습니다', err);
    }
  }
}

/** 곡이 바뀔 때마다 찾는다. 멈추는 함수를 돌려준다. */
export function startNowTrackSync(): () => void {
  let last = '';
  const check = () => {
    const s = playerStore.get();
    const id = s.ad ? '' : s.videoId;
    if (id === last) return;
    last = id;
    seq++;
    nowTrackStore.set({ id: '' });
    if (id) void resolve(id);
  };
  check();
  return playerStore.subscribe(check);
}

/** 메뉴·링크에 쓸 지금 곡. 대기열에서 찾았으면 그 곡(아티스트·앨범 링크 포함), 아니면 재생 상태의 글자로 만든다. */
export function nowPlayingTrack(state: PlayerState, found: NowTrack): Track | undefined {
  if (!state.videoId || state.ad) return undefined;
  if (found.id === state.videoId && found.track) return found.track;
  return {
    videoId: state.videoId,
    title: state.title,
    artists: state.artist ? [{ name: state.artist }] : [],
    album: state.album ? { name: state.album } : undefined,
    thumbnail: state.artwork || undefined,
    play: { watchEndpoint: { videoId: state.videoId } },
    isVideo: !!state.avVideo,
    available: true,
  };
}
