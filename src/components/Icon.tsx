// 아이콘(24×24 기준 SVG). 색은 currentColor를 따른다.
import type { SVGProps } from 'react';

const PATHS = {
  play: 'M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5z',
  pause: 'M7 5h3.2v14H7zM13.8 5H17v14h-3.2z',
  next: 'M6 6.2v11.6a.8.8 0 0 0 1.22.68L15.5 13v4.8h2.3V6.2h-2.3V11L7.22 5.52A.8.8 0 0 0 6 6.2z',
  previous: 'M18 6.2v11.6a.8.8 0 0 1-1.22.68L8.5 13v4.8H6.2V6.2h2.3V11l8.28-5.48A.8.8 0 0 1 18 6.2z',
  shuffle: 'M16 4.5h4v4M20 4.5l-5.6 5.6M4 19.5l6.2-6.2M16 19.5h4v-4M20 19.5L4 4.5',
  repeat: 'M17 2.8l3 3-3 3M4 11.2V9.6a3.8 3.8 0 0 1 3.8-3.8H20M7 21.2l-3-3 3-3M20 12.8v1.6a3.8 3.8 0 0 1-3.8 3.8H4',
  heart: 'M12 20.3s-7.6-4.6-9.2-9.7C1.7 7 3.9 3.8 7.2 3.8c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.5 3.2 4.4 6.8-1.6 5.1-9.2 9.7-9.2 9.7z',
  search: 'M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20.5 20.5l-5-5',
  home: 'M3.5 10.5L12 3.8l8.5 6.7V20a.5.5 0 0 1-.5.5h-5.2v-6h-5.6v6H4a.5.5 0 0 1-.5-.5z',
  library: 'M4 3.5v17M8.5 3.5v17M13 4.2l5.6 16',
  plus: 'M12 5v14M5 12h14',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  lyrics: 'M4 6h11M4 10.5h8M4 15h6M16.5 9.5v7.2a2.2 2.2 0 1 1-1.4-2.05M16.5 9.5l4-1.2',
  queue: 'M4 6h12M4 11h12M4 16h7M15 15v5l4.5-2.5z',
  volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.8a7 7 0 0 1-1.7 1l-.3 2h-4l-.3-2a7 7 0 0 1-1.7-1l-1.9.8-2-3.4 1.6-1.2a7 7 0 0 1 0-3l-1.6-1.2 2-3.4 1.9.8a7 7 0 0 1 1.7-1l.3-2h4l.3 2a7 7 0 0 1 1.7 1l1.9-.8 2 3.4-1.6 1.2a7 7 0 0 1 0 3z',
  up: 'M6 15l6-6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  radio: 'M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  bookmark: 'M6.5 3.5h11v17L12 16.6l-5.5 3.9z',
  trash: 'M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14',
  edit: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  chart: 'M5 20v-8M10 20V5M15 20v-6M20 20V9',
  eq: 'M6 4v6M6 14v6M12 4v2M12 10v10M18 4v9M18 17v3M3.5 12h5M9.5 8h5M15.5 15h5',
  note: 'M9 18.5V5.5l11-2v13M9 18.5a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 9 18.5zM20 16.5a2.5 2.5 0 1 1-2.5-2.5 2.5 2.5 0 0 1 2.5 2.5z',
} as const;

export type IconName = keyof typeof PATHS;

/** 채워 그리는 아이콘(나머지는 선으로 그린다) */
const FILLED = new Set<IconName>(['play', 'pause', 'next', 'previous']);

interface Props extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  /** 하트·책갈피를 채워 그린다 */
  filled?: boolean;
}

export function Icon({ name, size = 20, filled, ...rest }: Props) {
  const fill = FILLED.has(name) || filled;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill && FILLED.has(name) ? 'none' : 'currentColor'}
      strokeWidth={name === 'more' ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
