// 화면 데이터 불러오기. 같은 열쇠는 잠시 기억해 뒤로 가기가 빠르다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from './tauri';

const cache = new Map<string, { at: number; value: unknown }>();
/** 기억 유지 시간 */
const TTL_MS = 5 * 60 * 1000;

export function invalidate(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export interface AsyncState<T> {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => void;
  /** 이어받기 등으로 받은 값을 화면에 반영 */
  setData: (update: (prev: T) => T) => void;
}

export function useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> {
  const cached = key ? (cache.get(key) as { at: number; value: T } | undefined) : undefined;
  const fresh = cached && Date.now() - cached.at < TTL_MS ? cached.value : undefined;
  const [state, setState] = useState<{ key: string | null; data?: T; error?: string; loading: boolean }>(() => ({
    key,
    data: fresh,
    loading: !!key && fresh === undefined,
  }));
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  // 열쇠가 바뀌면 바로 그 열쇠의 기억값(없으면 빈 화면)으로 바꾼다.
  if (state.key !== key) {
    setState({ key, data: fresh, loading: !!key && fresh === undefined });
  }

  useEffect(() => {
    if (!key) return;
    const hit = cache.get(key);
    if (nonce === 0 && hit && Date.now() - hit.at < TTL_MS) return;
    let alive = true;
    setState((s) => ({ ...s, key, loading: true, error: undefined }));
    loadRef.current().then(
      (value) => {
        cache.set(key, { at: Date.now(), value });
        if (alive) setState({ key, data: value, loading: false });
      },
      (err) => {
        if (alive) setState((s) => ({ ...s, key, loading: false, error: describeError(err) }));
      },
    );
    return () => {
      alive = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => {
    if (key) cache.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  const setData = useCallback(
    (update: (prev: T) => T) =>
      setState((s) => {
        if (s.data === undefined) return s;
        const data = update(s.data);
        if (key) cache.set(key, { at: Date.now(), value: data });
        return { ...s, data };
      }),
    [key],
  );

  return { data: state.data, error: state.error, loading: state.loading, reload, setData };
}
