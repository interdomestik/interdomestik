import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { byCodeUnit } from './server-mutation/ast.mjs';
import { parseBaseline } from './server-mutation/baseline.mjs';
import { CHECKS } from './screen-contract/evaluate.mjs';
import { synthesizedBaseline } from './screen-contract/replay.mjs';
import { scan } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { SCANNER, commit, git, repo, tempDir } from './fixtures/screen-contract-check/harness.mjs';

const W = 'apps/web/src';
const BASELINE = 'scripts/ci/screen-contract-baseline.json';
const REG = 'scripts/ci/screen-contract/consent-registry.json';
const REBUILT = 'scripts/ci/screen-contract/rebuilt-screens.json';
const IDS = CHECKS.map(c => c.id);

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
      ...(extra[id] ?? {}),
    };
  }
  return `${JSON.stringify({ version: 1, takenAt: 'fixture', checks, exceptions }, null, 2)}\n`;
}

const owner = (check, item, kind, more = {}) => ({
  check,
  item,
  kind,
  approvedBy: 'owner',
  ref: 'fixture',
  date: '2026-11-20',
  ...more,
});

const INPUTS = {
  [REG]: '{ "version": 1, "entries": [] }\n',
  [REBUILT]: '[]\n',
  'apps/web/vitest.config.ts':
    "export default { test: { include: ['src/**/*.test.{ts,tsx}'] } };\n",
  'apps/web/playwright.config.ts':
    "const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nconst GATE_KS = [...GATE_DEFAULT_MATCH, 'security/a.spec.ts'];\nexport default defineConfig({ testDir: './e2e', projects: [{ name: 'gate-ks-sq', testMatch: GATE_KS }, { name: 'gate-mk-contract', testMatch: GATE_DEFAULT_MATCH }, { name: 'visual', testMatch: ['visual/**/*.spec.ts'] }] });\n",
  [`${W}/app/ok/page.tsx`]: 'export default function P() { return null; }\n',
};
const DB_PAGE = `${W}/app/legacy/page.tsx`;
const DB_IMPORT = "import { db } from '@interdomestik/database';\nexport default () => db;\n";
const LEGACY = `CHK-15c|${DB_PAGE}|@interdomestik/database`;

// A repository whose base is adopted (scanner-free fixture baseline) and a head commit on top.
function adopted(t, baseItems = { 'CHK-15c': [LEGACY] }, baseFiles = { [DB_PAGE]: DB_IMPORT }) {
  const root = repo(t, { ...INPUTS, ...baseFiles, [BASELINE]: baselineOf(baseItems) });
  return { root, base: git(root, 'rev-parse', 'HEAD') };
}

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

for (const [label, text] of [
  ['missing', null],
  ['empty', ''],
  ['unparseable', '{'],
  ['valid but empty', '{"version":1,"takenAt":"x","checks":{},"exceptions":[]}'],
]) {
  test(`CLI negative input: head baseline ${label} is an error`, t => {
    const { root, base } = adopted(t);
    const head = commit(root, { [BASELINE]: text });
    const { code, report } = scan(t, root, ['--base', base, '--head', head]);
    assert.equal(code, 2);
    assert.equal(report.status, 'error');
  });
}

test('CLI negative input: a missing check, empty items without exhausted, base scanner without baseline', t => {
  const { root, base } = adopted(t);
  const partial = JSON.parse(baselineOf({ 'CHK-15c': [LEGACY] }));
  delete partial.checks.A11Y;
  assert.equal(
    scan(t, root, ['--base', base, '--head', commit(root, { [BASELINE]: JSON.stringify(partial) })])
      .code,
    2
  );
  const open = JSON.parse(baselineOf({ 'CHK-15c': [LEGACY] }));
  delete open.checks['CHK-09'].exhausted;
  assert.equal(
    scan(t, root, ['--base', base, '--head', commit(root, { [BASELINE]: JSON.stringify(open) })])
      .code,
    2
  );
  const scannerOnly = repo(t, {
    ...INPUTS,
    'scripts/ci/screen-contract-check.mjs': '// scanner\n',
  });
  const b = git(scannerOnly, 'rev-parse', 'HEAD');
  const h = commit(scannerOnly, { [BASELINE]: baselineOf({}) });
  assert.match(
    scan(t, scannerOnly, ['--base', b, '--head', h]).report.errors.join(),
    /scanner but no baseline/u
  );
});

test('CLI bootstrap: a base with neither baseline nor scanner is accepted', t => {
  const root = repo(t, { ...INPUTS });
  const base = git(root, 'rev-parse', 'HEAD');
  const head = commit(root, { [BASELINE]: baselineOf({}) });
  const { code, report } = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report.errors));
  assert.equal(report.bootstrap, true);
});

for (const [label, text, pattern] of [
  ['missing', null, /missing or empty/u],
  ['empty', '', /missing or empty/u],
  ['unparseable', '{', /not valid JSON/u],
  [
    'duplicate ids',
    JSON.stringify({
      version: 1,
      entries: [1, 2].map(() => ({
        id: 'x',
        kind: 'not-consent',
        file: `${W}/app/ok/page.tsx`,
        control: 'c',
        reason: 'r',
      })),
    }),
    /duplicate id/u,
  ],
  [
    'incomplete entry',
    JSON.stringify({
      version: 1,
      entries: [{ id: 'x', kind: 'consent', file: `${W}/app/ok/page.tsx`, control: 'c', uses: [] }],
    }),
    /has no payloadField/u,
  ],
]) {
  test(`CLI negative input: consent registry ${label} is an error`, t => {
    const { root, base } = adopted(t);
    const { code, report } = scan(t, root, [
      '--base',
      base,
      '--head',
      commit(root, { [REG]: text }),
    ]);
    assert.equal(code, 2);
    assert.match(report.errors.join(), pattern);
  });
}

test('CLI negative input: rebuilt list missing, and the lane configs missing', t => {
  const { root, base } = adopted(t);
  assert.equal(
    scan(t, root, ['--base', base, '--head', commit(root, { [REBUILT]: null })]).code,
    2
  );
  const noVitest = commit(root, { [REBUILT]: '[]\n', 'apps/web/vitest.config.ts': null });
  assert.match(
    scan(t, root, ['--base', base, '--head', noVitest]).report.errors.join(),
    /vitest\.config\.ts is missing/u
  );
});

test('CLI: the registry is judged against the trusted base, and each use needs its test', t => {
  const page = `${W}/app/signup/page.tsx`;
  const testFile = `${W}/app/signup/terms.test.ts`;
  const action = `${W}/actions/consent.ts`;
  const entry = (kind, more = {}) => ({
    id: 'terms',
    kind,
    file: page,
    control: 'terms',
    ...(kind === 'consent'
      ? {
          payloadField: 'acceptTerms',
          storedIn: 'consents',
          versionSource: 'TERMS_VERSION',
          uses: [
            { useId: 'signup', file: page, submission: `${action}#saveTerms`, test: testFile },
          ],
        }
      : { reason: 'r' }),
    ...more,
  });
  const files = {
    [action]: "'use server';\nexport async function saveTerms() {}\n",
    [page]:
      'import { saveTerms } from \'@/actions/consent\';\nexport default function P() { return <form action={saveTerms} data-consent-use="terms:signup"><input type="checkbox" id="terms" data-consent="terms" /></form>; }\n',
    // The use's test loads the registered submission module and calls its export (r1 B8).
    [testFile]: [
      "import { saveTerms } from '@/actions/consent';",
      "it('terms signup stores acceptTerms in consents with TERMS_VERSION and acceptedAt', async () => {",
      '  await saveTerms();',
      '});',
      '',
    ].join('\n'),
    [REG]: JSON.stringify({ version: 1, entries: [entry('consent')] }),
  };
  const { root, base } = adopted(t, {}, files);
  const ok = scan(t, root, [
    '--base',
    base,
    '--head',
    commit(root, { [`${W}/app/ok/page.tsx`]: 'export default () => 2;\n' }),
  ]);
  assert.equal(ok.code, 0, JSON.stringify(ok.report.errors));
  assert.deepEqual(ok.report.checks['CHK-22'].new, []);
  // A kind change without the owner's exception is tamper (and the control no longer needs a use).
  const flipped = commit(root, {
    [REG]: JSON.stringify({ version: 1, entries: [entry('not-consent')] }),
  });
  assert.ok(
    scan(t, root, ['--base', base, '--head', flipped]).report.checks['CHK-22'].tamper.includes(
      'CHK-22#registry-changed-kind:terms'
    )
  );
  // Test evidence: skipped, outside every lane, or not naming the fields is an error.
  for (const [text, at, pattern] of [
    [
      "it.skip('terms signup saveTerms acceptTerms consents TERMS_VERSION acceptedAt', () => {});\n",
      testFile,
      /is skipped/u,
    ],
    [
      "import { saveTerms } from '@/actions/consent';\nit('terms signup', () => saveTerms());\n",
      testFile,
      /does not name acceptTerms, consents, TERMS_VERSION, a time field/u,
    ],
  ]) {
    const head = commit(root, {
      [REG]: JSON.stringify({ version: 1, entries: [entry('consent')] }),
      [at]: text,
    });
    assert.match(scan(t, root, ['--base', base, '--head', head]).report.errors.join(), pattern);
  }
  const outside = commit(root, {
    [`${W}/app/signup/terms.check.ts`]: files[testFile],
    [REG]: JSON.stringify({
      version: 1,
      entries: [
        entry('consent', {
          uses: [
            {
              useId: 'signup',
              file: page,
              submission: `${action}#saveTerms`,
              test: `${W}/app/signup/terms.check.ts`,
            },
          ],
        }),
      ],
    }),
  });
  assert.match(
    scan(t, root, ['--base', base, '--head', outside]).report.errors.join(),
    /selected by no lane/u
  );
});

test('CLI arguments: no --base, an empty --check, an unknown flag, an unknown sha, an unwritable report', t => {
  const { root, base } = adopted(t);
  assert.equal(scan(t, root, []).code, 2);
  assert.equal(scan(t, root, ['--base', base, '--check', '']).code, 2);
  assert.equal(scan(t, root, ['--base', base, '--nope']).code, 2);
  assert.equal(scan(t, root, ['--base', 'deadbeefdeadbeef']).code, 2);
  const blocked = path.join(tempDir(t), 'file');
  fs.writeFileSync(blocked, 'x');
  const result = spawnSync(
    process.execPath,
    [SCANNER, '--repo', root, '--base', base, '--report', path.join(blocked, 'r.json')],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 2);
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
