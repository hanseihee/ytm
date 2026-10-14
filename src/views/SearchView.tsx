import { useState } from 'react';
import { useAsync } from '../lib/useAsync';
import * as ytm from '../lib/ytm/client';
import type { Shelf } from '../lib/ytm/types';
import { playTrack } from '../state/library';
import { go, replace, routeForBrowse } from '../state/nav';
import { CardGrid, kindLabel, ShelfView } from '../components/Cards';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { ArtistLinks, TrackList } from '../components/TrackList';
import { focusSearch } from '../components/TopBar';
import { Empty, ErrorState, LoadMore, Loading } from './common';

export function SearchView({ query, params }: { query: string; params?: string }) {
  const key = query ? `search:${query}:${params ?? ''}` : null;
  const result = useAsync(key, () => ytm.search(query, params));
  const [busy, setBusy] = useState(false);

  if (!query) {
    return (
      <div className="page">
        <Empty title="무엇을 듣고 싶으세요?">
          <p>노래 제목, 아티스트, 앨범 이름으로 찾아보세요.</p>
          <button type="button" className="btn btn--primary" onClick={focusSearch}>검색창으로 가기</button>
        </Empty>
      </div>
    );
  }
  if (result.loading && !result.data) return <div className="page"><Loading label={`'${query}' 찾는 중…`} /></div>;
  if (result.error) return <div className="page"><ErrorState message={result.error} onRetry={result.reload} /></div>;
  const data = result.data;
  if (!data) return null;

  const filtered = !!params;
  const single: Shelf | undefined = filtered ? data.shelves[0] : undefined;
  const more = async () => {
    const c = single?.continuation;
    if (!c || busy) return;
    setBusy(true);
    try {
      const page = await ytm.searchMore(c);
      result.setData((prev) => {
        const [first, ...rest] = prev.shelves;
        return {
          ...prev,
          shelves: [{ ...first, tracks: [...first.tracks, ...page.tracks], cards: [...first.cards, ...page.cards], continuation: page.continuation }, ...rest],
        };
      });
    } catch (err) {
      console.warn('[search] 더 불러오기 실패', err);
      result.setData((prev) => ({ ...prev, shelves: prev.shelves.map((s, i) => (i === 0 ? { ...s, continuation: undefined } : s)) }));
    } finally {
      setBusy(false);
    }
  };

  const top = data.top;
  return (
    <div className="page">
      <div className="chips" role="tablist" aria-label="검색 결과 종류">
        <button type="button" role="tab" aria-selected={!filtered} className={`chip${!filtered ? ' is-on' : ''}`} onClick={() => replace({ name: 'search', query })}>
          전체
        </button>
        {data.chips.map((c) => (
          <button
            key={c.label}
            type="button"
            role="tab"
            aria-selected={c.selected}
            className={`chip${c.selected ? ' is-on' : ''}`}
            onClick={() => replace({ name: 'search', query, params: c.selected ? undefined : c.params, label: c.label })}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!filtered && top && (top.card || top.track) && (
        <section className="top-result">
          <h2 className="shelf__title">최상위 결과</h2>
          <div className="top-result__body">
            {top.card && (
              <button type="button" className="top-card" onClick={() => top.card!.browseId && go(routeForBrowse(top.card!.browseId, top.card!.params, top.card!.title))}>
                <Cover src={top.card.thumbnail} size={112} round={top.card.kind === 'artist'} />
                <span className="top-card__title">{top.card.title}</span>
                <span className="top-card__sub">{kindLabel(top.card.kind)}{top.card.subtitle ? ` · ${top.card.subtitle.replace(/^[^•]*•\s*/, '')}` : ''}</span>
              </button>
            )}
            {top.track && (
              <div className="top-card">
                <Cover src={top.track.thumbnail} size={112} />
                <span className="top-card__title">{top.track.title}</span>
                <ArtistLinks artists={top.track.artists} className="top-card__sub" />
                <button type="button" className="play-btn top-card__play" aria-label={`${top.track.title} 재생`} onClick={() => playTrack(top.track!)}>
                  <Icon name="play" size={20} />
                </button>
              </div>
            )}
            {top.tracks.length > 0 && <div className="top-result__tracks"><TrackList tracks={top.tracks} showAlbum={false} limit={4} /></div>}
          </div>
        </section>
      )}

      {data.shelves.length === 0 && !top ? (
        <Empty title={`'${query}' 검색 결과가 없습니다`}>
          <p>철자를 확인하거나 다른 단어로 찾아보세요.</p>
        </Empty>
      ) : filtered && single ? (
        <section className="shelf">
          {single.tracks.length > 0 && <TrackList tracks={single.tracks} />}
          {single.cards.length > 0 && <CardGrid cards={single.cards} />}
          {single.continuation && <LoadMore onReach={more} busy={busy} />}
        </section>
      ) : (
        data.shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={s} trackLimit={6} grid={false} />)
      )}
    </div>
  );
}
