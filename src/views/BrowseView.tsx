// "모두 보기"로 여는 일반 목록(아티스트 음반 목록, 인기곡 전체 등)
import { t } from '../i18n';
import { useAsync } from '../lib/useAsync';
import * as ytm from '../lib/ytm/client';
import { ShelfView } from '../components/Cards';
import { Empty, ErrorState, Loading } from './common';

export function BrowseView({ id, params, title }: { id: string; params?: string; title?: string }) {
  const res = useAsync(`browse:${id}:${params ?? ''}`, () => ytm.browse(id, params));
  if (res.loading && !res.data) return <div className="page"><Loading /></div>;
  if (res.error) return <div className="page"><ErrorState message={res.error} onRetry={res.reload} /></div>;
  const data = res.data;
  if (!data) return null;
  return (
    <div className="page">
      <header className="page__head">
        <h1 className="page__title">{data.title || title || t('목록')}</h1>
      </header>
      {data.shelves.length === 0 ? (
        <Empty title={t('보여 줄 항목이 없습니다')} />
      ) : (
        data.shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={{ ...s, title: data.shelves.length > 1 ? s.title : '' }} grid />)
      )}
    </div>
  );
}
