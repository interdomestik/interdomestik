// Contract tests of CHK-22's test evidence (WP-05 code review r1: B8). A use's test counts only
// when the lane selection, parsed from the lane configs, selects it, and when it imports the
// registered submission module and names its export.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRegistry, readLanes, testEvidence } from './screen-contract/registry.mjs';
import { W } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { tree } from './fixtures/screen-contract-check/harness.mjs';

const ACTION = `${W}/actions/terms.ts`;
const PLAYWRIGHT =
  "const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nconst GATE_KS = [...GATE_DEFAULT_MATCH, 'security/a.spec.ts'];\nexport default defineConfig({ testDir: './e2e', projects: [{ name: 'gate-ks-sq', testMatch: GATE_KS }, { name: 'gate-mk-contract', testMatch: GATE_DEFAULT_MATCH }, { name: 'visual', testMatch: ['visual/**/*.spec.ts'] }] });\n";
const VITEST =
  "export default { test: { include: ['src/**/*.test.{ts,tsx}'], exclude: ['node_modules', 'src/legacy/**'] } };\n";

const registryWith = testFile =>
  parseRegistry(
    JSON.stringify({
      version: 1,
      entries: [
        {
          id: 'terms',
          kind: 'consent',
          file: `${W}/app/signup/page.tsx`,
          control: 'terms',
          payloadField: 'termsAccepted',
          storedIn: 'consents',
          versionSource: 'TERMS_VERSION',
          uses: [
            {
              useId: 'signup',
              file: `${W}/app/signup/page.tsx`,
              submission: `${ACTION}#saveTerms`,
              test: testFile,
            },
          ],
        },
      ],
    })
  );

const BODY = [
  "it('terms signup stores termsAccepted in consents with TERMS_VERSION and acceptedAt', async () => {",
  '  await saveTerms({ termsAccepted: true });',
  '});',
  '',
].join('\n');
const IMPORTING = `import { saveTerms } from '@/actions/terms';\n${BODY}`;

function evidence(t, testFile, text, lanes = {}) {
  const root = tree(t, {
    'apps/web/vitest.config.ts': VITEST,
    'apps/web/playwright.config.ts': PLAYWRIGHT,
    [ACTION]: "'use server';\nexport async function saveTerms() {}\n",
    [testFile]: text,
    ...lanes,
  });
  return testEvidence(root, registryWith(testFile), readLanes(root));
}

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

test('r2 B5: a different helper from the module plus a local stub of the export does not count', t => {
  const text = `import { otherHelper } from '@/actions/terms';\nconst saveTerms = async () => otherHelper();\n${BODY}`;
  const errors = evidence(t, `${W}/app/signup/page.test.tsx`, text, {
    [ACTION]:
      "'use server';\nexport async function saveTerms() {}\nexport function otherHelper() {}\n",
  });
  assert.match(errors.join('\n'), /does not use the submission export saveTerms/u);
});

test('r2 B5: an imported but unused export does not count', t => {
  const text = `import { saveTerms } from '@/actions/terms';\nit('terms signup termsAccepted consents TERMS_VERSION acceptedAt', () => {});\n`;
  const errors = evidence(t, `${W}/app/signup/page.test.tsx`, text);
  assert.match(errors.join('\n'), /does not use the submission export saveTerms/u);
});

test('r2 B5: a namespace import used as ns.export, and an aliased import, count', t => {
  const ns = `import * as actions from '@/actions/terms';\n${BODY.replace('await saveTerms(', 'await actions.saveTerms(')}`;
  assert.deepEqual(evidence(t, `${W}/app/signup/page.test.tsx`, ns), []);
  const aliased = `import { saveTerms as submit } from '@/actions/terms';\n${BODY.replace('await saveTerms(', 'await submit(')}`;
  assert.deepEqual(evidence(t, `${W}/app/signup/page.test.tsx`, aliased), []);
});
