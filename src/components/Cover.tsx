import { useState } from 'react';
import { Icon } from './Icon';

/** YouTube Music 썸네일 주소의 크기 지정(=w120-h120…)을 크게 바꾼다. */
export const largeArt = (url: string) => url.replace(/=w\d+-h\d+/, '=w1200-h1200');

interface Props {
  src?: string;
  size?: number | string;
  round?: boolean;
  className?: string;
  alt?: string;
}

/** 앨범아트·프로필 사진. 없거나 깨지면 음표 자리표시. */
export function Cover({ src, size = 48, round, className = '', alt = '' }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: size, height: size };
  const shape = round ? 'cover cover--round' : 'cover';
  if (!src || failed === src) {
    return (
      <div className={`${shape} cover--empty ${className}`} style={style} aria-hidden="true">
        <Icon name="note" size={typeof size === 'number' ? Math.max(16, size * 0.36) : 28} />
      </div>
    );
  }
  return (
    <img
      className={`${shape} ${className}`}
      style={style}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(src)}
    />
  );
}
