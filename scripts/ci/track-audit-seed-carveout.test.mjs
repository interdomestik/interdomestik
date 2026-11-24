import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import yaml from 'js-yaml';

import { regexViolations } from '../lib/track-audit-rules.mjs';
import { CONTRACT_PATH } from '../track-audit.mjs';
import { root } from './track-audit-fixtures.mjs';

const contract = yaml.load(fs.readFileSync(path.join(root, CONTRACT_PATH), 'utf8'));
const check = contract.checks.find(({ id }) => id === 'seeding.no_seed_imports_outside_database');
assert.ok(check, 'the contract must include the seed import rule');

const classifier = '@interdomestik/database/seed-target-classification';
const quotes = ["'", '"'];

test('seed import rule allows the exact classifier export with either quote style', () => {
  for (const quote of quotes) {
    const source = `import { x } from ${quote}${classifier}${quote};`;
    assert.deepEqual(regexViolations(check, source), [], source);
  }
});

for (const specifier of [
  `${classifier}-x`,
  `../${classifier}`,
  '@interdomestik/database/src/seed-target-classification',
  '@interdomestik/database/seed-golden',
  '@interdomestik/database/seed-packs/x',
  '@interdomestik/database/seed.ts',
  '../../packages/database/src/seed-golden',
]) {
  test(`seed import rule still refuses ${specifier}`, () => {
    for (const quote of quotes) {
      const source = `import { x } from ${quote}${specifier}${quote};`;
      assert.ok(regexViolations(check, source).length > 0, source);
    }
  });
}

test('seed import rule refuses a seed import alongside an allowed classifier import', () => {
  const source = `import { x } from '${classifier}';
import { y } from '@interdomestik/database/seed-golden';`;
  assert.equal(regexViolations(check, source).length, 1);
});
