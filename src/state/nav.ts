// 화면 이동 기록(뒤로·앞으로). 주소 대신 이 목록으로 움직인다.
import { createStore, useStore } from '../lib/store';

export type Route =
  | { name: 'home' }
  | { name: 'search'; query: string; params?: string; label?: string }
  | { name: 'album'; id: string }
  | { name: 'playlist'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'browse'; id: string; params?: string; title?: string }
  | { name: 'liked' }
  | { name: 'library' }
  /** Spotify 플레이리스트를 YouTube Music으로 듣기 */
  | { name: 'spotify'; id: string }
  | { name: 'settings' };

interface NavState {
  stack: Route[];
  index: number;
}

export const navStore = createStore<NavState>({ stack: [{ name: 'home' }], index: 0 });

const same = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b);

export function go(route: Route) {
  navStore.set((s) => {
    if (same(s.stack[s.index], route)) return s;
    const stack = [...s.stack.slice(0, s.index + 1), route].slice(-50);
    return { stack, index: stack.length - 1 };
  });
}

/** 검색어를 고칠 때처럼 기록을 늘리지 않고 지금 화면만 바꾼다. */
export function replace(route: Route) {
  navStore.set((s) => {
    const stack = [...s.stack];
    stack[s.index] = route;
    return { stack, index: s.index };
  });
}

export const back = () => navStore.set((s) => (s.index > 0 ? { ...s, index: s.index - 1 } : s));
export const forward = () => navStore.set((s) => (s.index < s.stack.length - 1 ? { ...s, index: s.index + 1 } : s));

export const useRoute = () => useStore(navStore, (s) => s.stack[s.index]);
export const useCanGo = () =>
  useStore(navStore, (s) => (s.index > 0 ? 1 : 0) | (s.index < s.stack.length - 1 ? 2 : 0));

/** browseId 종류에 맞는 화면 */
export function routeForBrowse(browseId: string, params?: string, title?: string): Route {
  if (browseId === 'VLLM' || browseId === 'LM') return { name: 'liked' };
  if (browseId.startsWith('MPREb_')) return { name: 'album', id: browseId };
  if (browseId.startsWith('VL') || browseId.startsWith('PL') || browseId.startsWith('RDCLAK') || browseId.startsWith('OLAK')) {
    return { name: 'playlist', id: browseId };
  }
  if (browseId.startsWith('UC') && !params) return { name: 'artist', id: browseId };
  return { name: 'browse', id: browseId, params, title };
}
