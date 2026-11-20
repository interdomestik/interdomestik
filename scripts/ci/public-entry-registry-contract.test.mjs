// The public-entry registry's modularity owner (design §8.1.2): fixtures only, never the shipped
// registry, so a formatting edit of the real file is judged by the advisory scanner, not here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';
import { ScanError } from './server-mutation/ast.mjs';
import { REGISTRY_PATH, loadRegistry, parseRegistry } from './server-mutation/registry.mjs';
import {
  json,
  pageEntry,
  registryOf,
  tempDir,
  writeTree,
} from './fixtures/server-mutation-check/harness.mjs';

const OWNER = 'public-entry-registry-contract';
const canonical = text => text === `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
const FIXTURE = registryOf([pageEntry('page-home', 'apps/web/src/app/page.tsx')]);

function fixtureAt(t, text) {
  const root = writeTree(tempDir(t, 'registry-'), { [REGISTRY_PATH]: text });
  return { root, text: fs.readFileSync(path.join(root, REGISTRY_PATH), 'utf8') };
}

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

test('a canonical fixture at the registry path parses and is canonical', t => {
  const { root, text } = fixtureAt(t, json(FIXTURE));
  assert.equal(structuredArtifactOwner(REGISTRY_PATH), OWNER);
  assert.ok(canonical(text), 'two-space JSON with a final newline');
  assert.equal(loadRegistry(root).entries.length, 1);
});

test('non-canonical fixtures at the registry path are refused', t => {
  for (const variant of [JSON.stringify(FIXTURE), json(FIXTURE).trimEnd()]) {
    const { text } = fixtureAt(t, variant);
    assert.equal(canonical(text), false, JSON.stringify(variant.slice(-12)));
    assert.ok(parseRegistry(text), 'formatting alone does not break the schema');
  }
});

test('schema-breaking fixtures are refused by the scanner schema', () => {
  assert.throws(() => parseRegistry(JSON.stringify({ ...FIXTURE, entries: [] })), /no entries/u);
  const [first] = FIXTURE.entries;
  const closed = { ...FIXTURE, entries: [{ ...first, closedBy: { setting: 'x' } }] };
  assert.throws(() => parseRegistry(JSON.stringify(closed)), /closedBy must be null/u);
  assert.throws(() => parseRegistry('{'), Error);
});

// A kind named like an Object.prototype member is an unknown kind, refused as a scan error, never
// dispatched through the prototype (CodeQL js/unvalidated-dynamic-method-call on PR 2096).
test('a kind named like an Object.prototype member is refused as an unknown kind', () => {
  const [first] = FIXTURE.entries;
  for (const kind of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    const named = { ...FIXTURE, entries: [{ ...first, kind }] };
    assert.throws(
      () => parseRegistry(JSON.stringify(named)),
      error => error instanceof ScanError && /has an unknown kind/u.test(error.message),
      kind
    );
  }
});
