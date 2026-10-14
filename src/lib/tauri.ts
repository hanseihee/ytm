// Tauri 명령·이벤트 얇은 포장. 화면 나머지 코드는 이 파일만 통해 Rust와 이야기한다.
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface EngineStatus {
  ready: boolean;
  host: string;
  path: string;
  loggedIn: boolean;
  subscriber: boolean;
}

/** engine.js readState()가 보내는 재생 상태 */
export interface PlayerState {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  position: number;
  playing: boolean;
  buffering: boolean;
  ad: boolean;
  likeStatus: 'LIKE' | 'DISLIKE' | 'INDIFFERENT' | string;
  repeat: 'NONE' | 'ALL' | 'ONE' | string;
  volume: number;
  muted: boolean;
  /** 엔진이 상태를 읽은 시각(ms) — 재생 위치를 이어서 계산할 때 쓴다 */
  at: number;
}

export type EngineMethod = 'api' | 'status' | 'state' | 'play' | 'queueAdd' | 'queue' | 'queueJump' | 'control';

/** 엔진 오류를 사람이 읽을 문장으로. */
export function describeError(err: unknown): string {
  const message = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err);
  if (message.startsWith('engine_not_ready')) return 'YouTube Music 연결을 기다리는 중입니다. 잠시 뒤 다시 시도하세요.';
  if (message.startsWith('engine_timeout')) return 'YouTube Music이 응답하지 않습니다. 인터넷 연결을 확인하세요.';
  if (message.startsWith('engine_navigating')) return 'YouTube Music 페이지를 다시 불러오는 중이었습니다. 다시 시도하세요.';
  if (message.startsWith('not_on_music')) return 'YouTube Music에 로그인해야 합니다.';
  if (/^http_401|^http_403/.test(message)) return '로그인이 만료됐습니다. 다시 로그인하세요.';
  if (/^http_4\d\d/.test(message)) return `YouTube Music이 요청을 거절했습니다 (${message.slice(5, 8)}).`;
  if (/^http_5\d\d/.test(message)) return 'YouTube Music 서버 오류입니다. 잠시 뒤 다시 시도하세요.';
  return message;
}

export function engineCall<T = unknown>(method: EngineMethod, args?: unknown): Promise<T> {
  return invoke<T>('engine_call', { method, args: args ?? null });
}

export const getEngineStatus = () => invoke<EngineStatus>('get_engine_status');
export const getPlayerState = () => invoke<PlayerState | null>('get_player_state');
export const showEngine = (mode: 'login' | 'web' | 'reload') => invoke<void>('show_engine', { mode });
export const hideEngine = () => invoke<void>('hide_engine');

export const onEngineStatus = (fn: (s: EngineStatus) => void): Promise<UnlistenFn> =>
  listen<EngineStatus>('engine-status', (e) => fn(e.payload));
export const onPlayerState = (fn: (s: PlayerState) => void): Promise<UnlistenFn> =>
  listen<PlayerState>('player-state', (e) => fn(e.payload));
export const onMenuAction = (fn: (action: string) => void): Promise<UnlistenFn> =>
  listen<string>('menu-action', (e) => fn(e.payload));
