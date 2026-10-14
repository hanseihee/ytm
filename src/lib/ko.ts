// 한국어 조사: 마지막 글자 받침에 맞춰 붙인다. 한글이 아니면 두 가지를 함께 적는다.

function hasBatchim(word: string): boolean | undefined {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(last)) return '013678'.includes(last); // 영,일,삼,육,칠,팔
  return undefined;
}

/** '밤편지'를 / 'Celebrity'을(를) */
export function obj(title: string): string {
  const b = hasBatchim(title);
  return `'${title}'${b === undefined ? '을(를)' : b ? '을' : '를'}`;
}

/** '밤편지'에 */
export const quote = (title: string) => `'${title}'`;
