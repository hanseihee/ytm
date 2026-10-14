// Apple Music 나라별 인기곡(Top Songs, 매일 갱신).
// 2026-10-14 확인: 공개 RSS JSON rss.applemarketingtools.com/api/v2/{나라}/music/most-played/100/songs.json
// → { feed: { title: "인기곡", updated: "Wed, 14 Oct 2026 06:53:43 +0000",
//    results: [{ id, name, artistName, artworkUrl100(…/100x100bb.jpg, 크기 숫자를 바꿔 큰 표지), contentAdvisoryRating: "Explict" }] } }.
// 앨범 이름·곡 길이는 없다. 2026-10-14 미국·캐나다·대만·인도 주소가 처음엔 502/504(Gateway)를 냈다가 다시 받으면 됐다 → 앱은 한 번 더 시도하는 게 좋다.
import { clean, formatChanged, json, type ChartPlaylist, type ChartTrack } from './util';

export interface AppleCountry {
  code: string;
  label: string;
}

/** Spotify 나라별 차트(spotify.ts CHARTS)와 같은 나라들. 2026-10-14 모두 받아 봄 */
export const APPLE_COUNTRIES: AppleCountry[] = [
  { code: 'kr', label: '한국' },
  { code: 'us', label: '미국' },
  { code: 'jp', label: '일본' },
  { code: 'gb', label: '영국' },
  { code: 'fr', label: '프랑스' },
  { code: 'de', label: '독일' },
  { code: 'es', label: '스페인' },
  { code: 'it', label: '이탈리아' },
  { code: 'se', label: '스웨덴' },
  { code: 'ca', label: '캐나다' },
  { code: 'br', label: '브라질' },
  { code: 'mx', label: '멕시코' },
  { code: 'au', label: '호주' },
  { code: 'tw', label: '대만' },
  { code: 'th', label: '태국' },
  { code: 'vn', label: '베트남' },
  { code: 'id', label: '인도네시아' },
  { code: 'ph', label: '필리핀' },
  { code: 'in', label: '인도' },
];

export const appleChartId = (country: string) => `apple-${country}`;

export const appleTopSongsUrl = (country: string, limit = 100) =>
  `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/${limit}/songs.json`;

interface AppleSong {
  id: string;
  name: string;
  artistName?: string;
  artworkUrl100?: string;
  contentAdvisoryRating?: string;
}
interface AppleFeed {
  feed?: { title?: string; updated?: string; results?: AppleSong[] };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** 표지 크기 바꾸기: …/100x100bb.jpg → …/600x600bb.jpg */
const artwork = (url: string | undefined, size: number) => url?.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);

export function parseAppleTopSongs(text: string, country: string): ChartPlaylist {
  const feed = json<AppleFeed>(text, 'apple').feed;
  const list = feed?.results;
  if (!Array.isArray(list)) formatChanged('apple');
  const tracks: ChartTrack[] = list
    .filter((r) => r && r.id && r.name)
    .map((r) => ({
      id: `apple-${r.id}`,
      title: clean(r.name),
      artists: clean(r.artistName),
      durationMs: 0,
      // Apple 피드는 "Explict"로 잘못 적혀 온다.
      explicit: /^expli/i.test(r.contentAdvisoryRating ?? ''),
      cover: artwork(r.artworkUrl100, 200),
    }));
  if (!tracks.length) formatChanged('apple');
  const label = APPLE_COUNTRIES.find((c) => c.code === country)?.label ?? country.toUpperCase();
  const d = feed?.updated?.match(/(\d{1,2}) ([A-Za-z]{3}) (\d{4})/);
  const month = d ? MONTHS.indexOf(d[2].toLowerCase()) + 1 : 0;
  return {
    id: appleChartId(country),
    name: `Apple Music ${label} 인기곡`,
    subtitle: d && month ? `${d[3]}.${String(month).padStart(2, '0')}.${d[1].padStart(2, '0')} 업데이트` : 'Apple Music',
    cover: artwork(list[0]?.artworkUrl100, 600),
    tracks,
  };
}
