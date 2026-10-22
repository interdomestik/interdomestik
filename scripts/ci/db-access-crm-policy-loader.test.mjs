import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { hash } from './db-access-provider-runtime-identity.mjs';
import { loadCrmProofPolicy } from './db-access-crm-policy-loader.mjs';

const INDEX = 'scripts/ci/db-access-crm-proof-policy.json';
const SHARD = 'scripts/ci/db-access-crm-proof-data-001.json';
function fixture(t, change = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-policy-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const policy = { producerFiles: {} };
  const write = (file, value) => {
    const bytes = JSON.stringify(value);
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), bytes);
    policy.producerFiles[file] = {
      sha256: hash(bytes),
      bytes: Buffer.byteLength(bytes),
      mode: '100644',
    };
  };
  write(SHARD, change.shard ?? { kind: 'sources', value: { 'apps/a.ts': { sha256: 'a' } } });
  write(INDEX, {
    shards: change.shards ?? [SHARD],
    contract: change.contract ?? { id: 'finite', witnesses: { mountEvidence: {} } },
  });
  return { root, policy, run: () => loadCrmProofPolicy(policy, root) };
}

test('policy loader remains inactive without an authenticated CRM index', () => {
  assert.equal(loadCrmProofPolicy({}), undefined);
});
test('policy loader assembles only producer-bound shard values', t => {
  const f = fixture(t);
  assert.deepEqual(f.run().sources, { 'apps/a.ts': { sha256: 'a' } });
});
for (const [name, change, expected] of [
  ['duplicate shard', { shards: [SHARD, SHARD] }, /shard path/u],
  ['candidate-selected path', { shards: ['apps/candidate.json'] }, /shard path/u],
  ['unknown field', { shard: { kind: 'sources', value: {}, extra: true } }, /shard shape/u],
  ['unknown kind', { shard: { kind: 'runtime', value: [] } }, /shard kind/u],
  ['object in array slot', { shard: { kind: 'cases', value: {} } }, /array shard/u],
  ['array in object slot', { shard: { kind: 'sources', value: [] } }, /object shard/u],
  ['metadata overrides', { contract: { sources: {} } }, /duplicate policy part/u],
])
  test('policy loader refuses ' + name, t => assert.throws(fixture(t, change).run, expected));
test('policy loader refuses tampered source shard', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.root, SHARD), ' ');
  assert.throws(f.run, /input identity/u);
});
test('policy loader refuses a symlinked source shard', t => {
  const f = fixture(t);
  const source = path.join(f.root, SHARD);
  fs.renameSync(source, source + '.original');
  fs.symlinkSync(source + '.original', source);
  assert.throws(f.run, /symlink input/u);
});
