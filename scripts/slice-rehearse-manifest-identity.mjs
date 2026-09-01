import { must, positiveInteger } from './slice-rehearse-canonical.mjs';

export function normalizeManifestIdentity(input, sliceId) {
  const tier = positiveInteger(input.tier, 'tier');
  must(
    tier <= 4 &&
      /^[0-9a-f]{40}$/u.test(input.baseSha) &&
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/u.test(input.origin),
    'invalid tier/base/origin'
  );
  const promotion = input.topology?.closeoutMode === 'promotion';
  must(
    !promotion ||
      (input.schemaVersion === 2 &&
        Array.isArray(input.writerPaths) &&
        input.writerPaths?.filter(p => p.includes(`-${sliceId.toLowerCase()}-`)).length === 2),
    'promotion mismatch'
  );
  if (input.schemaVersion === 1) return { tier, versionFields: {} };
  const { capacityOwnerId: owner, workClass: kind } = input;
  const owns = owner === sliceId.toLowerCase();
  must(
    ['governance', 'product'].includes(kind) &&
      typeof owner === 'string' &&
      /^[a-z][a-z0-9-]+$/u.test(owner),
    'owner'
  );
  must(
    kind === 'product' ? owns : owner === 'harness-v2-efficiency' || (promotion && owns),
    kind === 'product' ? 'product owner' : 'explicit governance allocation'
  );
  return { tier, versionFields: { capacityOwnerId: owner, workClass: kind } };
}
