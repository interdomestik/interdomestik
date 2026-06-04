import { db, relayClaimStatusAuditProjectionEvents } from '@interdomestik/database';

import type { ClaimsDeps } from './types';

export const CLAIM_STATUS_AUDIT_PROJECTION_LIMIT = 10;

export type ClaimStatusAuditProjectionParams = {
  limit?: number;
  tenantId: string;
};

export async function projectClaimStatusAuditProjection(params: ClaimStatusAuditProjectionParams) {
  const limit = params.limit ?? CLAIM_STATUS_AUDIT_PROJECTION_LIMIT;

  // db-access-guard: tenant-scoped -- reason: tenantId scopes relay selection and delivery recording.
  return db.transaction(tx =>
    relayClaimStatusAuditProjectionEvents(tx as never, {
      limit,
      tenantId: params.tenantId,
    })
  );
}

export async function activateClaimStatusAuditProjection(params: {
  deps: ClaimsDeps;
  tenantId: string;
}): Promise<void> {
  const project =
    params.deps.projectClaimStatusAuditProjection ?? projectClaimStatusAuditProjection;

  try {
    await project({
      limit: CLAIM_STATUS_AUDIT_PROJECTION_LIMIT,
      tenantId: params.tenantId,
    });
  } catch (error) {
    console.error('Failed to project claim status audit event:', error);
  }
}
