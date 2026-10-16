// 목록 안에서 찾기(곡 제목·아티스트·앨범). 화면과 무관한 순수 함수.
// - 띄어쓰기로 나눈 낱말이 모두 들어 있으면 맞는 것으로 본다(순서 무관, 대소문자 무시).
// - 띄어쓰기가 달라도 찾는다("밤 편지" ↔ "밤편지").
// - 한글 초성만 쓰면 초성끼리 비교한다("ㅂㅍㅈ" → 밤편지).
// NFKC는 호환 자모(ㄱ)를 조합용 자모(ᄀ)로 바꿔 초성 비교를 깨뜨리므로 NFC만 쓴다.

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

const normalize = (s: string) => s.normalize('NFC').toLowerCase();

/** 찾는 글을 낱말 목록으로(빈 글이면 빈 목록) */
export function searchTerms(input: string): string[] {
  return normalize(input).split(/\s+/).filter(Boolean);
}

const onlyChoseong = (term: string) => /^[ㄱ-ㅎ]+$/.test(term);

function choseongOf(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out += code >= 0xac00 && code <= 0xd7a3 ? CHOSEONG[Math.floor((code - 0xac00) / 588)] : ch;
  }
  return out;
}

export function matchesTerms(text: string, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = normalize(text);
  const compact = hay.replace(/\s+/g, '');
  let initials: string | undefined;
  return terms.every((term) => {
    if (hay.includes(term) || compact.includes(term)) return true;
    if (!onlyChoseong(term)) return false;
    initials ??= choseongOf(compact);
    return initials.includes(term);
  });
}
