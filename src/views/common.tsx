// 화면 공통 조각: 불러오는 중·오류·빈 화면, 끝까지 내리면 더 불러오기.
import { useEffect, useRef } from 'react';
import { t } from '../i18n';

export function Loading({ label = t('불러오는 중…') }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--quiet" onClick={onRetry}>{t('다시 시도')}</button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {children}
    </div>
  );
}

/** 화면 끝에 닿으면 onReach를 부른다(이어받기). */
export function LoadMore({ onReach, busy }: { onReach: () => void; busy: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onReach);
  cb.current = onReach;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className="load-more">{busy ? <Loading label={t('더 불러오는 중…')} /> : null}</div>;
}
