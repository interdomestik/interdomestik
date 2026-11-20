// Contract tests of the R-10 replay (WP-05 design §7; code review r1: B2, B11). A replay judges
// an adopted pair by the production path. It synthesizes only the inputs that predate adoption, and
// it never writes outside the extracted tree.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { CHECKS } from './screen-contract/evaluate.mjs';
import { SCANNER, commit, git, repo, tempDir } from './fixtures/screen-contract-check/harness.mjs';

const W = 'apps/web/src';
const BASELINE = 'scripts/ci/screen-contract-baseline.json';
const REG = 'scripts/ci/screen-contract/consent-registry.json';
const REBUILT = 'scripts/ci/screen-contract/rebuilt-screens.json';
const LANES = {
  'apps/web/vitest.config.ts':
    "export default { test: { include: ['src/**/*.test.{ts,tsx}'] } };\n",
  'apps/web/playwright.config.ts':
    "const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nexport default { testDir: './e2e' };\n",
};
const DB_PAGE = `${W}/app/legacy/page.tsx`;
const DB_IMPORT = "import { db } from '@interdomestik/database';\nexport default () => db;\n";
const LEGACY = `CHK-15c|${DB_PAGE}|@interdomestik/database`;

function baselineOf(items = {}, coverageMin = {}) {
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

function run(t, root, args) {
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

function adoptedPair(t, baselineText, headFiles) {
  const root = repo(t, {
    ...LANES,
    [REG]: '{ "version": 1, "entries": [] }\n',
    [REBUILT]: '[]\n',
    [DB_PAGE]: DB_IMPORT,
    [`${W}/app/ok/page.tsx`]: 'export default () => null;\n',
    [BASELINE]: baselineText,
  });
  const base = git(root, 'rev-parse', 'HEAD');
  const head = commit(root, headFiles);
  return { root, base, head };
}

const replayOf = (t, { root, base, head }) =>
  run(t, root, ['--replay', '--base', base, '--head', head]);

test('B2: an adopted pair whose head falls below its real coverage floor is not complete', t => {
  const pair = adoptedPair(t, baselineOf({ 'CHK-15c': [LEGACY] }, { 'CHK-15c': { file: 2 } }), {
    [`${W}/app/ok/page.tsx`]: null,
  });
  const production = run(t, pair.root, ['--base', pair.base, '--head', pair.head]);
  assert.equal(production.code, 2);
  const { code, report } = replayOf(t, pair);
  assert.equal(code, 2);
  assert.match(report.errors.join('\n'), /CHK-15c coverage below minimum/u);
  assert.equal(report.replay?.complete ?? false, false);
});

test('B2: an adopted pair judges baseline tamper as production does', t => {
  const added = `CHK-15c|${W}/app/new/page.tsx|@interdomestik/database`;
  const pair = adoptedPair(t, baselineOf({ 'CHK-15c': [LEGACY] }), {
    [`${W}/app/new/page.tsx`]: DB_IMPORT,
    [BASELINE]: baselineOf({ 'CHK-15c': [LEGACY, added] }),
  });
  const { code, report } = replayOf(t, pair);
  assert.equal(code, 0, JSON.stringify(report.errors));
  assert.ok(report.checks['CHK-15c'].tamper.length > 0, JSON.stringify(report.checks['CHK-15c']));
  assert.ok(report.replay.wouldRefuse.includes('CHK-15c'));
  assert.equal(report.replay.synthesized.base.length, 0);
  assert.equal(report.replay.synthesized.head.length, 0);
});

test('B2: an adopted pair whose head registry use names a missing test is an error', t => {
  const registry = {
    version: 1,
    entries: [
      {
        id: 'terms',
        kind: 'consent',
        file: `${W}/app/ok/page.tsx`,
        control: 'terms',
        payloadField: 'terms',
        storedIn: 'consents',
        versionSource: 'TERMS_VERSION',
        uses: [
          {
            useId: 'u1',
            file: `${W}/app/ok/page.tsx`,
            submission: `${W}/actions/terms.ts#saveTerms`,
            test: `${W}/app/ok/page.test.tsx`,
          },
        ],
      },
    ],
  };
  const pair = adoptedPair(t, baselineOf({ 'CHK-15c': [LEGACY] }), {
    [REG]: `${JSON.stringify(registry)}\n`,
  });
  const { code, report } = replayOf(t, pair);
  assert.equal(code, 2);
  assert.ok(report.errors.length > 0);
  assert.equal(report.replay?.complete ?? false, false);
});

test('B2: a pre-adoption pair records base and head units, versions and every unit decrease', t => {
  const page = `${W}/app/legacy/page.tsx`;
  const root = repo(t, {
    [REG]: null,
    ...LANES,
    [page]: "import a from './a';\nimport b from './b';\nexport default () => a + b;\n",
    [`${W}/app/legacy/a.ts`]: 'export default 1;\n',
    [`${W}/app/legacy/b.ts`]: 'export default 2;\n',
  });
  const base = git(root, 'rev-parse', 'HEAD');
  const head = commit(root, { [page]: "import a from './a';\nexport default () => a;\n" });
  const { code, report } = run(t, root, ['--replay', '--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report.errors));
  assert.equal(report.replay.complete, true);
  assert.ok(report.replay.units.base['CHK-15b']);
  assert.ok(report.replay.units.head['CHK-15b']);
  assert.equal(typeof report.replay.versions.eslint, 'string');
  assert.ok(
    report.replay.adjudicate.some(line => /CHK-15b: unit decrease edge:import/u.test(line)),
    JSON.stringify(report.replay.adjudicate)
  );
});

test('B11: replay refuses an input directory that is a committed symlink and writes nothing outside', t => {
  const outside = tempDir(t, 'scc-outside-');
  const root = repo(t, { ...LANES, [`${W}/app/ok/page.tsx`]: 'export default () => null;\n' });
  fs.rmSync(path.join(root, 'scripts/ci/screen-contract'), { recursive: true, force: true });
  fs.symlinkSync(outside, path.join(root, 'scripts/ci/screen-contract'));
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'link');
  const base = git(root, 'rev-parse', 'HEAD');
  const head = commit(root, { [`${W}/app/ok2/page.tsx`]: 'export default () => null;\n' });
  const { code, report } = run(t, root, ['--replay', '--base', base, '--head', head]);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(code, 2);
  assert.match(report.errors.join('\n'), /symbolic link/u);
});
