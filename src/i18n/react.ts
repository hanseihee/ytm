// 화면(React)에서 지금 언어 읽기. 언어가 바뀌면 다시 그린다.
import { Fragment, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { getLang, getLangSetting, subscribeLang } from './index';

export const useLang = () => useSyncExternalStore(subscribeLang, getLang);
export const useLangSetting = () => useSyncExternalStore(subscribeLang, getLangSetting);

/**
 * 언어가 바뀌면 안쪽 화면을 새로 그린다. 문구는 그릴 때 t()로 만들어지므로, 기억해 둔 값(useMemo 등)까지
 * 새 언어로 바뀌게 통째로 다시 만든다(화면 위치는 nav 저장소에 있어 그대로다).
 */
export function LangKeyed({ children }: { children: ReactNode }) {
  const lang = useLang();
  return createElement(Fragment, { key: lang }, children);
}
