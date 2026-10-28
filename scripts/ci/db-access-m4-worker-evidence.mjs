import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const names = [
  'db-access-graph-worker.mjs',
  'db-access-evaluator.mjs',
  'db-access-graph-worker-pool.mjs',
  'db-access-graph-workers.mjs',
  'db-access-m4-worker-evidence.mjs',
  'db-access-m4-worker-loader-authority.mjs',
  'db-access-m4-worker-loader-launch.mjs',
  'db-access-m4-worker-loader-image.mjs',
  'db-access-m4-worker-loader-preload.mjs',
  'db-access-m4-worker-loader-contract.json',
  'db-access-output-binding.mjs',
  'db-access-finalize.mjs',
  'db-access-m4-native-session.mjs',
  'db-access-m4-session-authority.mjs',
  'db-access-trust.mjs',
  'db-access-resolver-snapshot.mjs',
  'db-access-provider-unit-source.mjs',
  'db-access-prepare.mjs',
  'db-access-m4-worker-input.mjs',
  'db-access-inventory-wire.mjs',
  'db-access-m4-native-prerequisite.mjs',
];

const fail = reason => new Error('incomplete: graph worker ' + reason);

export function currentM4ProducerSeal() {
  const policyBytes = fs.readFileSync(
    new URL('./db-access-provider-unit-policy.json', import.meta.url)
  );
  const policy = JSON.parse(policyBytes);
  const hashes = names.map(name => {
    const file = fileURLToPath(new URL('./' + name, import.meta.url));
    const expected = policy.producerFiles['scripts/ci/' + name];
    const bytes = fs.readFileSync(file);
    const stat = fs.lstatSync(file);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (
      !expected ||
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      fs.realpathSync(file) !== file ||
      bytes.length !== expected.bytes ||
      digest !== expected.sha256 ||
      (stat.mode & 0o111 ? '100755' : '100644') !== expected.mode
    )
      throw fail('sealed producer URL/code mismatch');
    return digest;
  });
  return createHash('sha256').update(policyBytes).update(JSON.stringify(hashes)).digest('hex');
}

// Pure wire formatting, shared by qualified and ordinary observation transport.
export function expectedM4TransportAck(wire, used, jobId) {
  return {
    channelId: wire.channelId,
    requestId: wire.requestId,
    snapshot: wire.snapshot,
    inventoryDigest: wire.inventoryDigest,
    inventoryCount: wire.inventoryCount,
    modelDigest: wire.modelDigest,
    sourcePolicyDigest: wire.sourcePolicyDigest,
    sourceBookends: wire.sourceBookends,
    used,
    ...(jobId === undefined ? {} : { jobId }),
  };
}
