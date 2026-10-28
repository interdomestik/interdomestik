import assert from 'node:assert/strict';
import test from 'node:test';
import { crmDigest } from './db-access-crm-proof-shape.mjs';
import { createCrmMountWire } from './db-access-crm-mount-wire.mjs';

function fixture() {
  const logical = {
    version: 1,
    analysisIncomplete: true,
    roots: [
      { file: 'apps/a.ts', symbol: 'a' },
      { file: 'apps/b.ts', symbol: 'b' },
    ],
    operations: [{ identity: 'operation-a', roots: ['apps/a.ts'] }],
  };
  const index = {
    mountEncoding: {
      version: 1,
      rootCount: 2,
      operationCount: 1,
      expandedDigest: crmDigest(logical),
    },
    contract: { witnesses: { mountEvidence: { version: 1, analysisIncomplete: true } } },
  };
  const shards = [
    { kind: 'mount-roots', value: { offset: 0, items: [logical.roots[0]] } },
    { kind: 'mount-roots', value: { offset: 1, items: [logical.roots[1]] } },
    { kind: 'mount-operations', value: { offset: 0, items: logical.operations } },
  ];
  return { logical, index, shards };
}
function decode(f) {
  const wire = createCrmMountWire(f.index);
  for (const [at, shard] of f.shards.entries()) assert.equal(wire.accept(shard, at), true);
  return wire.finish();
}
test('mount transport reconstructs exact logical value and preserves incompleteness', () => {
  const f = fixture(),
    result = decode(f);
  assert.deepEqual(result, f.logical);
  assert.equal(result.analysisIncomplete, true);
  assert.equal(crmDigest(result), crmDigest(f.logical));
});
test('mount collector leaves unrelated kinds to the loader', () => {
  const f = fixture(),
    wire = createCrmMountWire(f.index);
  assert.equal(wire.accept({ kind: 'sources', value: {} }), false);
});
for (const [name, change] of [
  [
    'unknown version',
    f => {
      f.index.mountEncoding.version = 2;
    },
  ],
  [
    'extra metadata',
    f => {
      f.index.mountEncoding.extra = true;
    },
  ],
  [
    'missing count',
    f => {
      delete f.index.mountEncoding.rootCount;
    },
  ],
  [
    'non-safe count',
    f => {
      f.index.mountEncoding.rootCount = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'zero count',
    f => {
      f.index.mountEncoding.operationCount = 0;
    },
  ],
  [
    'invalid digest',
    f => {
      f.index.mountEncoding.expandedDigest = 'x';
    },
  ],
  [
    'mixed inline roots',
    f => {
      f.index.contract.witnesses.mountEvidence.roots = [];
    },
  ],
  [
    'wrong incomplete type',
    f => {
      f.index.contract.witnesses.mountEvidence.analysisIncomplete = 'false';
    },
  ],
  [
    'gap',
    f => {
      f.shards[1].value.offset = 2;
    },
  ],
  [
    'overlap',
    f => {
      f.shards[1].value.offset = 0;
    },
  ],
  [
    'fractional offset',
    f => {
      f.shards[1].value.offset = 0.5;
    },
  ],
  [
    'extra span fields',
    f => {
      f.shards[0].value.extra = true;
    },
  ],
  [
    'empty span',
    f => {
      f.shards[0].value.items = [];
    },
  ],
  [
    'missing roots',
    f => {
      f.shards.splice(1, 1);
    },
  ],
  [
    'missing operations',
    f => {
      f.shards.pop();
    },
  ],
  [
    'extra roots',
    f => {
      f.shards[1].value.items.push({ file: 'apps/c.ts' });
    },
  ],
  [
    'operation before roots',
    f => {
      f.shards.unshift(f.shards.pop());
    },
  ],
  [
    'duplicate root span',
    f => {
      f.shards.splice(1, 0, f.shards[0]);
    },
  ],
  [
    'changed root',
    f => {
      f.shards[0].value.items[0].file = 'apps/foreign.ts';
    },
  ],
  [
    'changed digest',
    f => {
      f.index.mountEncoding.expandedDigest = '0'.repeat(64);
    },
  ],
  [
    'changed incomplete flag',
    f => {
      f.index.contract.witnesses.mountEvidence.analysisIncomplete = false;
    },
  ],
])
  test('mount transport rejects ' + name, () => {
    const f = fixture();
    change(f);
    assert.throws(() => decode(f), /incomplete: crm proof mount wire/u);
  });
