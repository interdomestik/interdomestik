import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_CONFIRMATION_TTL_SECONDS } from './_backfill-types';

export type AdminCrmForecastBackfillConfirmationError =
  | 'confirmation_expired'
  | 'confirmation_in_flight'
  | 'confirmation_invalid';

export interface AdminCrmForecastBackfillConfirmationTuple {
  actorId: string;
  fromDate: string;
  maxWorkItemsPerDate: number | null;
  tenantId: string;
  toDate: string;
}

interface AdminCrmForecastBackfillConfirmationPayload extends AdminCrmForecastBackfillConfirmationTuple {
  dryRunCompletedAt: string;
  tokenId: string;
}

interface ConfirmationRecord {
  consumed: boolean;
  expiresAtMs: number;
  inFlight: boolean;
  payload: AdminCrmForecastBackfillConfirmationPayload;
}

export interface AdminCrmForecastBackfillConfirmationStore {
  create(tuple: AdminCrmForecastBackfillConfirmationTuple, dryRunCompletedAt: string): string;
  consume(
    token: string,
    tuple: AdminCrmForecastBackfillConfirmationTuple,
    now: Date
  ): { error: AdminCrmForecastBackfillConfirmationError } | { tokenId: string };
  finalize(tokenId: string): void;
  reset(): void;
}

const TOKEN_SEPARATOR = '.';

export function createAdminCrmForecastBackfillConfirmationStore(args?: {
  nowMs?: () => number;
  secret?: string;
}): AdminCrmForecastBackfillConfirmationStore {
  const records = new Map<string, ConfirmationRecord>();
  const nowMs = args?.nowMs ?? Date.now;

  function secret(): string {
    const value = args?.secret ?? process.env.CRM_BACKFILL_CONFIRMATION_SECRET;
    if (!value || value.length < 24) {
      throw new Error('CRM backfill confirmation secret is not configured');
    }
    return value;
  }

  function pruneExpired(now: number): void {
    for (const [tokenId, record] of records.entries()) {
      if (record.expiresAtMs <= now) records.delete(tokenId);
    }
  }

  return {
    create(tuple, dryRunCompletedAt) {
      const tokenId = randomUUID();
      const payload: AdminCrmForecastBackfillConfirmationPayload = {
        ...tuple,
        dryRunCompletedAt,
        tokenId,
      };
      const encodedPayload = encodePayload(payload);
      const signature = signPayload(encodedPayload, secret());
      const completedAtMs = Date.parse(dryRunCompletedAt);
      if (!Number.isFinite(completedAtMs)) {
        throw new Error('CRM backfill confirmation dry-run timestamp is invalid');
      }
      pruneExpired(nowMs());
      records.set(tokenId, {
        consumed: false,
        expiresAtMs:
          completedAtMs + ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_CONFIRMATION_TTL_SECONDS * 1000,
        inFlight: false,
        payload,
      });
      return `${encodedPayload}${TOKEN_SEPARATOR}${signature}`;
    },
    consume(token, tuple, now) {
      const payload = decodeAndVerifyToken(token, secret());
      if (!payload) return { error: 'confirmation_invalid' };
      const record = records.get(payload.tokenId);
      if (!record || record.consumed) return { error: 'confirmation_invalid' };
      if (record.expiresAtMs <= now.getTime()) {
        records.delete(payload.tokenId);
        return { error: 'confirmation_expired' };
      }
      if (record.inFlight) return { error: 'confirmation_in_flight' };
      if (!tuplesMatch(payload, tuple) || !tuplesMatch(record.payload, tuple)) {
        return { error: 'confirmation_invalid' };
      }
      record.inFlight = true;
      return { tokenId: payload.tokenId };
    },
    finalize(tokenId) {
      const record = records.get(tokenId);
      if (!record) return;
      record.inFlight = false;
      record.consumed = true;
    },
    reset() {
      records.clear();
    },
  };
}

export const adminCrmForecastBackfillConfirmationStore =
  createAdminCrmForecastBackfillConfirmationStore();

function encodePayload(payload: AdminCrmForecastBackfillConfirmationPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function decodeAndVerifyToken(
  token: string,
  secret: string
): AdminCrmForecastBackfillConfirmationPayload | null {
  const [encodedPayload, signature, extra] = token.split(TOKEN_SEPARATOR);
  if (!encodedPayload || !signature || extra != null) return null;
  const expected = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expected)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<AdminCrmForecastBackfillConfirmationPayload>;
    if (
      typeof decoded.actorId !== 'string' ||
      typeof decoded.dryRunCompletedAt !== 'string' ||
      typeof decoded.fromDate !== 'string' ||
      typeof decoded.tenantId !== 'string' ||
      typeof decoded.toDate !== 'string' ||
      typeof decoded.tokenId !== 'string' ||
      !(typeof decoded.maxWorkItemsPerDate === 'number' || decoded.maxWorkItemsPerDate === null)
    ) {
      return null;
    }
    return {
      actorId: decoded.actorId,
      dryRunCompletedAt: decoded.dryRunCompletedAt,
      fromDate: decoded.fromDate,
      maxWorkItemsPerDate: decoded.maxWorkItemsPerDate,
      tenantId: decoded.tenantId,
      toDate: decoded.toDate,
      tokenId: decoded.tokenId,
    };
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function tuplesMatch(
  left: AdminCrmForecastBackfillConfirmationTuple,
  right: AdminCrmForecastBackfillConfirmationTuple
): boolean {
  return (
    left.actorId === right.actorId &&
    left.fromDate === right.fromDate &&
    left.maxWorkItemsPerDate === right.maxWorkItemsPerDate &&
    left.tenantId === right.tenantId &&
    left.toDate === right.toDate
  );
}
