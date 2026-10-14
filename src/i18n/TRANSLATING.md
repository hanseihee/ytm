# 번역 안내

화면 문구는 한국어 원문이 열쇠입니다(`src/i18n/keys.json`: 원문 → 쓰이는 파일).
언어마다 `src/i18n/locales/<언어>.json`에 `{ "원문": "번역" }`으로 적습니다. 빠진 것은 한국어로 보입니다.
`node scripts/i18n-keys.mjs --write`로 목록을 새로 만들고, 빠진 번역·자리표시 문제를 확인합니다.

규칙
- 자리표시 `{이름}`은 이름 그대로 모두 넣습니다. `{title|을}`처럼 `|`가 붙은 것은 한국어 조사 표시이므로 번역에서는 `{title}`로 씁니다(필요하면 그 언어의 따옴표를 둘러도 됩니다).
- 수에 따라 바뀌는 말은 `{n, plural, one {# song} other {# songs}}`처럼 씁니다(`#`이 수). 일본어·중국어·인도네시아어는 필요 없습니다.
- 단추·탭·칩 이름은 짧게. 원문보다 크게 길어지면 화면에서 잘릴 수 있습니다.
- 고유명사: YouTube Music, Spotify, Apple Music, Billboard, LRCLIB, Musixmatch는 그대로. 멜론 → Melon, 지니 → Genie, 벅스 → Bugs, 써클차트 → Circle Chart, FLO·VIBE는 그대로.
- 단축키 표기(⌘-, ⌃⌥M, Ctrl+Alt)는 그대로.
- 맥 메뉴 항목(편집·윈도우 메뉴 등)은 그 언어 macOS의 표준 이름을 씁니다.
- 글자 크기 단추의 '가'는 그 언어의 대표 글자 하나(A, あ, 字)로.
