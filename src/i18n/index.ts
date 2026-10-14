// 화면 문구 번역. 한국어 문구를 그대로 열쇠로 쓴다(gettext 방식): t('보관함') → 'Library'.
// 데스크톱 화면과 iOS 데이터 묶음(JavaScriptCore)이 함께 쓰므로 React에 기대지 않는다(React 훅은 ./react.ts).
//
// 문구 안 자리표시:
// - {name}            값을 그대로 넣는다.
// - {name|을}         한국어에서만 '값'을/를처럼 따옴표와 조사를 붙인다(을·이·은·와·로). 다른 언어 번역은 {name}으로 쓴다.
// - {n, plural, one {# song} other {# songs}}   수에 따라 고른다(Intl.PluralRules, #은 수).
// 번역이 없으면 한국어 문구를 그대로 보여 준다.
// 같은 한국어가 다른 뜻으로 쓰이면 열쇠 뒤에 '@뜻'을 붙여 나눈다: '구독@보관함 탭' → 한국어는 '구독', 영어는 'Subscriptions'.
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import id from './locales/id.json';
import ja from './locales/ja.json';
import ptBR from './locales/pt-BR.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';

export type Lang = 'ko' | 'en' | 'ja' | 'zh-CN' | 'zh-TW' | 'es' | 'pt-BR' | 'fr' | 'de' | 'id';
export type LangSetting = Lang | 'system';

/** 설정 화면 목록(각 언어 자기 이름) */
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'zh-CN', label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'es', label: 'Español' },
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'id', label: 'Bahasa Indonesia' },
];

const TABLES: Record<Exclude<Lang, 'ko'>, Record<string, string>> = {
  en,
  ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  es,
  'pt-BR': ptBR,
  fr,
  de,
  id,
};

const SETTING_KEY = 'ytm-desktop:lang';

/** 브라우저(운영체제) 언어 → 지원하는 언어. 모르는 언어는 영어. */
export function detectLang(tags: readonly string[]): Lang {
  for (const raw of tags) {
    const tag = raw.toLowerCase();
    if (tag.startsWith('ko')) return 'ko';
    if (tag.startsWith('ja')) return 'ja';
    if (tag.startsWith('zh')) return /hant|tw|hk|mo/.test(tag) ? 'zh-TW' : 'zh-CN';
    if (tag.startsWith('es')) return 'es';
    if (tag.startsWith('pt')) return 'pt-BR';
    if (tag.startsWith('fr')) return 'fr';
    if (tag.startsWith('de')) return 'de';
    if (tag.startsWith('id') || tag.startsWith('in') || tag.startsWith('ms')) return 'id';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

const systemTags = (): readonly string[] => {
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
  return nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : ['en'];
};

function loadSetting(): LangSetting {
  try {
    const v = globalThis.localStorage?.getItem(SETTING_KEY);
    return v === 'system' || LANGS.some((l) => l.id === v) ? (v as LangSetting) : 'system';
  } catch {
    return 'system';
  }
}

let setting: LangSetting = loadSetting();
let current: Lang = setting === 'system' ? detectLang(systemTags()) : setting;
const listeners = new Set<() => void>();

// 다른 창(미니 플레이어)에서 언어를 바꾸면 이 창도 따라간다.
(globalThis as { addEventListener?: (type: string, fn: (e: { key?: string | null }) => void) => void }).addEventListener?.('storage', (e) => {
  if (e.key !== SETTING_KEY) return;
  setting = loadSetting();
  apply(setting === 'system' ? detectLang(systemTags()) : setting);
});

export const getLang = (): Lang => current;
export const getLangSetting = (): LangSetting => setting;

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function apply(next: Lang) {
  current = next;
  const doc = (globalThis as { document?: { documentElement?: { lang: string } } }).document;
  if (doc?.documentElement) doc.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

/** 설정 화면에서 고른 언어(system이면 운영체제 언어를 따른다). 다음 실행에도 쓴다. */
export function setLangSetting(next: LangSetting) {
  setting = next;
  try {
    globalThis.localStorage?.setItem(SETTING_KEY, next);
  } catch {
    // 저장하지 못해도 이번 실행에는 적용된다.
  }
  apply(next === 'system' ? detectLang(systemTags()) : next);
}

/** iOS 앱이 정한 언어를 그대로 쓴다(저장하지 않는다). */
export function setLang(next: string) {
  apply(LANGS.some((l) => l.id === next) ? (next as Lang) : detectLang([next]));
}

// ── 문구 만들기 ────────────────────────────────────────────────────────────

function hasBatchim(word: string): boolean | undefined {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(last)) return '013678'.includes(last); // 영,일,삼,육,칠,팔
  return undefined;
}

/** 받침에 맞는 조사: [받침 있을 때, 없을 때] */
const PARTICLES: Record<string, [string, string]> = {
  을: ['을', '를'],
  이: ['이', '가'],
  은: ['은', '는'],
  와: ['과', '와'],
  로: ['으로', '로'],
};

function particle(value: string, kind: string): string {
  const pair = PARTICLES[kind];
  if (!pair) return `'${value}'`;
  const b = hasBatchim(value);
  // 로: ㄹ 받침이면 '로'
  const last = value.trim().slice(-1).charCodeAt(0);
  const rieul = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 === 8;
  const suffix = b === undefined ? `${pair[0]}(${pair[1]})` : kind === '로' && rieul ? '로' : b ? pair[0] : pair[1];
  return `'${value}'${suffix}`;
}

type Params = Record<string, string | number | undefined>;

const pluralRules = new Map<Lang, Intl.PluralRules>();
function pluralCategory(n: number): string {
  let rules = pluralRules.get(current);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(current);
    } catch {
      rules = new Intl.PluralRules('en');
    }
    pluralRules.set(current, rules);
  }
  return rules.select(n);
}

function format(template: string, params?: Params): string {
  if (!params) return template;
  // {n, plural, one {…} other {…}}
  let out = template.replace(/\{(\w+), plural,((?:\s*\w+\s*\{[^{}]*\})+)\s*\}/g, (_, name: string, body: string) => {
    const n = Number(params[name] ?? 0);
    const branches = new Map<string, string>();
    for (const m of body.matchAll(/(\w+)\s*\{([^{}]*)\}/g)) branches.set(m[1], m[2]);
    const text = branches.get(`=${n}`) ?? branches.get(pluralCategory(n)) ?? branches.get('other') ?? '';
    return text.replace(/#/g, String(n));
  });
  out = out.replace(/\{(\w+)(?:\|([^}]+))?\}/g, (m, name: string, mod?: string) => {
    if (!(name in params)) return m;
    const value = String(params[name] ?? '');
    return mod && current === 'ko' ? particle(value, mod) : mod ? `“${value}”` : value;
  });
  return out;
}

/** 번역된 문구. key는 한국어 원문. */
export function t(key: string, params?: Params): string {
  const table = current === 'ko' ? undefined : TABLES[current];
  const text = table?.[key];
  // 번역이 없으면 한국어 원문(조사 표시 포함, '@뜻' 꼬리는 뗀다)으로 만든다.
  if (text === undefined) return formatKo(stripContext(key), params);
  return format(text, params);
}

/** '구독@탭' → '구독' */
const stripContext = (key: string) => {
  const at = key.lastIndexOf('@');
  return at > 0 ? key.slice(0, at) : key;
};

function formatKo(key: string, params?: Params): string {
  const saved = current;
  current = 'ko';
  try {
    return format(key, params);
  } finally {
    current = saved;
  }
}

/** 지금 언어의 숫자·날짜 표기 */
export const locale = (): string => current;

/**
 * 번역할 한국어 문구를 상수(목록 이름 등)에 담을 때 표시만 한다(값은 그대로).
 * 화면에 그릴 때 t(그 값)으로 바꾼다. 모듈을 읽을 때 t()를 부르면 언어를 바꿔도 그대로 남기 때문이다.
 * scripts/i18n-keys.mjs가 t('…')·tk('…')를 모아 번역 목록을 만든다.
 */
export const tk = (key: string): string => key;
