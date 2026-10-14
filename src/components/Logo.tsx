// 앱 표시(아이콘과 같은 모양: 둥근 사각형 + 이퀄라이저 막대 다섯 개). 바탕은 테마 강조색, 막대는 강조색 위 글자색을 따른다.
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
      <rect x="3" y="3" width="38" height="38" rx="8.5" fill={`url(#${id})`} />
      <g style={{ fill: 'var(--on-accent)' }}>
        <rect x="10" y="17.9" width="3.4" height="8.2" rx="1.7" />
        <rect x="15.15" y="15.3" width="3.4" height="13.4" rx="1.7" />
        <rect x="20.3" y="12.25" width="3.4" height="19.5" rx="1.7" />
        <rect x="25.45" y="15.3" width="3.4" height="13.4" rx="1.7" />
        <rect x="30.6" y="17.9" width="3.4" height="8.2" rx="1.7" />
      </g>
    </svg>
  );
}
