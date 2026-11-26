import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fixtureSource, inventoryFixture } from './inventory-fixture.mjs';
import { repositoryInventory } from './inventory.mjs';

test('a browser spec with database fixtures requires an individual exclusion', t => {
  const file = 'apps/web/e2e/gate/fixture/database-helpers.spec.ts';
  const root = inventoryFixture(t, [[file, fixtureSource('browser-spec')]]);
  assert.throws(() => repositoryInventory(root), {
    message: `Database tests with no CI lane: ${file}`,
  });

  const manifest = join(root, 'scripts/ci/db-lanes/exclusions.json');
  const exclusions = JSON.parse(readFileSync(manifest, 'utf8'));
  const exclusion = {
    file,
    reason: 'Runs in the Playwright gate lanes with database fixtures.',
    owner: 'Web E2E',
    removeWhen: 'A standalone database proof replaces the fixture.',
  };
  writeFileSync(manifest, JSON.stringify([...exclusions, exclusion]));
  assert.deepEqual(
    repositoryInventory(root).find(row => row.file === file),
    {
      file,
      lanes: [],
      exclusion,
    }
  );
});
