import fs from 'node:fs';
import { createHash } from 'node:crypto';

const MAIN = 'db-access-message-proof-policy.json';
const SHARDS = Object.freeze([
  'db-access-message-proof-witnesses-1.json',
  'db-access-message-proof-witnesses-2.json',
]);
const fail = reason => {
  throw new Error('incomplete: fixed message policy ' + reason);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Only literal files beside this immutable producer module are read. Neither a candidate
// checkout, a report, nor a public option selects a policy or witness-data location.
export function loadMessageProofPolicy(providerPolicy) {
  if (!providerPolicy.producerFiles?.['scripts/ci/' + MAIN]) return undefined;
  function read(file) {
    const expected = providerPolicy.producerFiles['scripts/ci/' + file];
    const location = new URL('./' + file, import.meta.url);
    const stat = fs.lstatSync(location);
    if (!expected || !stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024)
      fail('nonregular or unbound data ' + file);
    const bytes = fs.readFileSync(location);
    if (
      (stat.mode & 0o111 ? '100755' : '100644') !== expected.mode ||
      bytes.length !== expected.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== expected.sha256
    )
      fail('source mismatch ' + file);
    return JSON.parse(bytes);
  }
  const contract = read(MAIN);
  if (contract.witnessInventory?.state !== 'bound') {
    if (contract.unknownWitnessShards !== undefined) fail('shards require bound inventory');
    return contract;
  }
  if (
    contract.id !== 's8-message-integration-proof-v2' ||
    contract.version !== 2 ||
    !same(contract.unknownWitnessShards, SHARDS) ||
    !Array.isArray(contract.unknownWitnesses) ||
    contract.unknownWitnesses.length !== 0
  )
    fail('shard contract');
  contract.unknownWitnesses = SHARDS.flatMap(file => {
    const shard = read(file);
    if (
      !same(Object.keys(shard).sort(), ['contractId', 'unknownWitnesses', 'version']) ||
      shard.version !== 1 ||
      shard.contractId !== contract.id ||
      !Array.isArray(shard.unknownWitnesses) ||
      !shard.unknownWitnesses.length
    )
      fail('shard shape ' + file);
    return shard.unknownWitnesses;
  });
  if (contract.unknownWitnesses.length !== contract.witnessInventory.diagnostics)
    fail('shard inventory count');
  return contract;
}
