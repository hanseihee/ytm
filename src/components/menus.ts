// 곡·카드 우클릭 메뉴 내용.
import { createElement } from 'react';
import { t } from '../i18n';
import * as ytm from '../lib/ytm/client';
import type { Card, Track } from '../lib/ytm/types';
import {
  addTracksToPlaylist,
  enqueue,
  libraryStore,
  playEndpoint,
  playTrack,
  removeTracksFromPlaylist,
  toggleLike,
} from '../state/library';
import { go, routeForBrowse } from '../state/nav';
import { openDialog, toast, toastError, type MenuEntry } from '../state/ui';
import { NewPlaylistDialog } from './Dialogs';

/** "플레이리스트에 추가" 하위 메뉴: 내가 고칠 수 있는 플레이리스트만 YouTube Music에 물어 온다. */
export function addToPlaylistEntry(tracks: Track[]): MenuEntry {
  return {
    label: t('플레이리스트에 추가'),
    submenu: async () => {
      // 자동 목록(좋아요 표시한 음악 LM, Shorts 사운드 SS)은 직접 곡을 넣는 곳이 아니라 뺀다.
      const options = (await ytm.addToPlaylistOptions(tracks.map((track) => track.videoId))).filter((p) => !['LM', 'SS'].includes(p.playlistId));
      const entries: MenuEntry[] = [
        { label: t('새 플레이리스트…'), action: () => openDialog(createElement(NewPlaylistDialog, { tracks })) },
        { label: '', separator: true },
      ];
      if (!options.length) entries.push({ label: t('만든 플레이리스트가 없습니다'), disabled: true });
      for (const p of options) {
        entries.push({
          label: p.contains ? t('{title} (이미 있음)', { title: p.title }) : p.title,
          action: () => addTracksToPlaylist({ playlistId: p.playlistId, title: p.title }, tracks),
        });
      }
      return entries;
    },
  };
}

/** 공유 링크(YouTube Music) */
export const trackUrl = (videoId: string) => `https://music.youtube.com/watch?v=${videoId}`;
export function cardUrl(card: Card): string | undefined {
  const playlistId = card.playlistId ?? (card.browseId?.startsWith('VL') ? card.browseId.slice(2) : undefined);
  if (card.videoId) return trackUrl(card.videoId);
  if (playlistId) return `https://music.youtube.com/playlist?list=${playlistId}`;
  if (card.browseId?.startsWith('UC')) return `https://music.youtube.com/channel/${card.browseId}`;
  if (card.browseId) return `https://music.youtube.com/browse/${card.browseId}`;
  return undefined;
}

export async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast(t('링크를 복사했습니다'));
  } catch (err) {
    toastError(err, t('링크를 복사하지 못했습니다'));
  }
}

export interface TrackMenuContext {
  /** 내가 만든 플레이리스트 화면이면 그 id(곡 빼기 가능) */
  editablePlaylistId?: string;
  onRemoved?: (track: Track) => void;
}

export function trackMenu(track: Track, ctx: TrackMenuContext = {}): MenuEntry[] {
  const liked = libraryStore.get().liked.has(track.videoId);
  const entries: MenuEntry[] = [
    { label: t('재생'), action: () => playTrack(track), disabled: !track.available },
    { label: t('다음에 재생'), action: () => enqueue({ videoId: track.videoId }, track.title, 'next') },
    { label: t('대기열 끝에 추가'), action: () => enqueue({ videoId: track.videoId }, track.title, 'end') },
    { label: t('이 곡으로 믹스 시작'), action: () => playEndpoint({ watchEndpoint: { videoId: track.videoId, playlistId: `RDAMVM${track.videoId}`, params: 'wAEB' } }, t('믹스를 시작')) },
    { label: '', separator: true },
    { label: liked ? t('좋아요 취소') : t('좋아요'), action: () => toggleLike(track) },
    addToPlaylistEntry([track]),
    { label: t('링크 복사'), action: () => copyLink(trackUrl(track.videoId)) },
  ];
  if (ctx.editablePlaylistId && track.setVideoId) {
    const playlistId = ctx.editablePlaylistId;
    entries.push({
      label: t('이 플레이리스트에서 빼기'),
      danger: true,
      action: async () => {
        if (await removeTracksFromPlaylist(playlistId, [track])) ctx.onRemoved?.(track);
      },
    });
  }
  const nav: MenuEntry[] = [];
  if (track.album?.id) nav.push({ label: t('앨범으로 이동'), action: () => go({ name: 'album', id: track.album!.id! }) });
  for (const a of track.artists.filter((x) => x.id).slice(0, 3)) {
    nav.push({ label: t('{name} 페이지로 이동', { name: a.name }), action: () => go(routeForBrowse(a.id!)) });
  }
  if (nav.length) entries.push({ label: '', separator: true }, ...nav);
  return entries;
}

export function cardMenu(card: Card): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const playlistId = card.playlistId ?? (card.browseId?.startsWith('VL') ? card.browseId.slice(2) : undefined);
  if (card.play) entries.push({ label: t('재생'), action: () => playEndpoint(card.play!) });
  if (playlistId && card.kind !== 'artist') {
    entries.push(
      { label: t('셔플 재생'), action: () => playEndpoint({ watchPlaylistEndpoint: { playlistId, params: 'wAEB8gECKAE%3D' } }, t('셔플 재생')) },
      { label: t('다음에 재생'), action: () => enqueue({ playlistId }, card.title, 'next') },
      { label: t('대기열 끝에 추가'), action: () => enqueue({ playlistId }, card.title, 'end') },
    );
  }
  if (card.videoId) {
    entries.push(
      { label: t('다음에 재생'), action: () => enqueue({ videoId: card.videoId }, card.title, 'next') },
      { label: t('대기열 끝에 추가'), action: () => enqueue({ videoId: card.videoId }, card.title, 'end') },
    );
  }
  if (card.browseId) {
    entries.push({ label: '', separator: true }, { label: t('열기'), action: () => go(routeForBrowse(card.browseId!, card.params, card.title)) });
  }
  const url = cardUrl(card);
  if (url) entries.push({ label: t('링크 복사'), action: () => copyLink(url) });
  return entries;
}
