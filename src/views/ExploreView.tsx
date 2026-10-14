// 둘러보기: 분위기·장르 단추, 최신 음악, YouTube Music 차트(나라 고르기).
import { useState, type CSSProperties } from 'react';
import { useAsync } from '../lib/useAsync';
import * as ytm from '../lib/ytm/client';
import { go } from '../state/nav';
import { ShelfView } from '../components/Cards';
import { ErrorState, Loading } from './common';

/** YouTube Music 차트 나라(ISO 코드, 전 세계는 ZZ) */
export const YTM_CHART_COUNTRIES: { code: string; label: string }[] = [
  { code: 'KR', label: '한국' },
  { code: 'ZZ', label: '전 세계' },
  { code: 'US', label: '미국' },
  { code: 'JP', label: '일본' },
  { code: 'GB', label: '영국' },
  { code: 'FR', label: '프랑스' },
  { code: 'DE', label: '독일' },
  { code: 'CA', label: '캐나다' },
  { code: 'AU', label: '호주' },
  { code: 'BR', label: '브라질' },
  { code: 'MX', label: '멕시코' },
  { code: 'IN', label: '인도' },
  { code: 'ID', label: '인도네시아' },
  { code: 'PH', label: '필리핀' },
];

const COUNTRY_KEY = 'ytm-desktop:ytm-chart-country';
function loadCountry() {
  try {
    const v = localStorage.getItem(COUNTRY_KEY);
    return v && YTM_CHART_COUNTRIES.some((c) => c.code === v) ? v : 'KR';
  } catch {
    return 'KR';
  }
}

export function ExploreView() {
  const moods = useAsync('moods', () => ytm.moods());
  const releases = useAsync('new-releases', () => ytm.newReleases());
  const [country, setCountry] = useState(loadCountry);
  const charts = useAsync(`ytm-charts:${country}`, () => ytm.ytmCharts(country));

  const pick = (code: string) => {
    setCountry(code);
    try {
      localStorage.setItem(COUNTRY_KEY, code);
    } catch {
      // 기억 못 해도 된다.
    }
  };

  return (
    <div className="page">
      <header className="page__head">
        <h1 className="page__title">둘러보기</h1>
      </header>

      <section className="shelf">
        <h2 className="shelf__title">분위기 및 장르</h2>
        {moods.loading && !moods.data ? (
          <Loading />
        ) : moods.error ? (
          <ErrorState message={moods.error} onRetry={moods.reload} />
        ) : (
          moods.data?.sections.map((s) => (
            <div key={s.title} className="moods">
              {moods.data!.sections.length > 1 && <h3 className="moods__title">{s.title}</h3>}
              <div className="moods__grid">
                {s.items.map((m) => (
                  <button
                    key={m.params ?? m.label}
                    type="button"
                    className="mood"
                    style={{ '--mood': m.color ?? 'var(--rose)' } as CSSProperties}
                    onClick={() => m.params && go({ name: 'mood', params: m.params, title: m.label })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="shelf">
        <header className="shelf__head">
          <h2 className="shelf__title">YouTube Music 차트</h2>
        </header>
        <div className="chips" role="radiogroup" aria-label="차트 나라">
          {YTM_CHART_COUNTRIES.map((c) => (
            <button key={c.code} type="button" role="radio" aria-checked={c.code === country} className={`chip${c.code === country ? ' is-on' : ''}`} onClick={() => pick(c.code)}>
              {c.label}
            </button>
          ))}
        </div>
        {charts.loading && !charts.data ? (
          <Loading />
        ) : charts.error ? (
          <ErrorState message={charts.error} onRetry={charts.reload} />
        ) : (
          charts.data?.shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={s} trackLimit={10} />)
        )}
      </section>

      {releases.loading && !releases.data ? (
        <Loading />
      ) : releases.error ? (
        <ErrorState message={releases.error} onRetry={releases.reload} />
      ) : (
        releases.data?.shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={{ ...s, title: s.title || '최신 음악' }} />)
      )}
    </div>
  );
}

export function MoodView({ params, title }: { params: string; title: string }) {
  const res = useAsync(`mood:${params}`, () => ytm.moodCategory(params));
  if (res.loading && !res.data) return <div className="page"><Loading /></div>;
  if (res.error) return <div className="page"><ErrorState message={res.error} onRetry={res.reload} /></div>;
  const data = res.data;
  if (!data) return null;
  return (
    <div className="page">
      <header className="page__head">
        <h1 className="page__title">{data.title || title}</h1>
      </header>
      {data.shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={s} />)}
    </div>
  );
}
