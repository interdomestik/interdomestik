import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CHECKS } from '../../screen-contract/evaluate.mjs';
import { SCANNER, tempDir } from './harness.mjs';

export const W = 'apps/web/src';
export const BASELINE = 'scripts/ci/screen-contract-baseline.json';
export const LANES = {
  'apps/web/vitest.config.ts':
    "export default { test: { include: ['src/**/*.test.{ts,tsx}'] } };\n",
  'apps/web/playwright.config.ts':
    "const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nconst GATE_KS = [...GATE_DEFAULT_MATCH, 'security/a.spec.ts'];\nexport default defineConfig({ testDir: './e2e', projects: [{ name: 'gate-ks-sq', testMatch: GATE_KS }, { name: 'gate-mk-contract', testMatch: GATE_DEFAULT_MATCH }, { name: 'visual', testMatch: ['visual/**/*.spec.ts'] }] });\n",
};

export function baselineOf(items = {}, coverageMin = {}) {
  const checks = {};
  for (const { id } of CHECKS) {
    const list = items[id] ?? [];
    checks[id] = {
      mode: 'report',
      unit: 'u',
      predicate: 'p',
      coverageMin: coverageMin[id] ?? 0,
      items: list,
      ...(list.length ? {} : { exhausted: true }),
    };
  }
  return `${JSON.stringify({ version: 1, takenAt: 'fixture', checks, exceptions: [] }, null, 2)}\n`;
}

export function run(t, root, args) {
  const report = path.join(tempDir(t, 'scc-report-'), 'report.json');
  const result = spawnSync(
    process.execPath,
    [SCANNER, '--repo', root, '--report', report, ...args],
    {
      encoding: 'utf8',
    }
  );
  const body = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : null;
  return { code: result.status, report: body };
}
