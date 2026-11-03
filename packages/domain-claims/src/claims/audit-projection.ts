import { relayClaimStatusAuditProjectionEvents } from '@interdomestik/database';

import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

import type { ClaimsDeps } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export const CLAIM_STATUS_AUDIT_PROJECTION_LIMIT = 10;

export type ClaimStatusAuditProjectionParams = {
  authority: TenantAuthority;
  limit?: number;
};

export async function projectClaimStatusAuditProjection(params: ClaimStatusAuditProjectionParams) {
  const limit = params.limit ?? CLAIM_STATUS_AUDIT_PROJECTION_LIMIT;
  const { tenantId } = readTenantAuthority(params.authority);

  // db-access-guard: tenant-scoped -- reason: tenantId scopes relay selection and delivery recording.
  return withTenantAuthority(params.authority, tx =>
    relayClaimStatusAuditProjectionEvents(tx as never, {
      limit,
      tenantId,
    })
  );
}

export async function activateClaimStatusAuditProjection(params: {
  authority: TenantAuthority;
  deps: ClaimsDeps;
}): Promise<void> {
  const project =
    params.deps.projectClaimStatusAuditProjection ?? projectClaimStatusAuditProjection;

  try {
    await project({
      authority: params.authority,
      limit: CLAIM_STATUS_AUDIT_PROJECTION_LIMIT,
    });
  } catch (error) {
    console.error('Failed to project claim status audit event:', error);
  }
}
