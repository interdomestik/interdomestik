import { compareText, safeRelativePath } from './slice-rehearse-canonical.mjs';

const SAFE_GIT_OPTIONS = Object.freeze({
  encoding: 'utf8',
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 30_000,
});

export function detectReviewPaths(cwd, spawn) {
  const commands = [
    ['diff', '--name-only', '--diff-filter=ACMR', 'origin/main...HEAD'],
    ['diff', '--name-only', '--diff-filter=ACMR', '--cached'],
    ['diff', '--name-only', '--diff-filter=ACMR'],
    ['ls-files', '--others', '--exclude-standard'],
  ];
  const paths = new Set();
  for (const args of commands) {
    const result = spawn('/usr/bin/git', args, { ...SAFE_GIT_OPTIONS, cwd });
    if (result.status !== 0) continue;
    for (const path of result.stdout.split('\n').filter(Boolean)) {
      paths.add(safeRelativePath(path, 'review path'));
    }
  }
  return [...paths].sort(compareText);
}
