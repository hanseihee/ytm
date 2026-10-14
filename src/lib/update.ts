// 새 버전 알림: GitHub 최신 릴리즈(hanseihee/ytm)와 지금 버전을 견준다. 받는 것은 사용자가 고른다(자동 설치는 하지 않는다).
// GitHub API는 교차 출처를 허용하고, 로그인 없이 시간당 60번까지 부를 수 있다(앱은 시작할 때와 12시간마다 한 번).

export const REPO = 'hanseihee/ytm';
const DISMISS_KEY = 'ytm-desktop:update-dismissed';

export interface UpdateInfo {
  version: string;
  url: string;
}

/** "0.2.10" > "0.2.9" 같은 버전 비교(같으면 0) */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** 지금보다 새 버전이 있으면 그 정보(없거나 확인하지 못하면 null) */
export async function checkForUpdate(current: string): Promise<UpdateInfo | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return null;
  const release = (await res.json()) as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
  const version = String(release.tag_name ?? '').replace(/^v/, '');
  if (release.draft || release.prerelease || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (compareVersions(version, current) <= 0) return null;
  const url = release.html_url?.startsWith('https://github.com/') ? release.html_url : `https://github.com/${REPO}/releases/latest`;
  return { version, url };
}

/** "나중에"를 누른 버전은 다시 알리지 않는다(더 새 버전이 나오면 다시 알린다). */
export function isDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === version;
  } catch {
    return false;
  }
}

export function dismiss(version: string) {
  try {
    localStorage.setItem(DISMISS_KEY, version);
  } catch {
    // 저장하지 못하면 다음 실행 때 다시 알린다.
  }
}
