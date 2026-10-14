#!/usr/bin/env node
// 버전 한 번에 바꾸기: npm run version:set -- 0.3.0
// 데스크톱(package.json·package-lock.json·tauri.conf.json·Cargo.toml·Cargo.lock)과 iOS(project.yml)의 버전을 맞추고,
// iOS 빌드 번호(CURRENT_PROJECT_VERSION)를 1 올리고, CHANGELOG.md에 새 버전 칸이 없으면 만든다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('사용법: npm run version:set -- <버전>   (예: 0.3.0)');
  process.exit(1);
}

const file = (p) => path.join(root, p);
const edit = (p, fn) => {
  const before = fs.readFileSync(file(p), 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`${p}: 바꿀 버전을 찾지 못했습니다`);
  fs.writeFileSync(file(p), after);
  console.log(`  ${p}`);
};

console.log(`버전을 ${version}(으)로 바꿉니다:`);

edit('package.json', (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));

// package-lock.json: 맨 위 version과 packages[""].version
edit('package-lock.json', (s) => {
  const lock = JSON.parse(s);
  lock.version = version;
  if (lock.packages && lock.packages['']) lock.packages[''].version = version;
  return `${JSON.stringify(lock, null, 2)}\n`;
});

edit('src-tauri/tauri.conf.json', (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));

// Cargo.toml: [package]의 첫 version 줄만
edit('src-tauri/Cargo.toml', (s) => s.replace(/^(version\s*=\s*")[^"]+(")/m, `$1${version}$2`));

// Cargo.lock: name = "ytm-desktop" 바로 아래 version
edit('src-tauri/Cargo.lock', (s) => s.replace(/(name = "ytm-desktop"\nversion = ")[^"]+(")/, `$1${version}$2`));

edit('ios/project.yml', (s) =>
  s
    .replace(/(MARKETING_VERSION:\s*")[^"]+(")/, `$1${version}$2`)
    .replace(/(CURRENT_PROJECT_VERSION:\s*")(\d+)(")/, (_, a, n, b) => `${a}${Number(n) + 1}${b}`),
);

// CHANGELOG.md: 새 버전 칸(오늘 날짜)이 없으면 맨 위 버전 칸 앞에 만든다.
const changelog = file('CHANGELOG.md');
const log = fs.readFileSync(changelog, 'utf8');
if (!new RegExp(`^## ${version.replace(/\./g, '\\.')}(\\s|$)`, 'm').test(log)) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const at = log.search(/^## /m);
  const entry = `## ${version} — ${today}\n\n### 데스크톱\n- \n\n### iOS\n- \n\n`;
  fs.writeFileSync(changelog, at < 0 ? `${log.trimEnd()}\n\n${entry}` : log.slice(0, at) + entry + log.slice(at));
  console.log(`  CHANGELOG.md (${version} 칸을 만들었습니다 — 바뀐 점을 채우세요)`);
}

console.log('\n다음: CHANGELOG.md를 채우고 커밋·푸시한 뒤 npm run release');
