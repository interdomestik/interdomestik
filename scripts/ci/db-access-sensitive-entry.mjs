function isClaimsUpdateOutsideTransition(entry) {
  // Claims state transitions must stay centralized; posture directives do not waive this rule.
  if (entry.method !== 'update') return false;
  if (!entry.claimsUpdateTarget) return false;
  if (entry.file === 'packages/domain-claims/src/claims/transition.ts') return false;
  return entry.isDirectDbAlias || isRawPrivilegedClientEntry(entry);
}

function isRawPrivilegedClientEntry(entry) {
  return (
    entry.tenantPostureReason === 'admin-privileged: dbAdmin' ||
    entry.tenantPostureReason === 'admin-privileged: dbRls'
  );
}

function isApprovedRawPrivilegedClientPath(entry) {
  return entry.file.startsWith('apps/web/src/app/api/');
}

export function isSensitiveNewEntry(entry) {
  if (isClaimsUpdateOutsideTransition(entry)) return true;
  if (isRawPrivilegedClientEntry(entry) && !isApprovedRawPrivilegedClientPath(entry)) return true;
  if (entry.tenantPosture === 'unclassified') return true;
  if (entry.tenantPosture !== 'tenant-predicate') return false;
  return entry.method === 'insert' || entry.method === 'update' || entry.method === 'delete';
}
