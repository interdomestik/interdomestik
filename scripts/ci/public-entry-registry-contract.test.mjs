import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';
import { REGISTRY_PATH, parseRegistry } from './server-mutation/registry.mjs';
import { REPO_ROOT } from './fixtures/server-mutation-check/harness.mjs';

const OWNER = 'public-entry-registry-contract';
const canonical = text => text === `${JSON.stringify(JSON.parse(text), null, 2)}\n`;

test('the public-entry registry has one exact modularity owner', () => {
  for (const spelling of [REGISTRY_PATH, `/${REGISTRY_PATH}`, REGISTRY_PATH.replaceAll('/', '\\')])
    assert.equal(structuredArtifactOwner(spelling), OWNER, spelling);
  for (const sibling of [
    'apps/web/src/lib/other.json',
    'apps/web/src/lib/public-entry-points.jsonl',
    'apps/web/src/lib/x/public-entry-points.json',
  ])
    assert.equal(structuredArtifactOwner(sibling), null, sibling);
  assert.equal(
    structuredArtifactOwner('scripts/ci/server-mutation-baseline.json'),
    'script-config-contract'
  );
});

test('the registry at the owned path parses under the scanner schema and is canonical JSON', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, REGISTRY_PATH), 'utf8');
  const registry = parseRegistry(text);
  assert.ok(registry.entries.length > 0);
  assert.ok(canonical(text), 'two-space JSON with a final newline');
});

test('the registry contract refuses a non-canonical or schema-breaking copy', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, REGISTRY_PATH), 'utf8');
  const parsed = JSON.parse(text);
  assert.throws(() => parseRegistry(JSON.stringify({ ...parsed, entries: [] })), /no entries/u);
  const [first] = parsed.entries;
  assert.throws(
    () =>
      parseRegistry(
        JSON.stringify({ ...parsed, entries: [{ ...first, closedBy: { setting: 'x' } }] })
      ),
    /closedBy must be null/u
  );
  assert.equal(canonical(JSON.stringify(parsed)), false, 'a minified copy is not canonical');
  assert.equal(
    canonical(text.trimEnd()),
    false,
    'a copy without the final newline is not canonical'
  );
});
