import { execFileSync } from 'node:child_process';

const SAFE_GIT_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

function currentBranch(repoRoot) {
  try {
    const branch = execFileSync('/usr/bin/git', ['branch', '--show-current'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: SAFE_GIT_ENV,
    }).trim();
    if (branch) return branch;
  } catch {
    // Fall through to GitHub Actions PR metadata when checkout is detached.
  }
  return process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '';
}

export function isAuthorizedProtectedDocsBranch(branch, protectedTouches) {
  const trackerOnly =
    protectedTouches.length > 0 && protectedTouches.every(file => file.startsWith('docs/plans/'));
  return (
    trackerOnly &&
    (/^codex\/t\d+[a-z]?-closeout$/iu.test(branch) ||
      /^codex\/github-governance-[a-z0-9-]+$/iu.test(branch))
  );
}

export function protectedPathStatus(repoRoot, protectedTouches) {
  const branch = currentBranch(repoRoot);
  const authorized = isAuthorizedProtectedDocsBranch(branch, protectedTouches);
  return {
    ok: protectedTouches.length === 0 || authorized,
    detail: authorized
      ? `authorized tracker closeout: ${protectedTouches.join(', ')}`
      : protectedTouches.join(', '),
  };
}
