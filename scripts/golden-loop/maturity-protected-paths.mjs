import { execFileSync } from 'node:child_process';

const SAFE_GIT_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

function currentBranch(repoRoot) {
  try {
    return execFileSync('/usr/bin/git', ['branch', '--show-current'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: SAFE_GIT_ENV,
    }).trim();
  } catch {
    return '';
  }
}

export function protectedPathStatus(repoRoot, protectedTouches) {
  const branch = currentBranch(repoRoot);
  const trackerOnly =
    protectedTouches.length > 0 && protectedTouches.every(file => file.startsWith('docs/plans/'));
  const authorizedTrackerCloseout = /^codex\/t\d+[a-z]?-closeout$/iu.test(branch) && trackerOnly;
  return {
    ok: protectedTouches.length === 0 || authorizedTrackerCloseout,
    detail: authorizedTrackerCloseout
      ? `authorized tracker closeout: ${protectedTouches.join(', ')}`
      : protectedTouches.join(', '),
  };
}
