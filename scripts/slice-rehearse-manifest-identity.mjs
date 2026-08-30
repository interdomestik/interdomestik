import { must, positiveInteger } from './slice-rehearse-canonical.mjs';

const SHA40 = /^[0-9a-f]{40}$/u;
const ORIGIN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/u;

export function normalizeManifestIdentity(input, sliceId) {
  const tier = positiveInteger(input.tier, 'tier');
  must(tier <= 4, 'tier is invalid');
  must(SHA40.test(input.baseSha), 'base SHA is invalid');
  must(typeof input.origin === 'string' && ORIGIN.test(input.origin), 'origin is invalid');
  if (input.schemaVersion === 1) return { tier, versionFields: {} };
  const { capacityOwnerId, workClass } = input;
  must(['governance', 'product'].includes(workClass), 'work class is invalid');
  must(
    typeof capacityOwnerId === 'string' && /^[a-z][a-z0-9-]+$/u.test(capacityOwnerId),
    'capacity owner ID is invalid'
  );
  if (workClass === 'product') {
    must(capacityOwnerId === sliceId.toLowerCase(), 'product capacity owner must match slice');
  }
  return { tier, versionFields: { capacityOwnerId, workClass } };
}
