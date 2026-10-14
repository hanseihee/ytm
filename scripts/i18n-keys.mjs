#!/usr/bin/env node
// 번역할 문구 모으기·점검: node scripts/i18n-keys.mjs [--write]
// src/ 안의 t('…')·tk('…')(그리고 src/i18n/rust.ts의 Rust 메뉴 문구)를 모아 src/i18n/keys.json에 쓰고,
// 언어마다 빠진 번역·쓰지 않는 번역 수를 알려 준다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
};
walk(path.join(root, 'src'));

const keys = new Map();
const re = /\bt[k]?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) {
    if (m[1] === '`' && m[2].includes('${')) {
      console.warn(`템플릿 안에 \${}가 있어 번역 열쇠가 될 수 없습니다: ${path.relative(root, f)}: ${m[2].slice(0, 40)}`);
      continue;
    }
    const key = m[2].replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
    if (!/[가-힣]/.test(key)) continue;
    const at = path.relative(root, f);
    if (!keys.has(key)) keys.set(key, new Set());
    keys.get(key).add(at);
  }
}
const list = [...keys.keys()].sort((a, b) => a.localeCompare(b, 'ko'));
if (process.argv.includes('--write')) {
  fs.writeFileSync(
    path.join(root, 'src/i18n/keys.json'),
    `${JSON.stringify(Object.fromEntries(list.map((k) => [k, [...keys.get(k)].sort()])), null, 2)}\n`,
  );
}
console.log(`문구 ${list.length}개`);
const dir = path.join(root, 'src/i18n/locales');
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
  const table = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  const missing = list.filter((k) => !(k in table));
  const unused = Object.keys(table).filter((k) => !keys.has(k));
  // 자리표시({name})가 번역에 다 들어 있는지
  const broken = list.filter((k) => k in table).filter((k) => {
    const want = [...k.matchAll(/\{(\w+)/g)].map((m) => m[1]);
    return want.some((w) => !new RegExp(`\\{${w}\\b`).test(table[k]));
  });
  console.log(`${name.padEnd(11)} 빠짐 ${String(missing.length).padStart(4)}  안 씀 ${String(unused.length).padStart(4)}  자리표시 문제 ${broken.length}`);
  if (process.argv.includes('--verbose')) {
    for (const k of broken) console.log(`   자리표시: ${k} → ${table[k]}`);
  }
}
