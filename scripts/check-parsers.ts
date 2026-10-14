// 받아 둔 InnerTube 응답(JSON)으로 해석기를 점검한다.
// 사용: npm run check:parsers -- <응답 폴더>
// 폴더 안 파일 이름: search*.json, suggest.json, home.json, album.json, artist.json, playlist*.json, liked.json, next.json, lyrics.json, library_playlists.json, add_to_playlist.json
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lyricsBrowseId,
  parseAddToPlaylist,
  parseAlbum,
  parseArtist,
  parseHome,
  parseLibraryPlaylists,
  parseLyrics,
  parsePlaylist,
  parseSearch,
  parseSuggestions,
  parseWatchNextQueue,
} from '../src/lib/ytm/parse';
import type { Card, Shelf, Track } from '../src/lib/ytm/types';

const dir = process.argv[2];
if (!dir) {
  console.error('응답 폴더를 지정하세요');
  process.exit(1);
}

const load = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const t = (x: Track) =>
  `${x.available ? ' ' : '✕'} ${x.title} — ${x.artists.map((a) => a.name + (a.id ? '' : '?')).join(', ')}${x.album ? ` [${x.album.name}]` : ''} ${x.duration ?? '-'}s${x.isVideo ? ' (영상)' : ''}${x.setVideoId ? ' set' : ''}`;
const c = (x: Card) => `${x.kind}: ${x.title} / ${x.subtitle} ${x.browseId ?? x.videoId ?? ''}${x.thumbnail ? '' : ' (썸네일 없음)'}`;
const shelf = (s: Shelf) => {
  console.log(`  ▸ ${s.title || '(제목 없음)'} 곡 ${s.tracks.length}, 카드 ${s.cards.length}${s.more ? ` 더보기=${s.more.browseId}` : ''}${s.continuation ? ` 이어받기(${s.continuation.style})` : ''}`);
  s.tracks.slice(0, 3).forEach((x) => console.log('     ', t(x)));
  s.cards.slice(0, 3).forEach((x) => console.log('     ', c(x)));
};

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const data = load(file);
  console.log(`\n== ${file}`);
  try {
    if (file.startsWith('search')) {
      const r = parseSearch(data);
      console.log('  칩:', r.chips.map((x) => `${x.label}${x.selected ? '*' : ''}`).join(', '));
      if (r.top) console.log('  최상위:', r.top.card ? c(r.top.card) : r.top.track ? t(r.top.track) : '-', `곡 ${r.top.tracks.length}`);
      r.shelves.forEach(shelf);
    } else if (file.startsWith('suggest')) {
      const r = parseSuggestions(data);
      console.log('  검색어:', r.queries.join(' | '));
      r.tracks.slice(0, 3).forEach((x) => console.log('   ', t(x)));
      r.cards.slice(0, 3).forEach((x) => console.log('   ', c(x)));
    } else if (file.startsWith('home')) {
      const r = parseHome(data);
      console.log(`  묶음 ${r.shelves.length}, 이어받기 ${r.continuation ? r.continuation.style : '없음'}`);
      r.shelves.forEach(shelf);
    } else if (file.startsWith('album')) {
      const r = parseAlbum(data, 'MPREb_test');
      console.log('  머리글:', JSON.stringify({ ...r.header, description: r.header.description?.slice(0, 40) }));
      r.tracks.slice(0, 5).forEach((x) => console.log('   ', t(x), JSON.stringify(x.play).slice(0, 120)));
      r.shelves.forEach(shelf);
    } else if (file.startsWith('artist')) {
      const r = parseArtist(data);
      console.log('  ', r.name, r.subscribers, r.thumbnail ? '사진 있음' : '사진 없음', r.shuffle ? '셔플' : '', r.radio ? '라디오' : '');
      r.shelves.forEach(shelf);
    } else if (file.startsWith('playlist') || file.startsWith('liked')) {
      const r = parsePlaylist(data);
      console.log('  머리글:', JSON.stringify({ ...r.header, description: r.header.description?.slice(0, 40) }));
      console.log(`  곡 ${r.tracks.length}, 이어받기 ${r.continuation ? r.continuation.style : '없음'}`);
      r.tracks.slice(0, 5).forEach((x) => console.log('   ', t(x), JSON.stringify(x.play).slice(0, 140)));
    } else if (file.startsWith('next')) {
      console.log('  가사 id:', lyricsBrowseId(data));
      parseWatchNextQueue(data).slice(0, 5).forEach((x) => console.log('   ', t(x)));
    } else if (file.startsWith('lyrics')) {
      const r = parseLyrics(data);
      console.log('  ', r ? `${r.text.slice(0, 60).replace(/\n/g, ' / ')} … (${r.source})` : '가사 없음');
    } else if (file.startsWith('library_playlists')) {
      const r = parseLibraryPlaylists(data);
      console.log(`  플레이리스트 ${r.cards.length}`);
      r.cards.slice(0, 6).forEach((x) => console.log('   ', c(x)));
    } else if (file.startsWith('add_to_playlist')) {
      parseAddToPlaylist(data).forEach((x) => console.log('   ', x.title, x.playlistId, x.contains ? '(이미 있음)' : ''));
    }
  } catch (err) {
    console.log('  !! 해석 실패', err);
  }
}
