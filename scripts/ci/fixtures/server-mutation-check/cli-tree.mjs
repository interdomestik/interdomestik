// Repository trees and commit scenarios for the CLI tests of the server mutation checks.
import {
  BASE_FILES,
  baselineOf,
  commit,
  initRepo,
  json,
  pageEntry,
  registryOf,
  tempDir,
} from './harness.mjs';

export const PAGE = 'apps/web/src/app/page.tsx';
export const REGISTRY = 'apps/web/src/lib/public-entry-points.json';
export const BASELINE = 'scripts/ci/server-mutation-baseline.json';
export const SCRIPT = 'scripts/ci/server-mutation-check.mjs';
export const CHECKS_DIR = 'scripts/ci/server-mutation';
export const PAGE_ITEM = `page-home@${PAGE}#no-closure`;

export const cleanBaseline = (overrides = {}) =>
  baselineOf({ 'CHK-26': { exhausted: undefined, items: [PAGE_ITEM] }, ...overrides });

export const tree = (baseline, extra = {}) => ({
  ...BASE_FILES,
  [PAGE]: 'export default function Page() { return null; }\n',
  [REGISTRY]: json(registryOf([pageEntry('page-home', PAGE)])),
  [SCRIPT]: '// placeholder: the base carries the scanner\n',
  ...(baseline ? { [BASELINE]: json(baseline) } : {}),
  ...extra,
});

export function withoutCheck(baseline, id) {
  const checks = Object.fromEntries(Object.entries(baseline.checks).filter(([key]) => key !== id));
  return { ...baseline, checks };
}

// The owner's approval of removing check `id`, as a baseline exception.
export const removalException = id => ({
  check: id,
  item: '#check',
  kind: 'downgrade',
  approvedBy: 'owner',
  ref: 'r',
  date: '2026-11-19',
});

export function scenario(t, base, head) {
  const repo = initRepo(tempDir(t, 'smc-git-'));
  const baseSha = commit(repo, base, 'base');
  const headSha = commit(repo, head, 'head');
  return { repo, baseSha, headSha };
}
