import type { CSSProperties } from 'react';
import { useAsync } from '../lib/useAsync';
import * as ytm from '../lib/ytm/client';
import { playEndpoint } from '../state/library';
import { ShelfView } from '../components/Cards';
import { Icon } from '../components/Icon';
import { ErrorState, Loading } from './common';

export function ArtistView({ id }: { id: string }) {
  const res = useAsync(`artist:${id}`, () => ytm.artist(id));
  if (res.loading && !res.data) return <div className="page"><Loading /></div>;
  if (res.error) return <div className="page"><ErrorState message={res.error} onRetry={res.reload} /></div>;
  const a = res.data;
  if (!a) return null;
  const bg = { '--art': a.thumbnail ? `url("${a.thumbnail}")` : 'none' } as CSSProperties;
  return (
    <div className="page page--flush">
      <header className="artist-hero" style={bg}>
        <div className="artist-hero__fade" aria-hidden="true" />
        <div className="artist-hero__text">
          <h1 className="artist-hero__name">{a.name}</h1>
          {a.subscribers && <p className="artist-hero__subs">{a.subscribers}</p>}
          <div className="hero__actions">
            {a.shuffle && (
              <button type="button" className="btn btn--primary btn--play" onClick={() => playEndpoint(a.shuffle!, '셔플 재생')}>
                <Icon name="shuffle" size={17} /> 셔플 재생
              </button>
            )}
            {a.radio && (
              <button type="button" className="btn btn--quiet" onClick={() => playEndpoint(a.radio!, '라디오를 시작')}>
                <Icon name="radio" size={17} /> 라디오
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="page__inner">
        {a.shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={s} trackLimit={5} />)}
        {a.description && (
          <section className="shelf">
            <h2 className="shelf__title">소개</h2>
            <p className="about">{a.description}</p>
          </section>
        )}
      </div>
    </div>
  );
}
