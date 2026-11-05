import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY, LEGACY_PINS } from './tenant-guard/manifest.mjs';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { evaluate } from './tenant-guard/rules.mjs';
import { KERNEL, PACKAGES, assertRefused, pinsOf } from './tenant-guard-test-support.mjs';

// A reviewed kernel transition: a legacy entry may list the previous reviewed digest and the
// digest of one exact reviewed successor kernel, so the guard accepts protected main before and
// after the successor merges, and nothing else. A legacy caller in unchanged code stays C1-admitted
// on both sides because a legacy entry is judged by its pin, not by comparison with the trusted tree.
const DB = 'packages/database/src/db.ts';
const LIFETIME = 'packages/database/src/lifetime.ts';
const CALLER = {
  'apps/web/src/read.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "import { db } from '@interdomestik/database/db';",
    'export function read(session: any) {',
    '  return withTenantContext({ tenantId: session.user.tenantId }, tx => tx.select());',
    '}',
    'export function ping() { return db.select(); }',
  ].join('\n'),
};
const SUCCESSOR = {
  [LIFETIME]: 'export function expire<T>(client: T): T { return Object.freeze(client); }\n',
  [DB]: [
    "import { expire } from './lifetime';",
    'export const dbRls: any = expire({});',
    'export const db: any = dbRls;',
    'export const dbAdmin: any = {};',
  ].join('\n'),
};
const trusted = new Map(Object.entries({ ...KERNEL, ...CALLER }));
const treeOf = changes => new Map([...trusted, ...Object.entries(changes)]);

function scan(sources, legacyPins) {
  const graph = createModuleGraph({
    sources,
    packages: PACKAGES,
    appAliases: [['@/', 'apps/web/src/']],
  });
  return evaluate({ sources, trusted, graph, contracts: [], legacyPins });
}

// Every legacy entry pinned to [previous, successor], as the manifest does for a transition.
function transitionPins(previous, successor) {
  return new Map(
    [...previous].map(([key, digest]) => [key, Object.freeze([digest, successor.get(key)])])
  );
}

test('a transition pin accepts the previous and the reviewed successor kernel only', () => {
  const successorTree = treeOf(SUCCESSOR);
  const previous = pinsOf(trusted);
  const successor = pinsOf(successorTree);
  assert.notDeepEqual(previous, successor, 'the successor changes every legacy closure');
  const pins = transitionPins(previous, successor);

  assert.deepEqual(scan(trusted, pins).violations, [], 'protected main before the successor');
  const after = scan(successorTree, pins);
  assert.deepEqual(after.violations, [], 'the reviewed successor, with C1 callers admitted');
  assert.ok(after.telemetry.legacyAccepted > 0, 'the unchanged legacy callers were judged');

  // One byte in either successor file is a third kernel, which no pin admits.
  for (const path of [LIFETIME, DB]) {
    const drifted = scan(treeOf({ ...SUCCESSOR, [path]: `${SUCCESSOR[path]} ` }), pins);
    assertRefused(drifted, 'pin', /legacy kernel entry differs from its reviewed contract/u);
    assertRefused(drifted, 'C1', /depends on changed code/u);
  }
});

test('without the successor digest the same kernel change is refused', () => {
  const result = scan(treeOf(SUCCESSOR), pinsOf(trusted));
  assertRefused(result, 'pin', /legacy kernel entry differs from its reviewed contract/u);
  assertRefused(result, 'C1', /depends on changed code \(db\)/u);
});

test('the manifest pins every legacy entry to frozen, distinct reviewed digests', () => {
  assert.deepEqual([...LEGACY_PINS.keys()].sort(), [...LEGACY.keys()].sort());
  for (const [key, pinned] of LEGACY_PINS) {
    const digests = [pinned].flat();
    assert.ok(digests.length >= 1 && digests.length <= 2, `${key}: one pin or one transition`);
    assert.equal(new Set(digests).size, digests.length, `${key}: digests are distinct`);
    for (const digest of digests) assert.match(digest, /^[0-9a-f]{64}$/u, key);
    if (Array.isArray(pinned)) assert.ok(Object.isFrozen(pinned), `${key}: frozen transition`);
  }
});
