import { useState, type CSSProperties } from 'react';
import { t } from '../i18n';
import { useAsync } from '../lib/useAsync';
import * as ytm from '../lib/ytm/client';
import { playEndpoint } from '../state/library';
import { toast, toastError } from '../state/ui';
import { ShelfView } from '../components/Cards';
import { Icon } from '../components/Icon';
import { ErrorState, Loading } from './common';

function SubscribeButton({ channelId, name, initial, params }: { channelId: string; name: string; initial: boolean; params?: string }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await ytm.setSubscribed(channelId, !on, params);
      setOn(!on);
      toast(on ? t('{name} 구독을 취소했습니다', { name }) : t('{name}을(를) 구독했습니다', { name }));
    } catch (err) {
      toastError(err, t('구독을 바꾸지 못했습니다'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={`btn btn--quiet${on ? ' is-on' : ''}`} aria-pressed={on} disabled={busy} onClick={toggle}>
      <Icon name="bell" size={17} /> {on ? t('구독 중') : t('구독')}
    </button>
  );
}

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
              <button type="button" className="btn btn--primary btn--play" onClick={() => playEndpoint(a.shuffle!, t('셔플 재생'))}>
                <Icon name="shuffle" size={17} /> {t('셔플 재생')}
              </button>
            )}
            {a.radio && (
              <button type="button" className="btn btn--quiet" onClick={() => playEndpoint(a.radio!, t('라디오를 시작'))}>
                <Icon name="radio" size={17} /> {t('라디오')}
              </button>
            )}
            {a.channelId && <SubscribeButton key={a.channelId} channelId={a.channelId} name={a.name} initial={!!a.subscribed} params={a.subscribeParams} />}
          </div>
        </div>
      </header>
      <div className="page__inner">
        {a.shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={s} trackLimit={5} />)}
        {a.description && (
          <section className="shelf">
            <h2 className="shelf__title">{t('소개')}</h2>
            <p className="about">{a.description}</p>
          </section>
        )}
      </div>
    </div>
  );
}
