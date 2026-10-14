import { useState } from 'react';
import { t } from '../i18n';
import { useAsync } from '../lib/useAsync';
import * as ytm from '../lib/ytm/client';
import { lastChartId } from '../lib/spotify';
import { go } from '../state/nav';
import { useLibrary } from '../state/library';
import { ShelfView } from '../components/Cards';
import { ErrorState, LoadMore, Loading } from './common';

export function HomeView() {
  const account = useLibrary((s) => s.account);
  const home = useAsync('home', () => ytm.home());
  const [busy, setBusy] = useState(false);

  const more = async () => {
    const c = home.data?.continuation;
    if (!c || busy) return;
    setBusy(true);
    try {
      const page = await ytm.homeMore(c);
      home.setData((prev) => ({ shelves: [...prev.shelves, ...page.shelves], continuation: page.continuation }));
    } catch (err) {
      console.warn('[home] 더 불러오기 실패', err);
      home.setData((prev) => ({ ...prev, continuation: undefined }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="home-head">
        <h1 className="home-head__title">{account ? t('{name}님을 위한 음악', { name: account.name }) : t('홈')}</h1>
        <button type="button" className="chart-chip" onClick={() => go({ name: 'spotify', id: lastChartId() })}>
          <span className="chart-chip__rank">100</span>
          <span>
            <b>{t('인기 차트')}</b>
            <small>{t('멜론 TOP 100과 Spotify 20개 나라 Top 50을 YouTube Music으로')}</small>
          </span>
        </button>
      </header>
      {home.loading && !home.data ? (
        <Loading />
      ) : home.error ? (
        <ErrorState message={home.error} onRetry={home.reload} />
      ) : (
        <>
          {home.data?.shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={s} trackLimit={8} />)}
          {home.data?.continuation && <LoadMore onReach={more} busy={busy} />}
        </>
      )}
    </div>
  );
}
