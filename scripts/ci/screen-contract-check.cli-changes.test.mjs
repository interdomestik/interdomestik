import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodeUnit } from './server-mutation/ast.mjs';
import { parseBaseline } from './server-mutation/baseline.mjs';
import { CHECKS } from './screen-contract/evaluate.mjs';
import { synthesizedBaseline } from './screen-contract/replay.mjs';
import { scan } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { commit, git, repo } from './fixtures/screen-contract-check/harness.mjs';
import {
  DB_IMPORT,
  DB_PAGE,
  IDS,
  INPUTS,
  LEGACY,
  REBUILT,
  REG,
  W,
  adopted,
} from './fixtures/screen-contract-check/cli-test-fixtures.mjs';

test('replay: a synthesized zero-item baseline passes the unchanged WP-02 parser (H7)', () => {
  const empty = Object.fromEntries(IDS.map(id => [id, { items: [], units: {}, files: 0 }]));
  const parsed = parseBaseline(
    JSON.stringify(synthesizedBaseline('abc1234', empty)),
    'replay',
    CHECKS
  );
  assert.deepEqual(Object.keys(parsed.checks).sort(byCodeUnit), [...IDS].sort(byCodeUnit));
  assert.equal(parsed.takenAt, 'replay:abc1234');
});

test('replay: a pre-adoption pair completes; a deletion and an emptied kind are adjudicated (B17)', t => {
  const page = `${W}/app/legacy/page.tsx`;
  const root = repo(t, {
    [REG]: null, // pre-adoption: no registry yet
    'apps/web/vitest.config.ts': INPUTS['apps/web/vitest.config.ts'],
    'apps/web/playwright.config.ts': INPUTS['apps/web/playwright.config.ts'],
    [page]: "const x = require('./helper');\nexport default () => x;\n",
    [`${W}/app/legacy/helper.ts`]: 'export const y = 1;\n',
    [`${W}/app/gone/page.tsx`]: 'export default () => null;\n',
  });
  const base = git(root, 'rev-parse', 'HEAD');
  const head = commit(root, {
    [page]: "import x from './helper';\nexport default () => x;\n",
    [`${W}/app/gone/page.tsx`]: null,
  });
  const { code, report } = scan(t, root, ['--replay', '--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report.errors));
  assert.equal(report.replay.complete, true);
  assert.deepEqual(
    report.replay.synthesized.base.sort(byCodeUnit),
    [REBUILT, REG].sort(byCodeUnit)
  );
  assert.ok(report.replay.adjudicate.some(line => /CHK-15c: inventory decrease/u.test(line)));
  assert.ok(
    report.replay.adjudicate.some(line => /kind empty edge:require/u.test(line)),
    JSON.stringify(report.replay.adjudicate)
  );
});

test('git: a failed changed-path discovery is a scanner error', async t => {
  const { changeReport } = await import('./screen-contract/changes.mjs');
  const { root, base } = adopted(t);
  assert.throws(
    () => changeReport(root, base, 'f'.repeat(40), root, null, []),
    /changed-path discovery failed/u
  );
});

// r5 blocker 7: a changed path is read as a NUL-delimited field, so a non-ASCII name is not quoted
// and its baselined items are reported.
test('r5 B7: a changed baselined screen with a non-ASCII path is reported', t => {
  const page = `${W}/app/résumé/page.tsx`;
  const item = `CHK-15c|${page}|@interdomestik/database`;
  const { root, base } = adopted(
    t,
    { 'CHK-15c': [LEGACY, item] },
    { [DB_PAGE]: DB_IMPORT, [page]: DB_IMPORT }
  );
  const head = commit(root, { [page]: `${DB_IMPORT}// edited\n` });
  const { code, report } = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report?.errors));
  assert.deepEqual(report.changes.baselined, { [page]: [item] });
});

// r6 blocker 3: a path is everything after the second tab of a `--numstat -z` record, so a name
// with a tab is not cut short and attributed to a sibling.
test('r6 B3: a changed path with a tab is not attributed to its prefix', t => {
  const { root, base } = adopted(t);
  const head = commit(root, { [`${DB_PAGE}\tdraft.tsx`]: 'export default () => null;\n' });
  const { code, report } = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report?.errors));
  assert.deepEqual(report.changes.baselined, {});
});

// r6 blocker 1, r7 blocker 1, r8 blocker 1: a signal names a PR-controlled path. Printed to the
// trusted run's log, every character outside [A-Za-z0-9 ._/@+-] is percent-encoded (UTF-8 bytes),
// so no line break, `::` or `##[` marker is left, and the line decodes back to the signal.
test('r8 B1: a printed rebuild signal keeps only allowlisted characters and decodes back', async () => {
  const { signalLine } = await import('./screen-contract/changes.mjs');
  const names = [
    'x ##[error]y.tsx',
    'x ::error::y.tsx',
    'a\n::error::x.tsx',
    'a\r##[warning]x.tsx',
    'a\r\n::notice::x.tsx',
    'del\u007f::error::x.tsx',
    'bell\u0007.tsx',
    '100%25::error::x.tsx',
    'résumé/页面 ✓.tsx',
  ];
  for (const name of names) {
    const signal = `likely rebuild: ${name} adds a page-ready marker`;
    const line = signalLine(signal);
    assert.match(line, /^[A-Za-z0-9 ._/@+%-]*$/u, JSON.stringify(name));
    assert.equal(decodeURIComponent(line), signal, JSON.stringify(name));
  }
  assert.equal(signalLine('a#[b]:c\r\n\u007fé%'), 'a%23%5Bb%5D%3Ac%0D%0A%7F%C3%A9%25');
});

// r8 blocker 1, end to end: the report keeps the raw path; stdout prints the encoded signal only.
test('r8 B1: the report holds the raw signal and stdout its encoded line', t => {
  const page = `${W}/app/résumé ##[error]x/page.tsx`;
  const item = `CHK-15c|${page}|@interdomestik/database`;
  const { root, base } = adopted(
    t,
    { 'CHK-15c': [LEGACY, item] },
    { [DB_PAGE]: DB_IMPORT, [page]: DB_IMPORT }
  );
  const extra = Array.from({ length: 10 }, (_, i) => `// added ${i}`).join('\n');
  const head = commit(root, { [page]: `${DB_IMPORT}${extra}\n` });
  const { code, report, stdout } = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report?.errors));
  const raw = report.changes.signals.find(signal => signal.includes(page));
  assert.ok(raw, JSON.stringify(report.changes.signals));
  const printed = stdout.split('\n').filter(line => line.startsWith('likely rebuild'));
  assert.deepEqual(
    printed.map(line => decodeURIComponent(line)),
    report.changes.signals
  );
  assert.ok(!stdout.includes('##['), stdout);
});

// r7 hardening: a baselined screen whose path holds a tab is reported under that whole path.
test('r7 H2: a changed baselined screen with a tab in its path is attributed to that path', t => {
  const page = `${W}/app/a\tb/page.tsx`;
  const item = `CHK-15c|${page}|@interdomestik/database`;
  const { root, base } = adopted(
    t,
    { 'CHK-15c': [LEGACY, item] },
    { [DB_PAGE]: DB_IMPORT, [page]: DB_IMPORT }
  );
  const head = commit(root, { [page]: `${DB_IMPORT}// edited\n` });
  const { code, report } = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report?.errors));
  assert.deepEqual(report.changes.baselined, { [page]: [item] });
});
