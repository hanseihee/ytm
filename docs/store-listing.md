# Microsoft Store 등록 정보 초안

Partner Center → YTMusic(제품 ID 9NSGBJ9R0WSJ, https://apps.microsoft.com/detail/9NSGBJ9R0WSJ) → 제출 → Store 목록(한국어·English)에 넣을 글. 언어는 MSIX 설명 파일(src-tauri/msix/AppxManifest.xml)의 ko-KR·en-US와 맞춘다.

## 공통 값

| 항목 | 값 |
|---|---|
| 범주 | 음악 |
| 가격 | 무료 |
| 개인정보 처리방침 URL | https://github.com/hanseihee/ytm/blob/main/docs/PRIVACY.md |
| 웹 사이트 | https://github.com/hanseihee/ytm |
| 지원 연락처 | https://github.com/hanseihee/ytm/issues |
| 저작권 | © 2026 hanseihee |
| 제한된 기능(runFullTrust) 사유 | Win32 데스크톱 앱(Tauri)이라 전체 신뢰로 실행해야 합니다. 창·트레이·전역 단축키·미디어 키(SMTC)를 씁니다. / This is a Win32 desktop app (Tauri) that needs full trust for its windows, tray icon, global shortcuts and media keys (SMTC). |

## 한국어

**설명**

YTMusic은 내 YouTube Music 계정으로 쓰는 비공식 데스크톱 음악 플레이어입니다. 화면은 처음부터 새로 만든 플레이어이고, 소리는 숨은 창에서 공식 YouTube Music 웹 플레이어가 그대로 냅니다. 광고 차단·음원 다운로드·유료 기능 우회는 없습니다.

- 검색·홈·둘러보기·보관함: 노래·앨범·아티스트·플레이리스트, 플레이리스트 만들기·편집·순서 바꾸기
- 가사: 지금 줄을 따라가는 시간 맞춤 가사, 글자 크기·싱크 조절, 큰 앨범 표지와 음악에 맞춰 움직이는 스펙트럼
- 전체 화면 모드: 흐린 표지 배경 위 큰 표지·제목·위로 굴러 올라가는 가사, 모니터에 틀어 두기 좋게
- 76개 차트: 멜론·지니·벅스·FLO·VIBE·써클차트·Spotify·빌보드·Apple Music 곡을 YouTube Music 곡과 자동으로 맞춰 바로 재생, 내 플레이리스트로 저장
- 10밴드 이퀄라이저, 수면 타이머, 미니 플레이어, 들은 기록 통계
- 테마 9가지(지금 곡 표지 색을 따라가는 앨범 색 포함), 10개 언어
- 윈도우 미디어 키·미디어 제어(SMTC), 트레이, 전역 단축키

YouTube Music 계정이 필요합니다. Google·YouTube와 관계가 없는 앱입니다.

**제품 기능**(한 줄씩)
- 내 YouTube Music 계정으로 검색·재생·보관함 관리
- 지금 줄을 따라가는 시간 맞춤 가사
- 모니터에 틀어 두는 전체 화면 모드
- 76개 음악 차트를 YouTube Music 곡으로 바로 재생
- 10밴드 이퀄라이저와 음악에 맞춰 움직이는 스펙트럼
- 앨범 색을 따라가는 테마
- 미니 플레이어·수면 타이머·들은 기록 통계
- 미디어 키와 전역 단축키

**검색어**: YouTube Music, 음악 플레이어, 가사, 멜론 차트, 이퀄라이저, 플레이리스트, 데스크톱

## English

**Description**

YTMusic is an unofficial desktop music player for your own YouTube Music account. The screens are a player built from scratch; the sound comes from the official YouTube Music web player running in a hidden window. There is no ad blocking, audio downloading, or bypassing of paid features.

- Search, Home, Explore and Library: songs, albums, artists and playlists; create, edit and reorder playlists
- Lyrics: time-synced lyrics that follow the current line, adjustable size and sync, a large album cover with a spectrum that moves with the music
- Full screen mode: large cover, title and smoothly rolling lyrics over a blurred cover background — made for leaving on a monitor
- 76 charts: Melon, Genie, Bugs, FLO, VIBE, Circle Chart, Spotify, Billboard and Apple Music, matched to YouTube Music tracks automatically; play right away or save as your playlist
- 10-band equalizer, sleep timer, mini player and listening stats
- 9 themes (including album colors that follow the current cover) and 10 languages
- Windows media keys and media controls (SMTC), tray icon and global shortcuts

Requires a YouTube Music account. This app is not affiliated with Google or YouTube.

**Product features**
- Search, play and manage your library with your YouTube Music account
- Time-synced lyrics that follow the current line
- Full screen mode made for leaving on a monitor
- Play 76 music charts as YouTube Music tracks
- 10-band equalizer with a live spectrum
- Themes that follow the album colors
- Mini player, sleep timer and listening stats
- Media keys and global shortcuts

**Search terms**: YouTube Music, music player, lyrics, charts, equalizer, playlist, desktop

## 스크린샷

데스크톱 스크린샷은 1366×768 이상 PNG. 윈도우에서 YTMusic 이름이 보이는 화면으로 새로 찍어야 한다(docs/screenshot-desktop.png는 예전 이름이 보인다).

## 연령 등급(IARC) 답

결과: Microsoft Store 12세 이상, IARC 12+, ESRB Teen, PEGI 보호자 동반 권장, USK 12, 브라질 16, 러시아 18+.
YouTube Music의 뮤직비디오·가사(사용자가 아닌 카탈로그 콘텐츠)에 들어 있을 수 있는 것을 기준으로 답했다.

- 앱 유형: 다른 모든 앱 유형 / 심의 기관 등급·실물 매체: 아니요
- 앱 패키지 안 등급 관련 콘텐츠: 아니요 / 사용자끼리 상호 작용·교환: 아니요(댓글은 읽기만)
- 다운로드 뒤 접근하는 콘텐츠 제공: 예
- 폭력: 예 — 주된 목적 아님, 시각적 묘사 예, 잔혹 묘사 아니요, 만화로만 한정 아니요, 문구 예
- 성적 내용: 예 — 주된 목적 아님, 시각적 묘사 예, 노출 아니요, 음란물 아니요, 문구 예
- 비속어: 예 — 중심 아님, 가벼운 비속어 예, 절제된 욕설 예, 차별적 언어 예, 성적 비속어 예
- 약물: 예 — 중심 아님, 시각적 묘사 예, 문구 예
- 연령 제한 상품 홍보·위치 공유·디지털 상품 구매·현금 보상/NFT·브라우저·뉴스/교육: 모두 아니요
