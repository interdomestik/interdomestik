import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { scan } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { SCANNER, commit, git, repo, tempDir } from './fixtures/screen-contract-check/harness.mjs';
import {
  BASELINE,
  INPUTS,
  LEGACY,
  REBUILT,
  REG,
  W,
  adopted,
  baselineOf,
} from './fixtures/screen-contract-check/cli-test-fixtures.mjs';

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
