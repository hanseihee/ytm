import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import * as ytm from '../lib/ytm/client';
import type { Suggestions } from '../lib/ytm/types';
import { playTrack } from '../state/library';
import { back, forward, go, replace, routeForBrowse, useCanGo, useRoute } from '../state/nav';
import { Cover } from './Cover';
import { Icon } from './Icon';

/** 다른 곳(메뉴·단축키)에서 검색창에 초점을 줄 때 쓴다. */
export const focusSearch = () => document.querySelector<HTMLInputElement>('#search-input')?.focus();

function SearchBox() {
  const route = useRoute();
  const routeQuery = route.name === 'search' ? route.query : '';
  const [value, setValue] = useState(routeQuery);
  const [open, setOpen] = useState(false);
  const [sugg, setSugg] = useState<Suggestions | null>(null);
  const [cursor, setCursor] = useState(-1);
  const timer = useRef(0);

  useEffect(() => setValue(routeQuery), [routeQuery]);
  useEffect(() => {
    clearTimeout(timer.current);
    const q = value.trim();
    if (!q || q === routeQuery) {
      setSugg(null);
      return;
    }
    timer.current = window.setTimeout(() => {
      ytm.suggestions(q).then(setSugg, () => setSugg(null));
    }, 180);
    return () => clearTimeout(timer.current);
  }, [value, routeQuery]);

  const submit = (q: string) => {
    const query = q.trim();
    if (!query) return;
    setOpen(false);
    setValue(query);
    if (route.name === 'search' && !route.query) replace({ name: 'search', query });
    else go({ name: 'search', query });
  };

  const queries = sugg?.queries.slice(0, 6) ?? [];
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => Math.min(queries.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(-1, c - 1));
    } else if (e.key === 'Enter') {
      submit(cursor >= 0 && queries[cursor] ? queries[cursor] : value);
      setCursor(-1);
    } else if (e.key === 'Escape') {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const showDrop = open && sugg && (queries.length || sugg.tracks.length || sugg.cards.length);
  return (
    <div className="searchbox" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <Icon name="search" size={18} className="searchbox__icon" />
      <input
        id="search-input"
        className="searchbox__input"
        type="search"
        placeholder="노래, 앨범, 아티스트 검색"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setCursor(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        aria-expanded={!!showDrop}
        aria-controls="search-suggestions"
      />
      {showDrop ? (
        <div className="suggest" id="search-suggestions" role="listbox">
          {queries.map((q, i) => (
            <button key={q} type="button" role="option" aria-selected={i === cursor} className={`suggest__query${i === cursor ? ' is-on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => submit(q)}>
              <Icon name="search" size={15} />
              {q}
            </button>
          ))}
          {(sugg!.cards.length > 0 || sugg!.tracks.length > 0) && <div className="suggest__sep" />}
          {sugg!.cards.slice(0, 3).map((c) => (
            <button
              key={c.browseId}
              type="button"
              className="suggest__item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                if (c.browseId) go(routeForBrowse(c.browseId, c.params, c.title));
              }}
            >
              <Cover src={c.thumbnail} size={36} round={c.kind === 'artist'} />
              <span><b>{c.title}</b><small>{c.subtitle}</small></span>
            </button>
          ))}
          {sugg!.tracks.slice(0, 3).map((t) => (
            <button
              key={t.videoId}
              type="button"
              className="suggest__item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                void playTrack(t);
              }}
            >
              <Cover src={t.thumbnail} size={36} />
              <span><b>{t.title}</b><small>{t.artists.map((a) => a.name).join(', ')}</small></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TopBar() {
  const can = useCanGo();
  return (
    <div className="topbar" data-tauri-drag-region>
      <div className="topbar__nav">
        <button type="button" className="icon-btn icon-btn--round" aria-label="뒤로" disabled={!(can & 1)} onClick={back}>
          <Icon name="back" size={18} />
        </button>
        <button type="button" className="icon-btn icon-btn--round" aria-label="앞으로" disabled={!(can & 2)} onClick={forward}>
          <Icon name="forward" size={18} />
        </button>
      </div>
      <SearchBox />
    </div>
  );
}
