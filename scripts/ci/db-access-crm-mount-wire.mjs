import { crmDigest, failCrm } from './db-access-crm-proof-shape.mjs';

const fields = (value, names) => {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join(',') !== names.slice().sort().join(',')
  )
    failCrm('mount wire fields');
};

// This transport collector does not classify or resolve any mount evidence.
export function createCrmMountWire(index) {
  const meta = index.mountEncoding;
  fields(meta, ['version', 'rootCount', 'operationCount', 'expandedDigest']);
  if (
    meta.version !== 1 ||
    !Number.isSafeInteger(meta.rootCount) ||
    meta.rootCount < 1 ||
    !Number.isSafeInteger(meta.operationCount) ||
    meta.operationCount < 1 ||
    typeof meta.expandedDigest !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(meta.expandedDigest)
  )
    failCrm('mount wire metadata');
  const original = index.contract?.witnesses?.mountEvidence;
  fields(original, ['version', 'analysisIncomplete']);
  if (original.version !== 1 || typeof original.analysisIncomplete !== 'boolean')
    failCrm('mount wire evidence metadata');
  const roots = [],
    operations = [];
  let phase = 0;
  let position = -1;
  return {
    accept(shard, at) {
      const next = shard.kind === 'mount-roots' ? 1 : shard.kind === 'mount-operations' ? 2 : 0;
      if (!next) return false;
      if (!Number.isSafeInteger(at) || at < 0 || (position >= 0 && at !== position + 1))
        failCrm('mount wire contiguity');
      position = at;
      if (next < phase || (next === 2 && roots.length !== meta.rootCount))
        failCrm('mount wire order');
      phase = next;
      fields(shard.value, ['offset', 'items']);
      const { offset, items } = shard.value;
      const target = next === 1 ? roots : operations;
      const limit = next === 1 ? meta.rootCount : meta.operationCount;
      if (
        !Number.isSafeInteger(offset) ||
        Object.is(offset, -0) ||
        offset !== target.length ||
        !Array.isArray(items) ||
        !items.length ||
        items.length > limit - target.length
      )
        failCrm('mount wire span');
      for (const item of items) target.push(item);
      return true;
    },
    finish() {
      if (roots.length !== meta.rootCount || operations.length !== meta.operationCount)
        failCrm('mount wire inventory');
      const value = {
        version: original.version,
        analysisIncomplete: original.analysisIncomplete,
        roots,
        operations,
      };
      if (crmDigest(value) !== meta.expandedDigest) failCrm('mount wire digest');
      return value;
    },
  };
}
