import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { RETIRED_LEGACY_FILES, contractTestPlan } from './contract-test-shards.mjs';

const list = JSON.parse(
  readFileSync(new URL('./contract-tooling-only.json', import.meta.url), 'utf8')
);
const current = new Set(Object.values(contractTestPlan().shards).flat());

function validateList(candidate, active = current) {
  for (const field of ['derivedOn', 'evidence']) {
    assert.ok(
      typeof candidate[field] === 'string' && candidate[field].trim(),
      `${field} is required`
    );
  }
  const { files } = candidate;
  assert.ok(Array.isArray(files), 'files must be an array');
  assert.equal(new Set(files).size, files.length, 'duplicate tooling-only test');
  for (const file of files) assert.ok(active.has(file), `inactive tooling-only test: ${file}`);
  const byCodeUnit = (a, b) => (a < b ? -1 : Number(a > b));
  assert.deepEqual(files, [...files].sort(byCodeUnit), 'tooling-only list must be sorted');
}

test('the tooling-only list records its derivation and contains sorted active contract tests', () => {
  validateList(list);
});

test('missing or empty derivation metadata fails', () => {
  for (const field of ['derivedOn', 'evidence']) {
    for (const value of [undefined, '', ' ']) {
      assert.throws(
        () => validateList({ ...list, [field]: value }),
        new RegExp(`${field} is required`, 'u')
      );
    }
  }
});

test('unknown and stale (retired, removed or renamed) entries fail', () => {
  for (const file of ['scripts/ci/nonexistent-contract.test.mjs', ...RETIRED_LEGACY_FILES]) {
    assert.throws(() => validateList({ ...list, files: [file] }), /inactive tooling-only test/u);
  }
  const renamedPlan = new Set(current);
  renamedPlan.delete(list.files[0]);
  renamedPlan.add('scripts/ci/renamed-contract.test.mjs');
  assert.throws(() => validateList(list, renamedPlan), /inactive tooling-only test/u);
});

test('duplicate and unsorted entries fail', () => {
  const [first, second] = list.files;
  assert.throws(
    () => validateList({ ...list, files: [first, first] }),
    /duplicate tooling-only test/u
  );
  assert.throws(() => validateList({ ...list, files: [second, first] }), /must be sorted/u);
});
