import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodeUnit } from './server-mutation/ast.mjs';
import { scan } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { commit } from './fixtures/screen-contract-check/harness.mjs';
import {
  BASELINE,
  DB_IMPORT,
  DB_PAGE,
  IDS,
  LEGACY,
  REBUILT,
  W,
  adopted,
  baselineOf,
} from './fixtures/screen-contract-check/cli-test-fixtures.mjs';

const owner = (check, item, kind, more = {}) => ({
  check,
  item,
  kind,
  approvedBy: 'owner',
  ref: 'fixture',
  date: '2026-11-20',
  ...more,
});

test('CLI: a clean adopted change exits 0 and reports every check', t => {
  const { root, base } = adopted(t);
  const head = commit(root, { [`${W}/app/ok/page.tsx`]: 'export default () => 1;\n' });
  const { code, report } = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report?.errors));
  assert.deepEqual(Object.keys(report.checks).sort(byCodeUnit), [...IDS].sort(byCodeUnit));
  assert.deepEqual(report.checks['CHK-15c'].new, []);
  assert.deepEqual(report.changes.baselined, {});
});

test('CLI: a new screen with a database import is new; enforcing makes it exit 1', t => {
  const { root, base } = adopted(t);
  const page = `${W}/app/fresh/page.tsx`;
  const head = commit(root, { [page]: DB_IMPORT });
  const advisory = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(advisory.code, 0);
  assert.deepEqual(advisory.report.checks['CHK-15c'].new, [
    `CHK-15c|${page}|@interdomestik/database`,
  ]);
  const failing = commit(root, {
    [BASELINE]: baselineOf({ 'CHK-15c': [LEGACY] }, { mode: { 'CHK-15c': 'fail' } }),
  });
  const enforcing = scan(t, root, ['--base', base, '--head', failing, '--enforcing']);
  assert.equal(enforcing.code, 1);
  assert.deepEqual(Object.keys(enforcing.report.checks), ['CHK-15c']);
});

test('CLI: a fixed legacy item must leave the baseline (shrink only)', t => {
  const { root, base } = adopted(t);
  const head = commit(root, { [DB_PAGE]: 'export default () => null;\n' });
  const { report } = scan(t, root, ['--base', base, '--head', head]);
  assert.deepEqual(report.checks['CHK-15c'].fixed, [LEGACY]);
  assert.deepEqual(report.changes.baselined, { [DB_PAGE]: [LEGACY] });
  const cleaned = commit(root, { [BASELINE]: baselineOf({}) });
  assert.deepEqual(
    scan(t, root, ['--base', base, '--head', cleaned]).report.checks['CHK-15c'].fixed,
    []
  );
});

test('CLI: an added baseline item is tamper unless the owner adds a fresh exception', t => {
  const { root, base } = adopted(t);
  const page = `${W}/app/fresh/page.tsx`;
  const item = `CHK-15c|${page}|@interdomestik/database`;
  const head = commit(root, {
    [page]: DB_IMPORT,
    [BASELINE]: baselineOf({ 'CHK-15c': [LEGACY, item] }),
  });
  assert.deepEqual(
    scan(t, root, ['--base', base, '--head', head]).report.checks['CHK-15c'].tamper,
    [`CHK-15c#added:${item}`]
  );
  const approved = commit(root, {
    [BASELINE]: baselineOf(
      { 'CHK-15c': [LEGACY, item] },
      { exceptions: [owner('CHK-15c', item, 'added')] }
    ),
  });
  assert.deepEqual(
    scan(t, root, ['--base', base, '--head', approved]).report.checks['CHK-15c'].tamper,
    []
  );
});

test('CLI transfers: a rename pairs with one removed occurrence, once (§4.1, B5, B12)', t => {
  const { root, base } = adopted(t);
  const moved = `${W}/app/moved/page.tsx`;
  const item = `CHK-15c|${moved}|@interdomestik/database`;
  const exception = owner('CHK-15c', item, 'replaced', { replaces: LEGACY });
  const head = commit(root, {
    [DB_PAGE]: null,
    [moved]: DB_IMPORT,
    [BASELINE]: baselineOf({ 'CHK-15c': [item] }, { exceptions: [exception] }),
  });
  const ok = scan(t, root, ['--base', base, '--head', head]).report.checks['CHK-15c'];
  assert.deepEqual([ok.tamper, ok.new, ok.fixed], [[], [], []]);
  // A second transfer citing the same removed occurrence does not count.
  const second = `CHK-15c|${W}/app/moved2/page.tsx|@interdomestik/database`;
  const twice = commit(root, {
    [`${W}/app/moved2/page.tsx`]: DB_IMPORT,
    [BASELINE]: baselineOf(
      { 'CHK-15c': [item, second] },
      { exceptions: [exception, owner('CHK-15c', second, 'replaced', { replaces: LEGACY })] }
    ),
  });
  const result = scan(t, root, ['--base', base, '--head', twice]).report.checks['CHK-15c'];
  assert.ok(
    result.tamper.includes(`CHK-15c#unpaired-transfer:${second}`),
    JSON.stringify(result.tamper)
  );
  assert.ok(result.tamper.includes(`CHK-15c#added:${second}`));
  // A `#predicate` replaced exception keeps WP-02's path.
  const predicate = commit(root, {
    [BASELINE]: baselineOf(
      { 'CHK-15c': [item, second] },
      {
        exceptions: [
          exception,
          owner('CHK-15c', second, 'added'),
          owner('CHK-15c', '#predicate', 'replaced'),
        ],
        extra: { 'CHK-15c': { predicate: 'p2' } },
      }
    ),
  });
  assert.deepEqual(
    scan(t, root, ['--base', base, '--head', predicate]).report.checks['CHK-15c'].tamper,
    []
  );
});

test('CLI rebuilt screens: a listed file admits no item, and the list only grows (§4.2)', t => {
  const { root, base } = adopted(t);
  const listed = commit(root, { [REBUILT]: `${JSON.stringify([DB_PAGE])}\n` });
  const result = scan(t, root, ['--base', base, '--head', listed]).report.checks['CHK-15c'];
  assert.deepEqual(result.new, [LEGACY]);
  assert.ok(result.tamper.includes(`CHK-15c#rebuilt-baselined:${LEGACY}`));
  const base2 = listed;
  const removed = commit(root, { [REBUILT]: '[]\n' });
  const after = scan(t, root, ['--base', base2, '--head', removed]).report.checks['CHK-15c'];
  assert.ok(after.tamper.includes(`rebuilt#removed:${DB_PAGE}`));
});

test('CLI: CHK-15a through the root @/ mapping, reported by the production CLI (H4, H7)', t => {
  const { root, base } = adopted(t);
  const head = commit(root, {
    [`${W}/actions/a.ts`]: "'use server';\nexport async function a() {}\n",
    'packages/domain-claims/src/up.ts': "import { a } from '@/actions/a';\nexport const up = a;\n",
  });
  const { report } = scan(t, root, ['--base', base, '--head', head]);
  assert.deepEqual(report.checks['CHK-15a'].new, [
    'CHK-15a|packages/domain-claims/src/up.ts|@/actions/a',
  ]);
  assert.ok(report.checks['CHK-15a'].units['source:3'] > 0);
});

test('CLI: base equals head is clean, with coverage still checked', t => {
  const { root, base } = adopted(t);
  const { code, report } = scan(t, root, ['--base', base, '--head', base]);
  assert.equal(code, 0, JSON.stringify(report.errors));
  const high = commit(root, {
    [BASELINE]: baselineOf(
      { 'CHK-15c': [LEGACY] },
      { extra: { 'CHK-15c': { coverageMin: { file: 999 } } } }
    ),
  });
  assert.match(
    scan(t, root, ['--base', high, '--head', high]).report.errors.join(),
    /CHK-15c coverage below minimum/u
  );
});
