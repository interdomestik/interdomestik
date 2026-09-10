import { createHash } from 'node:crypto';
import { exactWriterClassification as legacyExactWriterClassification } from './lean-exact-writer-exceptions.mjs';

export { isT117BPortalRuntime } from './lean-exact-writer-exceptions.mjs';

const WRITER_HASH = '1754dbc42a20b563be1181e7cb3a1dbabdfb5913f333d186f9973b60c52751be';

export function isStaffCurrentClaimTenantContext(slice) {
  const writerHash = Array.isArray(slice?.productWriterPaths)
    ? createHash('sha256').update(JSON.stringify(slice.productWriterPaths)).digest('hex')
    : null;
  return (
    slice?.sliceId === 'STAFF-CURRENT-CLAIM-TENANT-CONTEXT' &&
    slice?.tier === 3 &&
    writerHash === WRITER_HASH
  );
}

export function exactWriterClassification(path, slice) {
  if (isStaffCurrentClaimTenantContext(slice) && slice.productWriterPaths.includes(path)) {
    return 'tier3_staff_current_claim_tenant_context';
  }
  return legacyExactWriterClassification(path, slice);
}
