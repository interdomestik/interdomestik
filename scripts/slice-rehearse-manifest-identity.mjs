import { must, positiveInteger } from './slice-rehearse-canonical.mjs';

// prettier-ignore
export function normalizeManifestIdentity(input, id) {
  const t = positiveInteger(input.tier, 'tier');
  must(t <= 4 && /^[0-9a-f]{40}$/u.test(input.baseSha) && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/u.test(input.origin), 'tier/base/origin');
  const m=input.topology?.closeoutMode,p=m==='promotion';
  must(!p || (input.schemaVersion === 2 && Array.isArray(input.writerPaths) && input.writerPaths.filter(v => v?.includes?.(`-${id.toLowerCase()}-`)).length === 2), 'promotion mismatch');
  if (input.schemaVersion === 1) return { tier: t, versionFields: {} };
  const {capacityOwnerId:o,workClass:k}=input,z=o===id.toLowerCase();
  const d=m==='none'&&Array.isArray(input.routineOperations)&&input.routineOperations.some(v => v?.operation === 'compile_same_slice_delivery' && v.target?.taskId === id);
  must(['governance', 'product'].includes(k) && typeof o === 'string' && /^[a-z][a-z0-9-]+$/u.test(o), 'owner');
  must(k === 'product' ? z : o === 'harness-v2-efficiency' || (z && (p || d)), k === 'product' ? 'product owner' : 'explicit governance allocation');
  return { tier: t, versionFields: { capacityOwnerId: o, workClass: k } };
}
