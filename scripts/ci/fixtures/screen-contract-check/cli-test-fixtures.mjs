import { CHECKS } from '../../screen-contract/evaluate.mjs';
import { git, repo } from './harness.mjs';

export const W = 'apps/web/src';
export const BASELINE = 'scripts/ci/screen-contract-baseline.json';
export const REG = 'scripts/ci/screen-contract-consent-registry.json';
export const REBUILT = 'scripts/ci/screen-contract-rebuilt-screens.json';
export const IDS = CHECKS.map(c => c.id);

export function baselineOf(items = {}, { mode = 'report', exceptions = [], extra = {} } = {}) {
  const checks = {};
  for (const id of IDS) {
    const list = items[id] ?? [];
    checks[id] = {
      mode: typeof mode === 'string' ? mode : (mode[id] ?? 'report'),
      unit: 'u',
      predicate: 'p',
      coverageMin: 0,
      items: list,
      ...(list.length ? {} : { exhausted: true }),
      ...extra[id],
    };
  }
  return `${JSON.stringify({ version: 1, takenAt: 'fixture', checks, exceptions }, null, 2)}\n`;
}

export const INPUTS = {
  [REG]: '{ "version": 1, "entries": [] }\n',
  [REBUILT]: '[]\n',
  'apps/web/vitest.config.ts':
    "export default { test: { include: ['src/**/*.test.{ts,tsx}'] } };\n",
  'apps/web/playwright.config.ts':
    "const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nconst GATE_KS = [...GATE_DEFAULT_MATCH, 'security/a.spec.ts'];\nexport default defineConfig({ testDir: './e2e', projects: [{ name: 'gate-ks-sq', testMatch: GATE_KS }, { name: 'gate-mk-contract', testMatch: GATE_DEFAULT_MATCH }, { name: 'visual', testMatch: ['visual/**/*.spec.ts'] }] });\n",
  [`${W}/app/ok/page.tsx`]: 'export default function P() { return null; }\n',
};
export const DB_PAGE = `${W}/app/legacy/page.tsx`;
export const DB_IMPORT =
  "import { db } from '@interdomestik/database';\nexport default () => db;\n";
export const LEGACY = `CHK-15c|${DB_PAGE}|@interdomestik/database`;

// The default base of `adopted`: one legacy database import in a baselined screen. Read only.
const ADOPTED_ITEMS = { 'CHK-15c': [LEGACY] };
const ADOPTED_FILES = { [DB_PAGE]: DB_IMPORT };

// A repository whose base is adopted (scanner-free fixture baseline) and a head commit on top.
export function adopted(t, baseItems = ADOPTED_ITEMS, baseFiles = ADOPTED_FILES) {
  const root = repo(t, { ...INPUTS, ...baseFiles, [BASELINE]: baselineOf(baseItems) });
  return { root, base: git(root, 'rev-parse', 'HEAD') };
}
