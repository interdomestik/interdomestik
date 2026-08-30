import { compareText, safeRelativePath } from './slice-rehearse-canonical.mjs';

export function detectReviewPaths(cwd, spawn) {
  const commands = [
    ['diff', '--name-only', '--diff-filter=ACMR', 'origin/main...HEAD'],
    ['diff', '--name-only', '--diff-filter=ACMR', '--cached'],
    ['diff', '--name-only', '--diff-filter=ACMR'],
    ['ls-files', '--others', '--exclude-standard'],
  ];
  const paths = new Set();
  for (const args of commands) {
    const result = spawn('/usr/bin/git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) continue;
    for (const path of result.stdout.split('\n').filter(Boolean)) {
      paths.add(safeRelativePath(path, 'review path'));
    }
  }
  return [...paths].sort(compareText);
}
