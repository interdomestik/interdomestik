import { createHash } from 'node:crypto';

import {
  completeCommercialActionReservation,
  findExistingReservation,
  releaseCommercialActionReservation,
  reserveCommercialAction,
  type ResolvedCommercialActionIdempotencyScope,
  type StoredActionResult,
} from './commercial-action-idempotency-storage';
import type { ActionError } from './safe-action';

export type PublicCommercialActionIdempotencyReason = 'public-free-start-intake-no-tenant-mutation';

const PUBLIC_IDEMPOTENCY_ALLOWLIST: Record<string, PublicCommercialActionIdempotencyReason> = {
  'free-start.submit': 'public-free-start-intake-no-tenant-mutation',
};

export type CommercialActionIdempotencyScope =
  | {
      kind: 'tenant';
      tenantId?: string | null;
      actorUserId?: string | null;
    }
  | {
      kind: 'public';
      reason: PublicCommercialActionIdempotencyReason;
    };

function isExplicitFailureResult(result: StoredActionResult): result is StoredActionResult & {
  success: false;
} {
  return 'success' in result && result.success === false;
}

function isActionError(
  value: ResolvedCommercialActionIdempotencyScope | ActionError
): value is ActionError {
  return 'success' in value && value.success === false;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  return `{${entries
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
    .join(',')}}`;
}

function hashFingerprint(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function buildReusedKeyError(): ActionError {
  return {
    success: false,
    error: 'Idempotency key was reused for a different request.',
    code: 'IDEMPOTENCY_KEY_REUSED',
  };
}

function buildInProgressError(): ActionError {
  return {
    success: false,
    error: 'This request is already being processed. Please wait a moment.',
    code: 'IDEMPOTENCY_IN_PROGRESS',
  };
}

function buildMissingTenantScopeError(): ActionError {
  return {
    success: false,
    error: 'Commercial action idempotency requires a tenant scope.',
    code: 'IDEMPOTENCY_TENANT_SCOPE_REQUIRED',
  };
}

function buildScopeConflictError(): ActionError {
  return {
    success: false,
    error: 'Idempotency key is already reserved for a different scope.',
    code: 'IDEMPOTENCY_SCOPE_CONFLICT',
  };
}

function buildPublicIdempotencyNotAllowedError(): ActionError {
  return {
    success: false,
    error: 'Public idempotency is not allowed for this commercial action.',
    code: 'PUBLIC_IDEMPOTENCY_NOT_ALLOWED',
  };
}

function resolveIdempotencyScope(
  action: string,
  scope: CommercialActionIdempotencyScope
): ResolvedCommercialActionIdempotencyScope | ActionError {
  if (scope.kind === 'public') {
    if (PUBLIC_IDEMPOTENCY_ALLOWLIST[action] !== scope.reason) {
      return buildPublicIdempotencyNotAllowedError();
    }

    return { kind: 'public' };
  }

  const tenantId = scope.tenantId?.trim();
  if (!tenantId) {
    return buildMissingTenantScopeError();
  }

  return {
    kind: 'tenant',
    tenantId,
    actorUserId: scope.actorUserId ?? null,
  };
}

export async function runCommercialActionWithIdempotency<
  TResult extends StoredActionResult,
>(params: {
  action: string;
  scope: CommercialActionIdempotencyScope;
  idempotencyKey?: string | null;
  requestFingerprint: unknown;
  fingerprintHash?: string;
  execute: () => Promise<TResult>;
}): Promise<TResult | ActionError> {
  if (!params.idempotencyKey) {
    return params.execute();
  }

  const scope = resolveIdempotencyScope(params.action, params.scope);
  if (isActionError(scope)) {
    return scope;
  }

  const requestFingerprintHash =
    params.fingerprintHash ?? hashFingerprint(params.requestFingerprint);
  const inserted = await reserveCommercialAction({
    action: params.action,
    idempotencyKey: params.idempotencyKey,
    requestFingerprintHash,
    scope,
  });

  if (!inserted) {
    const existing = await findExistingReservation(params.action, params.idempotencyKey, scope);

    if (!existing) {
      return buildScopeConflictError();
    }

    if (existing.requestFingerprintHash !== requestFingerprintHash) {
      return buildReusedKeyError();
    }

    if (existing.status !== 'completed') {
      return buildInProgressError();
    }

    return existing.responsePayload as TResult;
  }

  try {
    const result = await params.execute();

    if (isExplicitFailureResult(result)) {
      await releaseCommercialActionReservation({ reservationId: inserted.id, scope });
      return result;
    }

    await completeCommercialActionReservation({
      reservationId: inserted.id,
      responsePayload: result,
      scope,
    });

    return result;
  } catch (error) {
    await releaseCommercialActionReservation({ reservationId: inserted.id, scope });
    throw error;
  }
}
