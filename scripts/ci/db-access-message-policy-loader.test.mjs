import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const MAIN = 'db-access-message-proof-policy.json';
const SHARDS = [
  'db-access-message-proof-witnesses-1.json',
  'db-access-message-proof-witnesses-2.json',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'message-policy-loader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.copyFileSync(
    new URL('./db-access-message-policy-loader.mjs', import.meta.url),
    path.join(root, 'loader.mjs')
  );
  const policy = { producerFiles: {} };
  const write = (name, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    fs.writeFileSync(path.join(root, name), bytes);
    policy.producerFiles['scripts/ci/' + name] = {
      mode: '100644',
      bytes: bytes.length,
      sha256: hash(bytes),
    };
  };
  const contract = {
    id: 's8-message-integration-proof-v2',
    version: 2,
    witnessInventory: { state: 'bound', diagnostics: 2 },
    unknownWitnesses: [],
    unknownWitnessShards: [...SHARDS],
  };
  const rows = SHARDS.map((_, i) => ({
    file: 'packages/private-fixture.ts',
    reason: 'exact-' + i,
    occurrences: i + 1,
  }));
  write(MAIN, contract);
  SHARDS.forEach((name, i) =>
    write(name, { version: 1, contractId: contract.id, unknownWitnesses: [rows[i]] })
  );
  const { loadMessageProofPolicy: load } = await import(
    pathToFileURL(path.join(root, 'loader.mjs'))
  );
  return { root, policy, write, contract, rows, load };
}

test('literal authenticated shards preserve every tuple and its multiplicity', async t => {
  const f = await fixture(t);
  assert.deepEqual(f.load(f.policy).unknownWitnesses, f.rows);
  assert.equal(f.load({ producerFiles: {} }), undefined, 'absent contract never supplies proof');
});

for (const file of [MAIN, ...SHARDS]) {
  test(file + ' refuses changed bytes, hash, mode and symlink', async t => {
    const f = await fixture(t);
    const target = path.join(f.root, file);
    const bytes = fs.readFileSync(target);
    const descriptor = f.policy.producerFiles['scripts/ci/' + file];
    fs.appendFileSync(target, ' ');
    assert.throws(() => f.load(f.policy), /source mismatch/);
    fs.writeFileSync(target, bytes);
    descriptor.sha256 = '0'.repeat(64);
    assert.throws(() => f.load(f.policy), /source mismatch/);
    descriptor.sha256 = hash(bytes);
    fs.chmodSync(target, 0o755);
    assert.throws(() => f.load(f.policy), /source mismatch/);
    fs.chmodSync(target, 0o644);
    fs.renameSync(target, target + '.real');
    fs.symlinkSync(target + '.real', target);
    assert.throws(() => f.load(f.policy), /nonregular/);
  });
}

test('unbound, missing and oversized shards fail before parsing or acceptance', async t => {
  const f = await fixture(t);
  const entry = f.policy.producerFiles['scripts/ci/' + SHARDS[0]];
  delete f.policy.producerFiles['scripts/ci/' + SHARDS[0]];
  assert.throws(() => f.load(f.policy), /unbound/);
  f.policy.producerFiles['scripts/ci/' + SHARDS[0]] = entry;
  fs.writeFileSync(path.join(f.root, SHARDS[0]), ' '.repeat(128 * 1024 + 1));
  assert.throws(() => f.load(f.policy), /nonregular or unbound/);
  fs.unlinkSync(path.join(f.root, SHARDS[0]));
  assert.throws(() => f.load(f.policy), /ENOENT/);
});

test('only the fixed two shard names, empty inline data and bound V2 are supported', async t => {
  const f = await fixture(t);
  for (const mutate of [
    c => c.unknownWitnessShards.reverse(),
    c => c.unknownWitnessShards.pop(),
    c => c.unknownWitnessShards.push('candidate-selected.json'),
    c => (c.unknownWitnessShards[0] = '../outside.json'),
    c => c.unknownWitnesses.push(f.rows[0]),
    c => (c.id = 's8-message-integration-proof-v1'),
    c => (c.version = 1),
    c => (c.witnessInventory.state = 'hold'),
  ]) {
    const c = structuredClone(f.contract);
    mutate(c);
    f.write(MAIN, c);
    assert.throws(() => f.load(f.policy), /shard/);
  }
});

test('foreign wrappers, extra keys, empty data and changed inventory counts refuse', async t => {
  const f = await fixture(t);
  const wrapper = { version: 1, contractId: f.contract.id, unknownWitnesses: [f.rows[0]] };
  for (const mutate of [
    x => (x.version = 2),
    x => (x.contractId = 'foreign'),
    x => (x.acceptedReceipt = true),
    x => (x.unknownWitnesses = []),
    x => (x.unknownWitnesses = {}),
  ]) {
    const x = structuredClone(wrapper);
    mutate(x);
    f.write(SHARDS[0], x);
    assert.throws(() => f.load(f.policy), /shard shape/);
  }
  f.write(SHARDS[0], wrapper);
  const c = structuredClone(f.contract);
  c.witnessInventory.diagnostics = 3;
  f.write(MAIN, c);
  assert.throws(() => f.load(f.policy), /inventory count/);
});
