// iOS 데이터 묶음에서 '@tauri-apps/api/event' 대신 쓰인다. 데이터 코드는 이벤트를 듣지 않아 비워 둔다.
export type UnlistenFn = () => void;

export async function listen(): Promise<UnlistenFn> {
  return () => undefined;
}
