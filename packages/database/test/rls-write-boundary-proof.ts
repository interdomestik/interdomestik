import assert from 'node:assert/strict';

import { claims, domainEvents } from '../src/schema';

type WithTenantContext = (typeof import('../src/tenant'))['withTenantContext'];

type WriteBoundaryProofParams = {
  claimId: string;
  ksTenantId: string;
  ksUserId: string;
  mkTenantId: string;
  mkUserId: string;
  rejectedClaimId: string;
  rejectedEventId: string;
  rlsEventId: string;
  uniqueId(prefix: string): string;
  withTenantContext: WithTenantContext;
};

function isRlsRejection(error: unknown): boolean {
  const cause = (error as { cause?: { message?: string } }).cause;
  return /violates row-level security policy/iu.test(cause?.message ?? String(error));
}

export async function assertRlsWriteBoundaries(params: WriteBoundaryProofParams): Promise<void> {
  const {
    claimId,
    ksTenantId,
    ksUserId,
    mkTenantId,
    mkUserId,
    rejectedClaimId,
    rejectedEventId,
    rlsEventId,
    uniqueId,
    withTenantContext,
  } = params;

  await withTenantContext({ tenantId: ksTenantId }, async tx => {
    await tx.insert(domainEvents).values({
      actorId: ksUserId,
      actorRole: 'admin',
      aggregateVersion: 1,
      correlationId: uniqueId('rls_correlation'),
      entityId: claimId,
      entityType: 'claim',
      eventName: 'claim.rls_insert_tested',
      eventVersion: 1,
      id: rlsEventId,
      payload: {},
      tenantId: ksTenantId,
    });
  });

  await assert.rejects(
    () =>
      withTenantContext({ tenantId: mkTenantId, accessTenantId: ksTenantId }, async tx => {
        await tx.insert(claims).values({
          category: 'retail',
          companyName: 'RLS Test Co',
          description: 'home-tenant write must fail under mismatched access tenant',
          id: rejectedClaimId,
          origin: 'portal',
          tenantId: mkTenantId,
          title: 'RLS rejected write proof',
          userId: mkUserId,
        });
      }),
    isRlsRejection
  );

  await assert.rejects(
    () =>
      withTenantContext({ tenantId: mkTenantId, accessTenantId: ksTenantId }, async tx => {
        await tx.insert(domainEvents).values({
          actorId: mkUserId,
          actorRole: 'admin',
          aggregateVersion: 1,
          correlationId: uniqueId('rls_correlation'),
          entityId: rejectedClaimId,
          entityType: 'claim',
          eventName: 'claim.rls_rejected',
          eventVersion: 1,
          id: rejectedEventId,
          payload: {},
          tenantId: mkTenantId,
        });
      }),
    isRlsRejection
  );
}
