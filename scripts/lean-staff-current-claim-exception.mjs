import { createHash } from 'node:crypto';
import { exactWriterClassification as legacyExactWriterClassification } from './lean-exact-writer-exceptions.mjs';

export { isT117BPortalRuntime } from './lean-exact-writer-exceptions.mjs';

const WRITER_HASHES = new Set([
  '1754dbc42a20b563be1181e7cb3a1dbabdfb5913f333d186f9973b60c52751be',
  '621da1c635c4f90c9388103ab4afdca9acb3e2b691441b30b576232aa24a257d',
  '4f32cf06a1b801bf5b59a1854f97ef516e40ffa5e3acc61a3b300c2b19dc7dec',
]);

export function isStaffCurrentClaimTenantContext(slice) {
  const writerHash = Array.isArray(slice?.productWriterPaths)
    ? createHash('sha256').update(JSON.stringify(slice.productWriterPaths)).digest('hex')
    : null;
  return (
    slice?.sliceId === 'STAFF-CURRENT-CLAIM-TENANT-CONTEXT' &&
    slice?.tier === 3 &&
    WRITER_HASHES.has(writerHash)
  );
}

export function exactWriterClassification(path, slice) {
  if (isStaffCurrentClaimTenantContext(slice) && slice.productWriterPaths.includes(path)) {
    return 'tier3_staff_current_claim_tenant_context';
  }
  return legacyExactWriterClassification(path, slice);
}
