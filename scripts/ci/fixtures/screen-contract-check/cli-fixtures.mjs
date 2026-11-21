// CLI fixtures of the screen-contract contract tests: baselines, owner exceptions, adopted
// repositories and a run of the production CLI with its report.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CHECKS } from '../../screen-contract/evaluate.mjs';
import { SCANNER, git, repo, tempDir } from './harness.mjs';

export const W = 'apps/web/src';
export const BASELINE = 'scripts/ci/screen-contract-baseline.json';
export const REG = 'scripts/ci/screen-contract-consent-registry.json';
export const REBUILT = 'scripts/ci/screen-contract-rebuilt-screens.json';
export const DB_PAGE = `${W}/app/legacy/page.tsx`;
export const DB_IMPORT =
  "import { db } from '@interdomestik/database';\nexport default () => db;\n";
export const LEGACY = `CHK-15c|${DB_PAGE}|@interdomestik/database`;

export const LANES = Object.freeze({
  'apps/web/vitest.config.ts':
    "export default { test: { include: ['src/**/*.test.{ts,tsx}'] } };\n",
  'apps/web/playwright.config.ts':
    "const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nconst GATE_KS = [...GATE_DEFAULT_MATCH, 'security/a.spec.ts'];\nexport default defineConfig({ testDir: './e2e', projects: [{ name: 'gate-ks-sq', testMatch: GATE_KS }, { name: 'gate-mk-contract', testMatch: GATE_DEFAULT_MATCH }, { name: 'visual', testMatch: ['visual/**/*.spec.ts'] }] });\n",
});

export const INPUTS = Object.freeze({
  [REG]: '{ "version": 1, "entries": [] }\n',
  [REBUILT]: '[]\n',
  ...LANES,
  [`${W}/app/ok/page.tsx`]: 'export default function P() { return null; }\n',
});

export function baselineData(items = {}, { mode = 'report', exceptions = [], extra = {} } = {}) {
  const checks = {};
  for (const { id } of CHECKS) {
    const list = items[id] ?? [];
    checks[id] = {
      mode: typeof mode === 'string' ? mode : (mode[id] ?? 'report'),
      unit: 'u',
      predicate: 'p',
      coverageMin: 0,
      items: list,
      ...(list.length === 0 && { exhausted: true }),
      ...extra[id],
    };
  }
  return { version: 1, takenAt: 'fixture', checks, exceptions };
}

export const asText = data => `${JSON.stringify(data, null, 2)}\n`;
export const baselineOf = (items, options) => asText(baselineData(items, options));

export const owner = (check, item, kind, more = {}) => ({
  check,
  item,
  kind,
  approvedBy: 'owner',
  ref: 'fixture',
  date: '2026-11-20',
  ...more,
});

export function scan(t, root, args) {
  const report = path.join(tempDir(t, 'scc-report-'), 'report.json');
  const result = spawnSync(
    process.execPath,
    [SCANNER, '--repo', root, '--report', report, ...args],
    {
      encoding: 'utf8',
    }
  );
  const body = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : null;
  return { code: result.status, report: body, stdout: result.stdout, stderr: result.stderr };
}

// A repository whose base is adopted (scanner-free fixture baseline).
export function adopted(t, baseline = baselineOf({ 'CHK-15c': [LEGACY] }), files = {}) {
  const root = repo(t, { ...INPUTS, [DB_PAGE]: DB_IMPORT, ...files, [BASELINE]: baseline });
  return { root, base: git(root, 'rev-parse', 'HEAD') };
}
