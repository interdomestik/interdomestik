import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { crmDigest } from './db-access-crm-proof-shape.mjs';
import {
  encodeDiagnostics,
  DIAGNOSTIC_ROWS,
} from './db-access-crm-diagnostic-encoding-fixture.mjs';
import { wireFixture, WIRE_INDEX } from './db-access-crm-wire-fixture.mjs';

test('wire index reconstructs the whole legacy contract but changes raw producer identity', t => {
  const old = wireFixture(t, { compact: false }),
    fresh = wireFixture(t);
  assert.deepEqual(fresh.run(), old.run());
  assert.equal(crmDigest(fresh.run()), crmDigest(old.run()));
  assert.notDeepEqual(fresh.policy.producerFiles, old.policy.producerFiles);
});
for (const [name, mutateIndex] of [
  [
    'unknown wire version',
    x => {
      x.wireVersion = 2;
    },
  ],
  [
    'missing wire version',
    x => {
      delete x.wireVersion;
    },
  ],
  [
    'extra wire field',
    x => {
      x.extra = true;
    },
  ],
  [
    'duplicate shard',
    x => {
      x.shards.push(x.shards[0]);
    },
  ],
  [
    'missing mount metadata',
    x => {
      delete x.mountEncoding;
    },
  ],
  [
    'wrong mount count',
    x => {
      x.mountEncoding.rootCount = 2;
    },
  ],
  [
    'inline mount roots',
    x => {
      x.contract.witnesses.mountEvidence.roots = [];
    },
  ],
  [
    'too many shards',
    x => {
      x.shards = Array(129).fill(x.shards[0]);
    },
  ],
])
  test('wire loader rejects ' + name, t => {
    assert.throws(wireFixture(t, { mutateIndex }).run, /incomplete: crm proof/u);
  });
for (const [name, values] of [
  [
    'legacy followed by compact',
    [{ kind: 'diagnostics', value: [] }, ...encodeDiagnostics(DIAGNOSTIC_ROWS)],
  ],
  [
    'compact followed by empty legacy',
    [...encodeDiagnostics(DIAGNOSTIC_ROWS), { kind: 'diagnostics', value: [] }],
  ],
  ['unknown encoding kind', [{ kind: 'diagnostics.v2.meta', value: {} }]],
  ['missing encoded diagnostics', [{ kind: 'cases', value: [] }]],
  ['non-string kind', [{ kind: 7, value: [] }]],
  ['oversized shard', [{ kind: 'sources', value: { excess: 'x'.repeat(131072) } }]],
])
  test('wire loader rejects ' + name, t => {
    assert.throws(wireFixture(t, { values }).run, /incomplete: crm proof/u);
  });
test('wire loader rejects an oversized authenticated index', t => {
  const f = wireFixture(t, {
    mutateIndex: x => {
      x.contract.padding = 'x'.repeat(131072);
    },
  });
  assert.throws(f.run, /file byte budget/u);
});
test('wire loader authenticates encoded payload before decoding', t => {
  const f = wireFixture(t);
  fs.appendFileSync(path.join(f.root, f.files[2]), ' ');
  assert.throws(f.run, /input identity/u);
});
test('wire loader refuses a missing descriptor', t => {
  const f = wireFixture(t);
  delete f.policy.producerFiles[f.files[2]];
  assert.throws(f.run, /file byte budget/u);
});
test('wire loader refuses a symlinked encoded payload', t => {
  const f = wireFixture(t),
    file = path.join(f.root, f.files[2]);
  fs.renameSync(file, file + '.original');
  fs.symlinkSync(file + '.original', file);
  assert.throws(f.run, /symlink input/u);
});
test('wire loader cannot acquire an index from an unbound source', t => {
  const f = wireFixture(t);
  delete f.policy.producerFiles[WIRE_INDEX];
  assert.equal(f.run(), undefined);
});
