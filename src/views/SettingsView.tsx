// 설정: 테마(색)와 가사 글자 크기, 계정·연결.
import type { CSSProperties } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { useEffect, useState } from 'react';
import { setTheme, THEMES, useTheme, type ThemeInfo } from '../lib/theme';
import { showEngine } from '../lib/tauri';
import { useLibrary } from '../state/library';
import { LYRIC_SCALES, stepLyricScale, toastError, useLyricScale } from '../state/ui';
import { Icon } from '../components/Icon';

function Swatch({ theme }: { theme: ThemeInfo }) {
  const p = theme.preview;
  const style = {
    '--sw-bg': p.bg,
    '--sw-surface': p.surface,
    '--sw-ink': p.ink,
    '--sw-a': p.accent[0],
    '--sw-b': p.accent[1],
  } as CSSProperties;
  return (
    <span className={`swatch${theme.kind === 'auto' ? ' swatch--auto' : ''}`} style={style} aria-hidden="true">
      <span className="swatch__side" />
      <span className="swatch__main">
        <span className="swatch__line swatch__line--long" />
        <span className="swatch__line" />
        <span className="swatch__accent" />
      </span>
    </span>
  );
}

export function SettingsView() {
  const theme = useTheme();
  const scale = useLyricScale();
  const account = useLibrary((s) => s.account);
  const [version, setVersion] = useState('');
  useEffect(() => {
    getVersion().then(setVersion, () => setVersion(''));
  }, []);

  return (
    <div className="page settings">
      <header className="page__head">
        <h1 className="page__title">설정</h1>
      </header>

      <section className="settings__section" aria-labelledby="theme-title">
        <h2 id="theme-title" className="shelf__title">테마</h2>
        <div className="themes" role="radiogroup" aria-label="테마">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              className={`theme-card${theme === t.id ? ' is-on' : ''}`}
              onClick={() => setTheme(t.id)}
            >
              <Swatch theme={t} />
              <span className="theme-card__text">
                <span className="theme-card__label">
                  {t.label}
                  {theme === t.id && <Icon name="check" size={16} />}
                </span>
                <span className="theme-card__desc">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings__section" aria-labelledby="lyrics-size-title">
        <h2 id="lyrics-size-title" className="shelf__title">가사 글자 크기</h2>
        <div className="settings__row">
          <div className="textsize textsize--large" role="group" aria-label="가사 글자 크기">
            <button type="button" className="textsize__btn" aria-label="가사 글자 작게" disabled={scale <= LYRIC_SCALES[0]} onClick={() => stepLyricScale(-1)}>
              <span className="textsize__glyph textsize__glyph--sm" aria-hidden="true">가</span>
            </button>
            <button type="button" className="textsize__value" title="기본 크기로" onClick={() => stepLyricScale(0)}>
              {Math.round(scale * 100)}%
            </button>
            <button type="button" className="textsize__btn" aria-label="가사 글자 크게" disabled={scale >= LYRIC_SCALES[LYRIC_SCALES.length - 1]} onClick={() => stepLyricScale(1)}>
              <span className="textsize__glyph textsize__glyph--lg" aria-hidden="true">가</span>
            </button>
          </div>
          <span className="settings__preview" style={{ fontSize: `${Math.round(30 * scale)}px` }}>이 밤 그날의 반딧불을</span>
        </div>
        <p className="field__hint">가사 화면에서 ⌘= / ⌘- / ⌘0(윈도우는 Ctrl)으로도 바꿀 수 있습니다.</p>
      </section>

      <section className="settings__section" aria-labelledby="account-title">
        <h2 id="account-title" className="shelf__title">계정과 연결</h2>
        <p className="settings__text">{account ? `${account.name}${account.handle ? ` (${account.handle})` : ''} 계정으로 로그인했습니다.` : '로그인하지 않았습니다.'}</p>
        <div className="settings__actions">
          <button type="button" className="btn btn--quiet" onClick={() => showEngine('web').catch((err) => toastError(err))}>YouTube Music 웹 화면 열기</button>
          <button type="button" className="btn btn--quiet" onClick={() => showEngine('login').catch((err) => toastError(err))}>다른 계정으로 로그인</button>
          <button type="button" className="btn btn--quiet" onClick={() => showEngine('reload').catch((err) => toastError(err))}>YouTube Music 다시 연결</button>
        </div>
        {version && <p className="field__hint">YTM Desktop {version}</p>}
      </section>
    </div>
  );
}
