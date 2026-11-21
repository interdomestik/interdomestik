// Contract tests of CHK-22's test evidence (WP-05 code review r1: B8). A use's test counts only
// when the lane selection, parsed from the lane configs, selects it, and when it imports the
// registered submission module and names its export.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRegistry } from './screen-contract/registry.mjs';
import { W } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import {
  ACTION,
  BODY,
  IMPORTING,
  evidence,
  registryWith,
} from './fixtures/screen-contract-check/evidence-fixtures.mjs';

test('B8: a passing use test imports the submission module and names its export', t => {
  assert.deepEqual(evidence(t, `${W}/app/signup/page.test.tsx`, IMPORTING), []);
  assert.deepEqual(
    evidence(
      t,
      'apps/web/e2e/gate/signup.spec.ts',
      IMPORTING.replace("'@/actions/terms'", "'../../src/actions/terms'")
    ),
    []
  );
});

test('B8: a spec outside the gate selection is selected by no lane', t => {
  const errors = evidence(t, 'apps/web/e2e/visual/signup.spec.ts', IMPORTING);
  assert.match(errors.join('\n'), /selected by no lane/u);
});

test('B8: a Vitest exclusion removes a test from the lane', t => {
  const errors = evidence(t, `${W}/legacy/signup.test.tsx`, IMPORTING);
  assert.match(errors.join('\n'), /selected by no lane/u);
});

test('B8: a lane config whose include is not a literal list is an error, comments do not count', t => {
  assert.throws(
    () =>
      evidence(t, `${W}/app/signup/page.test.tsx`, IMPORTING, {
        'apps/web/vitest.config.ts':
          "// include: ['src/**/*.test.tsx']\nconst globs = make();\nexport default { test: { include: globs } };\n",
      }),
    /include/u
  );
});

test('B8: a test that names the export but never imports the submission module fails', t => {
  const errors = evidence(
    t,
    `${W}/app/signup/page.test.tsx`,
    `const saveTerms = async () => {};\n${BODY}`
  );
  assert.match(errors.join('\n'), /does not import/u);
});

// One field changed at a time (code-r2): each of file, submission and test is compared on its own.
for (const [field, value] of [
  ['file', `${W}/app/other/page.tsx`],
  ['submission', `${W}/actions/other.ts#saveOther`],
  ['test', `${W}/app/other/page.test.tsx`],
])
  test(`H3: a use whose ${field} alone changes under the same useId is tamper`, async () => {
    const { registryTamper } = await import('./screen-contract/registry.mjs');
    const before = registryWith(`${W}/app/signup/page.test.tsx`);
    const entry = before.get('terms');
    const text = JSON.stringify({
      version: 1,
      entries: [{ ...entry, uses: [{ ...entry.uses[0], [field]: value }] }],
    });
    const after = parseRegistry(text);
    assert.notDeepEqual(after.get('terms').uses, entry.uses);
    const found = registryTamper(before, after, { exceptions: [] }, { exceptions: [] }, () => true);
    assert.deepEqual(found, ['CHK-22#registry-changed-use:terms:signup']);
  });

test('r2 B4: a Vitest exclude that names the test file itself removes it from the lane', t => {
  const errors = evidence(t, `${W}/app/signup/page.test.tsx`, IMPORTING, {
    'apps/web/vitest.config.ts':
      "export default { test: { include: ['src/**/*.test.{ts,tsx}'], exclude: ['src/app/signup/page.test.tsx'] } };\n",
  });
  assert.match(errors.join('\n'), /selected by no lane/u);
});

test('r2 B4: a lane config that does not parse is an error even after an intact include list', t => {
  assert.throws(
    () =>
      evidence(t, `${W}/app/signup/page.test.tsx`, IMPORTING, {
        'apps/web/vitest.config.ts':
          "export default { test: { include: ['src/**/*.test.{ts,tsx}'] } };\nconst broken = {;\n",
      }),
    /vitest\.config\.ts does not parse/u
  );
});

test('r2 B4: only the default-exported config counts, not a decoy object', t => {
  const errors = evidence(t, `${W}/app/signup/page.test.tsx`, IMPORTING, {
    'apps/web/vitest.config.ts':
      "const decoy = { test: { include: ['src/**/*.test.{ts,tsx}'] } };\nexport default { test: { include: ['nothing/**/*.test.ts'] } };\n",
  });
  assert.match(errors.join('\n'), /selected by no lane/u);
});

test('r2 B4: a PR-gate project that no longer selects GATE_DEFAULT_MATCH is an error', t => {
  assert.throws(
    () =>
      evidence(t, 'apps/web/e2e/gate/signup.spec.ts', IMPORTING, {
        'apps/web/playwright.config.ts':
          "const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nconst OTHER = ['other/**/*.spec.ts'];\nexport default defineConfig({ testDir: './e2e', projects: [{ name: 'gate-ks-sq', testMatch: OTHER }, { name: 'gate-mk-contract', testMatch: GATE_DEFAULT_MATCH }] });\n",
      }),
    /gate-ks-sq does not select GATE_DEFAULT_MATCH/u
  );
});

// r3 blocker 4: a selection the scanner cannot establish statically is refused, not assumed.
const GATES = (ks, mk = "{ name: 'gate-mk-contract', testMatch: GATE_DEFAULT_MATCH }") =>
  `const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nexport default defineConfig({ testDir: './e2e', ${ks.top ?? ''}projects: [${ks.project}, ${mk}] });\n`;
const KS = "{ name: 'gate-ks-sq', testMatch: GATE_DEFAULT_MATCH }";

for (const [label, file, text] of [
  [
    'a shorthand Vitest exclude',
    'apps/web/vitest.config.ts',
    "const exclude = ['src/app/**'];\nexport default { test: { include: ['src/**/*.test.{ts,tsx}'], exclude } };\n",
  ],
  [
    'a spread after the Vitest test object fields',
    'apps/web/vitest.config.ts',
    "const more = { exclude: ['src/app/**'] };\nexport default { test: { include: ['src/**/*.test.{ts,tsx}'], ...more } };\n",
  ],
  [
    'a spread over the Vitest root config',
    'apps/web/vitest.config.ts',
    "const base = {};\nexport default { test: { include: ['src/**/*.test.{ts,tsx}'] }, ...base };\n",
  ],
  [
    'a Vitest test.dir',
    'apps/web/vitest.config.ts',
    "export default { test: { dir: 'other', include: ['src/**/*.test.{ts,tsx}'] } };\n",
  ],
  [
    'a top-level Playwright testIgnore',
    'apps/web/playwright.config.ts',
    GATES({ top: "testIgnore: ['gate/**'], ", project: KS }),
  ],
  [
    'a gate project testIgnore',
    'apps/web/playwright.config.ts',
    GATES({ project: "{ name: 'gate-ks-sq', testMatch: GATE_DEFAULT_MATCH, testIgnore: /gate/ }" }),
  ],
  [
    'a spread in a gate project',
    'apps/web/playwright.config.ts',
    `const extra = {};\n${GATES({ project: "{ name: 'gate-ks-sq', testMatch: GATE_DEFAULT_MATCH, ...extra }" })}`,
  ],
  [
    'a second Playwright defineConfig argument (r4 B2)',
    'apps/web/playwright.config.ts',
    `const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nexport default defineConfig({ testDir: './e2e', projects: [${KS}, { name: 'gate-mk-contract', testMatch: GATE_DEFAULT_MATCH }] }, { projects: [{ name: 'gate-ks-sq', testIgnore: /gate/ }] });\n`,
  ],
  [
    'a second Vitest defineConfig argument (r4 B2)',
    'apps/web/vitest.config.ts',
    "export default defineConfig({ test: { include: ['src/**/*.test.{ts,tsx}'] } }, { test: { exclude: ['src/app/**'] } });\n",
  ],
  [
    'a Vitest testNamePattern (r4 B2)',
    'apps/web/vitest.config.ts',
    "export default { test: { include: ['src/**/*.test.{ts,tsx}'], testNamePattern: 'nothing' } };\n",
  ],
  [
    'a gate project grepInvert',
    'apps/web/playwright.config.ts',
    GATES({
      project: "{ name: 'gate-ks-sq', testMatch: GATE_DEFAULT_MATCH, grepInvert: /terms/ }",
    }),
  ],
])
  test(`r3 B4: ${label} is a lane error`, t => {
    assert.throws(
      () => evidence(t, `${W}/app/signup/page.test.tsx`, IMPORTING, { [file]: text }),
      /cannot be read statically|is not modelled/u
    );
  });

test('r3 B4: the plain gate configs still read', t => {
  assert.deepEqual(
    evidence(t, `${W}/app/signup/page.test.tsx`, IMPORTING, {
      'apps/web/playwright.config.ts': GATES({ project: KS }),
    }),
    []
  );
});

// r3 blocker 1: every path the registry names is a plain repository path; a source path is a
// canonical linted source. A parent segment, an absolute path, a backslash or `|` is refused at
// the parser, before any file is read.
const ENTRY = {
  id: 'terms',
  kind: 'consent',
  file: `${W}/app/signup/page.tsx`,
  control: 'terms',
  payloadField: 'termsAccepted',
  storedIn: 'consents',
  versionSource: 'TERMS_VERSION',
  aliases: [{ file: `${W}/components/terms.tsx`, exportName: 'Terms' }],
  uses: [
    {
      useId: 'signup',
      file: `${W}/app/signup/page.tsx`,
      submission: `${ACTION}#saveTerms`,
      test: `${W}/app/signup/page.test.tsx`,
    },
  ],
};
const withEntry = entry => JSON.stringify({ version: 1, entries: [entry] });

test('r3 B1: the registry refuses a path that is not a plain repository path', () => {
  assert.equal(parseRegistry(withEntry(ENTRY)).size, 1);
  const escape = '../../../outside/secret.tsx';
  const cases = [
    ['entry file', { ...ENTRY, file: escape }],
    ['alias file', { ...ENTRY, aliases: [{ file: escape, exportName: 'Terms' }] }],
    ['use file', { ...ENTRY, uses: [{ ...ENTRY.uses[0], file: escape }] }],
    ['submission', { ...ENTRY, uses: [{ ...ENTRY.uses[0], submission: `${escape}#saveTerms` }] }],
    ['test', { ...ENTRY, uses: [{ ...ENTRY.uses[0], test: '../outside/x.test.ts' }] }],
    ['absolute test', { ...ENTRY, uses: [{ ...ENTRY.uses[0], test: '/tmp/x.test.ts' }] }],
    ['pipe file', { ...ENTRY, file: `${W}/app/a|b/page.tsx` }],
    ['dot segment', { ...ENTRY, file: `${W}/app/./signup/page.tsx` }],
  ];
  for (const [label, entry] of cases)
    assert.throws(
      () => parseRegistry(withEntry(entry)),
      /is not a (canonical source|plain) path/u,
      label
    );
});
