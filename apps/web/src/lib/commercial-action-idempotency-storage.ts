import {
  and,
  commercialActionIdempotency,
  db,
  eq,
  isNull,
  withTenantContext,
} from '@interdomestik/database';

export type StoredActionResult = Record<string, unknown>;

export type ResolvedCommercialActionIdempotencyScope =
  | {
      kind: 'tenant';
      tenantId: string;
      actorUserId: string | null;
    }
  | {
      kind: 'public';
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
  if (scope.kind === 'tenant') {
    return [
      eq(commercialActionIdempotency.tenantId, scope.tenantId),
      scope.actorUserId
        ? eq(commercialActionIdempotency.actorUserId, scope.actorUserId)
        : isNull(commercialActionIdempotency.actorUserId),
    ];
  }

  return [
    isNull(commercialActionIdempotency.tenantId),
    isNull(commercialActionIdempotency.actorUserId),
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
    tenantId: scope.kind === 'tenant' ? scope.tenantId : null,
    actorUserId: scope.kind === 'tenant' ? scope.actorUserId : null,
    action: params.action,
    idempotencyKey: params.idempotencyKey,
    requestFingerprintHash: params.requestFingerprintHash,
    responsePayload: {},
    status: 'pending',
  };

  if (scope.kind === 'public') {
    // db-access-guard: tenant-scoped -- reason: allowlisted public intake reserves a null-tenant row and must not install tenant RLS context
    const [inserted] = await db
      .insert(commercialActionIdempotency)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: commercialActionIdempotency.id });
    return inserted ?? null;
  }

  const [inserted] = await withTenantContext({ tenantId: scope.tenantId }, async tx =>
    tx
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

  if (scope.kind === 'public') {
    // db-access-guard: tenant-scoped -- reason: allowlisted public intake lookup is pinned to null tenant and null actor before any cached response release
    const [existing] = await db
      .select(columns)
      .from(commercialActionIdempotency)
      .where(where)
      .limit(1);
    return existing ?? null;
  }

  const [existing] = await withTenantContext({ tenantId: scope.tenantId }, async tx =>
    tx.select(columns).from(commercialActionIdempotency).where(where).limit(1)
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

  if (scope.kind === 'public') {
    // db-access-guard: tenant-scoped -- reason: allowlisted public intake completes the null-tenant reservation it created
    await db.update(commercialActionIdempotency).set(values).where(where);
    return;
  }

  await withTenantContext({ tenantId: scope.tenantId }, async tx =>
    tx.update(commercialActionIdempotency).set(values).where(where)
  );
}

export async function releaseCommercialActionReservation(params: {
  reservationId: string;
  scope: ResolvedCommercialActionIdempotencyScope;
}): Promise<void> {
  const { scope } = params;
  const where = eq(commercialActionIdempotency.id, params.reservationId);

  if (scope.kind === 'public') {
    // db-access-guard: tenant-scoped -- reason: allowlisted public intake releases the null-tenant reservation it created
    await db.delete(commercialActionIdempotency).where(where);
    return;
  }

  await withTenantContext({ tenantId: scope.tenantId }, async tx =>
    tx.delete(commercialActionIdempotency).where(where)
  );
}
