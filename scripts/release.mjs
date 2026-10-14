#!/usr/bin/env node
// GitHub 릴리즈 만들기: npm run release            (맥 dmg·윈도우 설치 파일을 빌드해 올린다)
//                      npm run release -- --skip-build   (이미 빌드한 파일을 올린다)
//                      npm run release -- --draft        (초안으로 만든다)
//
// 순서: 버전·작업 트리 확인 → CHANGELOG.md에서 이 버전 설명 읽기 → 빌드 → release/에 알기 쉬운 이름으로 모으고
//       SHA256SUMS.txt 만들기 → 태그(v<버전>) 붙여 푸시 → gh release create로 올리기.
// GitHub 계정은 origin 주소의 소유자(hanseihee)로 쓴다(gh 활성 계정이 달라도 된다).
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const draft = args.has('--draft');

const fail = (message) => {
  console.error(`\n릴리즈를 멈췄습니다: ${message}`);
  process.exit(1);
};
const run = (cmd, cmdArgs, opts = {}) => String(execFileSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8', ...opts }) ?? '').trim();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ── 1. 버전 ────────────────────────────────────────────────────────────────
const version = JSON.parse(read('package.json')).version;
const tag = `v${version}`;
const versions = {
  'src-tauri/tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json')).version,
  'src-tauri/Cargo.toml': (read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m) || [])[1],
  'ios/project.yml': (read('ios/project.yml').match(/MARKETING_VERSION:\s*"([^"]+)"/) || [])[1],
};
for (const [p, v] of Object.entries(versions)) {
  if (v !== version) fail(`${p}의 버전(${v})이 package.json(${version})과 다릅니다. npm run version:set -- ${version}`);
}

// ── 2. git 상태 ────────────────────────────────────────────────────────────
if (run('git', ['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') fail('main 가지에서만 릴리즈합니다');
if (run('git', ['status', '--porcelain'])) fail('커밋하지 않은 변경이 있습니다');
run('git', ['fetch', '--quiet', 'origin']);
if (run('git', ['rev-parse', 'HEAD']) !== run('git', ['rev-parse', 'origin/main'])) fail('origin/main과 다릅니다. 먼저 푸시하세요');
if (run('git', ['tag', '--list', tag])) fail(`태그 ${tag}가 이미 있습니다. 버전을 올리세요(npm run version:set -- <버전>)`);
if (run('git', ['ls-remote', '--tags', 'origin', tag])) fail(`GitHub에 태그 ${tag}가 이미 있습니다`);

const remote = run('git', ['remote', 'get-url', 'origin']);
const repo = (remote.match(/github\.com[/:]([^/]+\/[^/.]+)(\.git)?$/) || [])[1];
if (!repo) fail(`origin이 GitHub 저장소가 아닙니다: ${remote}`);
const owner = repo.split('/')[0];
let token;
try {
  token = run('gh', ['auth', 'token', '--user', owner]);
} catch {
  fail(`gh에 ${owner} 계정이 로그인되어 있지 않습니다(gh auth login)`);
}
const gh = (ghArgs, opts = {}) => run('gh', ghArgs, { env: { ...process.env, GH_TOKEN: token }, ...opts });

// ── 3. 릴리즈 설명(CHANGELOG.md) ───────────────────────────────────────────
const changelog = read('CHANGELOG.md');
const head = new RegExp(`^## ${version.replace(/\./g, '\\.')}(\\s.*)?$`, 'm');
const start = changelog.search(head);
if (start < 0) fail(`CHANGELOG.md에 "## ${version}" 칸이 없습니다`);
const rest = changelog.slice(start).split('\n').slice(1).join('\n');
const end = rest.search(/^## /m);
const body = (end < 0 ? rest : rest.slice(0, end)).trim();
if (!body || /^-\s*$/m.test(body)) fail(`CHANGELOG.md의 ${version} 칸이 비어 있습니다`);

// ── 4. 빌드 ────────────────────────────────────────────────────────────────
const commitTime = Number(run('git', ['log', '-1', '--format=%ct'])) * 1000;
if (!skipBuild) {
  for (const script of ['build:mac', 'build:win']) {
    console.log(`\n▶ npm run ${script}`);
    const r = spawnSync('npm', ['run', script], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) fail(`${script} 빌드가 실패했습니다`);
  }
}

// ── 5. 파일 모으기 ─────────────────────────────────────────────────────────
const assets = [
  {
    from: `src-tauri/target/release/bundle/dmg/YTMusic_${version}_aarch64.dmg`,
    name: `YTMusic-${version}-mac-arm64.dmg`,
    label: '맥(Apple 실리콘)',
  },
  {
    from: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/YTMusic_${version}_x64-setup.exe`,
    name: `YTMusic-${version}-windows-x64-setup.exe`,
    label: '윈도우(64비트)',
  },
];
const outDir = path.join(root, 'release', version);
fs.mkdirSync(outDir, { recursive: true });
const sums = [];
for (const a of assets) {
  const src = path.join(root, a.from);
  if (!fs.existsSync(src)) fail(`${a.from}이(가) 없습니다. --skip-build 없이 다시 실행하세요`);
  if (fs.statSync(src).mtimeMs < commitTime) fail(`${a.from}이(가) 마지막 커밋보다 오래됐습니다. --skip-build 없이 다시 실행하세요`);
  const dst = path.join(outDir, a.name);
  fs.copyFileSync(src, dst);
  a.path = dst;
  a.size = fs.statSync(dst).size;
  a.sha = crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex');
  sums.push(`${a.sha}  ${a.name}`);
}
const sumsPath = path.join(outDir, 'SHA256SUMS.txt');
fs.writeFileSync(sumsPath, `${sums.join('\n')}\n`);
// 예전처럼 배포/ 폴더에도 둔다(저장소에는 올리지 않는 폴더).
const localDir = path.join(root, '배포');
fs.mkdirSync(localDir, { recursive: true });
for (const a of assets) fs.copyFileSync(a.path, path.join(localDir, a.name));

// ── 6. 태그·릴리즈 ─────────────────────────────────────────────────────────
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;
const notes = `${body}

## 내려받기

| 운영체제 | 파일 | 크기 |
|---|---|---|
${assets.map((a) => `| ${a.label} | \`${a.name}\` | ${mb(a.size)} |`).join('\n')}

코드 서명을 하지 않았습니다.
- **맥**: 처음 열 때 Finder에서 앱을 우클릭한 뒤 "열기"를 고르세요.
- **윈도우**: SmartScreen 경고가 뜨면 "추가 정보 → 실행"을 고르세요.

iOS 앱은 서명 때문에 설치 파일로 나눠 줄 수 없습니다. 저장소의 \`ios/\`를 Xcode로 빌드하세요(README 참고).

<details><summary>SHA-256</summary>

\`\`\`
${sums.join('\n')}
\`\`\`
</details>
`;
const notesPath = path.join(os.tmpdir(), `ytm-release-${version}.md`);
fs.writeFileSync(notesPath, notes);

console.log(`\n▶ 태그 ${tag}`);
run('git', ['tag', '-a', tag, '-m', `YTMusic ${version}`]);
run('git', ['push', 'origin', tag], { stdio: 'inherit' });

console.log(`\n▶ GitHub 릴리즈 ${repo} ${tag}`);
const url = gh([
  'release', 'create', tag, ...assets.map((a) => a.path), sumsPath,
  '--repo', repo, '--title', `YTMusic ${version}`, '--notes-file', notesPath, '--verify-tag',
  ...(draft ? ['--draft'] : []),
]);
console.log(`\n완료: ${url}`);
