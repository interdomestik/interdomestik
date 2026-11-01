import {
  and,
  commercialActionIdempotency,
  eq,
  isNull,
  withTenantContext,
} from '@interdomestik/database';

export type StoredActionResult = Record<string, unknown>;

/**
 * Reservations are tenant-scoped only. The former null-tenant public variant had no production
 * caller (Free Start reserves in its host-derived technical tenant partition) and cannot run
 * under the restricted runtime role, so it was removed rather than given a privileged path.
 */
export type ResolvedCommercialActionIdempotencyScope = {
  kind: 'tenant';
  tenantId: string;
  actorUserId: string | null;
};

export type ExistingReservation = {
  id: string;
  requestFingerprintHash: string;
  responsePayload: StoredActionResult;
  status: string;
};

/**
 * Every tenant-scoped reservation statement runs inside its own short
 * withTenantContext transaction so the RLS tenant/access-tenant settings exist
 * for the statement. Each transaction closes before the caller runs the
 * commercial action, because the serverless runtime allows one connection.
 */
function buildScopePredicates(scope: ResolvedCommercialActionIdempotencyScope) {
  return [
    eq(commercialActionIdempotency.tenantId, scope.tenantId),
    scope.actorUserId
      ? eq(commercialActionIdempotency.actorUserId, scope.actorUserId)
      : isNull(commercialActionIdempotency.actorUserId),
  ];
}

export async function reserveCommercialAction(params: {
  action: string;
  idempotencyKey: string;
  requestFingerprintHash: string;
  scope: ResolvedCommercialActionIdempotencyScope;
}): Promise<{ id: string } | null> {
  const { scope } = params;
  const values = {
    id: crypto.randomUUID(),
    tenantId: scope.tenantId,
    actorUserId: scope.actorUserId,
    action: params.action,
    idempotencyKey: params.idempotencyKey,
    requestFingerprintHash: params.requestFingerprintHash,
    responsePayload: {},
    status: 'pending',
  };

  const [inserted] = await withTenantContext(
    { tenantId: scope.tenantId },
    async tx =>
      await tx
        .insert(commercialActionIdempotency)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: commercialActionIdempotency.id })
  );
  return inserted ?? null;
}

export async function findExistingReservation(
  action: string,
  idempotencyKey: string,
  scope: ResolvedCommercialActionIdempotencyScope
): Promise<ExistingReservation | null> {
  const columns = {
    id: commercialActionIdempotency.id,
    requestFingerprintHash: commercialActionIdempotency.requestFingerprintHash,
    responsePayload: commercialActionIdempotency.responsePayload,
    status: commercialActionIdempotency.status,
  };
  const where = and(
    eq(commercialActionIdempotency.action, action),
    eq(commercialActionIdempotency.idempotencyKey, idempotencyKey),
    ...buildScopePredicates(scope)
  );

  const [existing] = await withTenantContext(
    { tenantId: scope.tenantId },
    async tx => await tx.select(columns).from(commercialActionIdempotency).where(where).limit(1)
  );
  return existing ?? null;
}

export async function completeCommercialActionReservation(params: {
  reservationId: string;
  responsePayload: StoredActionResult;
  scope: ResolvedCommercialActionIdempotencyScope;
}): Promise<void> {
  const { scope } = params;
  const values = {
    responsePayload: params.responsePayload,
    status: 'completed',
    updatedAt: new Date(),
  };
  const where = eq(commercialActionIdempotency.id, params.reservationId);

  await withTenantContext(
    { tenantId: scope.tenantId },
    async tx => await tx.update(commercialActionIdempotency).set(values).where(where)
  );
}

export async function releaseCommercialActionReservation(params: {
  reservationId: string;
  scope: ResolvedCommercialActionIdempotencyScope;
}): Promise<void> {
  const { scope } = params;
  const where = eq(commercialActionIdempotency.id, params.reservationId);

  await withTenantContext(
    { tenantId: scope.tenantId },
    async tx => await tx.delete(commercialActionIdempotency).where(where)
  );
}
