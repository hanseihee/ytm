// 앱 표시(아이콘과 같은 모양: 강조색 링 + 이퀄라이저 막대). 테마 강조색을 따른다.
import { useId } from 'react';

export function Logo({ size = 22 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id={id} x1="0.15" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" style={{ stopColor: 'var(--rose)' }} />
          <stop offset="1" style={{ stopColor: 'var(--violet)' }} />
        </linearGradient>
      </defs>
      <circle cx="22" cy="22" r="18" fill="none" stroke={`url(#${id})`} strokeWidth="3.6" />
      <g fill="currentColor">
        <rect x="13" y="21" width="3.2" height="8" rx="1.6" />
        <rect x="17.6" y="16.5" width="3.2" height="12.5" rx="1.6" />
        <rect x="22.2" y="13" width="3.2" height="16" rx="1.6" />
        <rect x="26.8" y="18" width="3.2" height="11" rx="1.6" />
      </g>
    </svg>
  );
}
