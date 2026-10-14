// iOS 앱(Swift, ios/YTM/Core/JSCore.swift)이 JavaScriptCore에 넣어 주는 함수들과, 그 답을 기다리는 도구.

export interface Native {
  /** 앱 명령(engine_call, spotify_playlist). 답은 __nativeResolve로 온다. */
  send(id: number, cmd: string, argsJSON: string): void;
  /** https 요청. 답은 {status, body} JSON으로 __nativeResolve에 온다. */
  fetch(id: number, url: string, initJSON: string): void;
  storageGet(key: string): string | null;
  storageSet(key: string, value: string): void;
  storageRemove(key: string): void;
  timer(id: number, ms: number): void;
  log(level: string, message: string): void;
  /** 앱이 부른 데이터 함수(__coreCall)의 결과 */
  done(id: number, ok: boolean, payload: string): void;
}

export const native = (globalThis as unknown as { __native: Native }).__native;

interface Waiter {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}
const waiting = new Map<number, Waiter>();
let seq = 0;

/** 앱에 요청하고 JSON 답을 기다린다. 실패는 Tauri invoke처럼 문자열로 거절한다. */
export function request(kind: 'send' | 'fetch', a: string, b: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    if (kind === 'send') native.send(id, a, b);
    else native.fetch(id, a, b);
  });
}

(globalThis as unknown as { __nativeResolve: (id: number, ok: boolean, payload: string) => void }).__nativeResolve = (id, ok, payload) => {
  const w = waiting.get(id);
  if (!w) return;
  waiting.delete(id);
  if (!ok) w.reject(payload);
  else {
    try {
      w.resolve(payload === '' ? null : JSON.parse(payload));
    } catch (err) {
      w.reject(`bad_json ${String(err)}`);
    }
  }
};
