import { must, positiveInteger } from './slice-rehearse-canonical.mjs';

const SHA40 = /^[0-9a-f]{40}$/u;
const ORIGIN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/u;
const GOVERNANCE = new Set(['harness-v2-efficiency']);

export function normalizeManifestIdentity(input, sliceId) {
  const tier = positiveInteger(input.tier, 'tier');
  must(tier <= 4, 'invalid tier');
  must(SHA40.test(input.baseSha), 'invalid base SHA');
  must(typeof input.origin === 'string' && ORIGIN.test(input.origin), 'invalid origin');
  if (input.schemaVersion === 1) return { tier, versionFields: {} };
  const { capacityOwnerId: owner, workClass: kind } = input;
  must(['governance', 'product'].includes(kind), 'invalid work class');
  must(typeof owner === 'string' && /^[a-z][a-z0-9-]+$/u.test(owner), 'invalid capacity owner ID');
  if (kind === 'product') {
    must(owner === sliceId.toLowerCase(), 'product owner differs from slice');
  } else {
    must(
      GOVERNANCE.has(owner) ||
        (input.topology?.closeoutMode === 'promotion' && owner === sliceId.toLowerCase()),
      'governance capacity owner must use an explicit governance allocation'
    );
  }
  return { tier, versionFields: { capacityOwnerId: owner, workClass: kind } };
}
