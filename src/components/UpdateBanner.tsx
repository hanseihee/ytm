// 새 버전이 있으면 화면 오른쪽 위에 알린다: 내려받기(릴리즈 페이지를 기본 브라우저로) / 나중에.
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { checkForUpdate, dismiss, isDismissed, type UpdateInfo } from '../lib/update';

const RECHECK_MS = 12 * 60 * 60 * 1000;

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const current = await getVersion();
        const found = await checkForUpdate(current);
        if (alive && found && !isDismissed(found.version)) setUpdate(found);
      } catch (err) {
        // 인터넷이 없거나 GitHub가 응답하지 않으면 조용히 넘어간다(다음에 다시 확인).
        console.info('[update] 새 버전 확인 실패', err);
      }
    };
    // 앱이 자리 잡은 뒤에 확인한다.
    const first = window.setTimeout(check, 4000);
    const timer = window.setInterval(check, RECHECK_MS);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  if (!update) return null;
  const open = () => {
    invoke('plugin:opener|open_url', { url: update.url }).catch((err) => console.warn('[update] 릴리즈 페이지 열기 실패', err));
  };
  const later = () => {
    dismiss(update.version);
    setUpdate(null);
  };
  return (
    <div className="update" role="status" aria-live="polite">
      <svg className="update__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14" />
      </svg>
      <div className="update__text">
        <b>{t('새 버전 {version}이 나왔습니다', { version: update.version })}</b>
        <span>{t('내려받아 설치하면 새 기능과 고친 점을 쓸 수 있습니다.')}</span>
      </div>
      <div className="update__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={open}>
          {t('내려받기')}
        </button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={later}>
          {t('나중에')}
        </button>
      </div>
    </div>
  );
}
