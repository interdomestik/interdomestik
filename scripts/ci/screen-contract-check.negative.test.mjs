// Negative inputs at the production CLI (WP-05 design §5; code review r1, H7): each malformed,
// partial, empty or missing input is a scanner error (exit 2), never a clean report.
import assert from 'node:assert/strict';
import test from 'node:test';

import { lintTree } from './screen-contract/lint.mjs';
import {
  BASELINE,
  DB_IMPORT,
  INPUTS,
  REBUILT,
  REG,
  W,
  adopted,
  asText,
  baselineData,
  scan,
} from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { commit, git, repo, tree } from './fixtures/screen-contract-check/harness.mjs';

function expectError(t, { base: baseFiles = {}, head: headFiles }, pattern) {
  const { root, base } = adopted(t, undefined, baseFiles);
  const head = commit(root, headFiles);
  const result = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(result.code, 2, JSON.stringify(result.report?.checks?.['CHK-15c'] ?? result.stderr));
  assert.match((result.report?.errors ?? []).join('\n'), pattern);
}

function baseOnly(t, baselineText, pattern) {
  const root = repo(t, { ...INPUTS, [BASELINE]: baselineText });
  const base = git(root, 'rev-parse', 'HEAD');
  const good = asText(baselineData());
  const head = commit(root, { [BASELINE]: good });
  const result = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(result.code, 2);
  assert.match(result.report.errors.join('\n'), pattern);
}

test('H7: a malformed or partial trusted base baseline is an error', t => {
  baseOnly(t, '{', /base baseline is not valid JSON/u);
  const partial = baselineData();
  delete partial.exceptions;
  baseOnly(t, asText(partial), /base baseline has no exceptions list/u);
  const badCheck = baselineData();
  badCheck.checks['CHK-15c'].mode = 'loud';
  baseOnly(t, asText(badCheck), /unknown mode/u);
});

test('H7: an empty, malformed or non-list rebuilt list is an error', t => {
  expectError(t, { head: { [REBUILT]: '' } }, /rebuilt-screens list is missing or empty/u);
  expectError(t, { head: { [REBUILT]: '{' } }, /rebuilt-screens list is not valid JSON/u);
  expectError(t, { head: { [REBUILT]: '{"a":1}\n' } }, /rebuilt-screens list is not a list/u);
});

const page = `${W}/app/signup/page.tsx`;
const entry = (kind, testFile, more = {}) => ({
  id: 'terms',
  kind,
  file: page,
  control: 'terms',
  ...(kind === 'consent'
    ? { payloadField: 'acceptTerms', storedIn: 'consents', versionSource: 'TERMS_VERSION' }
    : { storedIn: 'plans' }),
  uses: [
    {
      useId: 'signup',
      file: page,
      submission: `${W}/actions/consent.ts#saveTerms`,
      test: testFile,
    },
  ],
  ...more,
});

test('H7: a use test that is missing or empty is an error', t => {
  const testFile = `${W}/app/signup/terms.test.ts`;
  const registry = JSON.stringify({ version: 1, entries: [entry('consent', testFile)] });
  expectError(t, { head: { [REG]: registry } }, /terms\.test\.ts is missing/u);
  expectError(t, { head: { [REG]: registry, [testFile]: '\n' } }, /terms\.test\.ts is empty/u);
});

test('H7: selection evidence without selectedRecord is an error', t => {
  const registry = JSON.stringify({
    version: 1,
    entries: [entry('selection', `${W}/app/signup/terms.test.ts`)],
  });
  expectError(t, { head: { [REG]: registry } }, /has no selectedRecord/u);
});

test('H7: a malformed package manifest or web tsconfig is an error', t => {
  expectError(t, { head: { 'packages/broken/package.json': '{' } }, /package/u);
  expectError(t, { head: { 'apps/web/tsconfig.json': '{ "compilerOptions": ' } }, /tsconfig/u);
});

test('H7: a screen that does not parse is a fatal lint error, not a clean file', t => {
  expectError(
    t,
    { head: { [`${W}/app/broken/page.tsx`]: 'export default () => <div>;\n' } },
    /fatal/u
  );
});

test('H7: an expected file that is missing from the lint results is an error', async t => {
  const root = tree(t, { [`${W}/app/ok/page.tsx`]: DB_IMPORT });
  await assert.rejects(lintTree(root, [`${W}/app/ok/page.tsx`, `${W}/app/gone/page.tsx`]), /gone/u);
});
