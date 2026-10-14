// iOS 데이터 묶음에서 '@tauri-apps/api/core' 대신 쓰인다: invoke → 앱(Swift) 명령.
import { request } from './native';

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return request('send', cmd, JSON.stringify(args ?? {})) as Promise<T>;
}
