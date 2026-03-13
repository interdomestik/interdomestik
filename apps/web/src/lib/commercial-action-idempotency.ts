import { createHash } from 'node:crypto';

import { and, commercialActionIdempotency, db, eq } from '@interdomestik/database';

import type { ActionError } from './safe-action';

type StoredActionResult = Record<string, unknown>;

type ExistingReservation = {
  id: string;
  requestFingerprintHash: string;
  responsePayload: StoredActionResult;
  status: string;
};

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

async function findExistingReservation(
  action: string,
  idempotencyKey: string
): Promise<ExistingReservation | null> {
  const [existing] = await db
    .select({
      id: commercialActionIdempotency.id,
      requestFingerprintHash: commercialActionIdempotency.requestFingerprintHash,
      responsePayload: commercialActionIdempotency.responsePayload,
      status: commercialActionIdempotency.status,
    })
    .from(commercialActionIdempotency)
    .where(
      and(
        eq(commercialActionIdempotency.action, action),
        eq(commercialActionIdempotency.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  return existing ?? null;
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

export async function runCommercialActionWithIdempotency<
  TResult extends StoredActionResult,
>(params: {
  action: string;
  actorUserId?: string | null;
  tenantId?: string | null;
  idempotencyKey?: string | null;
  requestFingerprint: unknown;
  fingerprintHash?: string;
  execute: () => Promise<TResult>;
}): Promise<TResult | ActionError> {
  if (!params.idempotencyKey) {
    return params.execute();
  }

  const requestFingerprintHash =
    params.fingerprintHash ?? hashFingerprint(params.requestFingerprint);
  const [inserted] = await db
    .insert(commercialActionIdempotency)
    .values({
      id: crypto.randomUUID(),
      tenantId: params.tenantId ?? null,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      idempotencyKey: params.idempotencyKey,
      requestFingerprintHash,
      responsePayload: {},
      status: 'pending',
    })
    .onConflictDoNothing()
    .returning({ id: commercialActionIdempotency.id });

  if (!inserted) {
    const existing = await findExistingReservation(params.action, params.idempotencyKey);

    if (!existing) {
      return buildInProgressError();
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

    await db
      .update(commercialActionIdempotency)
      .set({
        responsePayload: result,
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(commercialActionIdempotency.id, inserted.id));

    return result;
  } catch (error) {
    await db
      .delete(commercialActionIdempotency)
      .where(eq(commercialActionIdempotency.id, inserted.id));
    throw error;
  }
}
