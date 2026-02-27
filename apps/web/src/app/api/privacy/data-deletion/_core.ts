import { and, auditLog, db, desc, eq } from '@interdomestik/database';
import { nanoid } from 'nanoid';

export const REQUEST_DATA_DELETION_ACTION = 'privacy.data_deletion_requested';

const REQUEST_DATA_DELETION_COOLDOWN_DAYS = 30;
const REQUEST_DATA_DELETION_REASON_MAX_LENGTH = 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

type LatestDeletionRequest = {
  id: string;
  createdAt: Date | null;
};

type DataDeletionRequestInsert = {
  tenantId: string;
  userId: string;
  actorRole: string | null;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestedAt: Date;
};

type RequestDataDeletionDeps = {
  findLatestRequest: (args: {
    tenantId: string;
    userId: string;
  }) => Promise<LatestDeletionRequest | null>;
  insertRequest: (args: DataDeletionRequestInsert) => Promise<string>;
};

type RequestDataDeletionInput = {
  userId: string;
  tenantId?: string | null;
  actorRole?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
  deps?: RequestDataDeletionDeps;
};

type RequestDataDeletionResult =
  | {
      status: 202;
      body: {
        success: true;
        requestId: string;
        alreadyPending: boolean;
        retryAfterDays?: number;
      };
    }
  | {
      status: 400;
      body: {
        success: false;
        error: string;
      };
    };

function normalizeReason(reason: string | null | undefined): string | null {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, REQUEST_DATA_DELETION_REASON_MAX_LENGTH);
}

function normalizeTenantId(tenantId: string | null | undefined): string | null {
  if (typeof tenantId !== 'string') return null;
  const value = tenantId.trim();
  return value ? value : null;
}

function normalizeUserId(userId: string): string {
  return String(userId || '').trim();
}

function computeRetryAfterDays(now: Date, createdAt: Date): number {
  const cooldownMs = REQUEST_DATA_DELETION_COOLDOWN_DAYS * MILLISECONDS_PER_DAY;
  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const remainingMs = Math.max(0, cooldownMs - elapsedMs);
  return Math.max(1, Math.ceil(remainingMs / MILLISECONDS_PER_DAY));
}

async function findLatestRequestDefault(args: {
  tenantId: string;
  userId: string;
}): Promise<LatestDeletionRequest | null> {
  const latest = await db.query.auditLog.findFirst({
    columns: {
      id: true,
      createdAt: true,
    },
    where: and(
      eq(auditLog.tenantId, args.tenantId),
      eq(auditLog.actorId, args.userId),
      eq(auditLog.action, REQUEST_DATA_DELETION_ACTION),
      eq(auditLog.entityType, 'user')
    ),
    orderBy: [desc(auditLog.createdAt)],
  });

  if (!latest) return null;
  return {
    id: latest.id,
    createdAt: latest.createdAt ?? null,
  };
}

async function insertRequestDefault(args: DataDeletionRequestInsert): Promise<string> {
  const requestId = nanoid();

  await db.insert(auditLog).values({
    id: requestId,
    tenantId: args.tenantId,
    actorId: args.userId,
    actorRole: args.actorRole,
    action: REQUEST_DATA_DELETION_ACTION,
    entityType: 'user',
    entityId: args.userId,
    metadata: {
      reason: args.reason,
      source: 'self-service-api',
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      requestedAt: args.requestedAt.toISOString(),
      status: 'pending',
    },
  });

  return requestId;
}

export async function requestDataDeletionCore(
  input: RequestDataDeletionInput
): Promise<RequestDataDeletionResult> {
  const userId = normalizeUserId(input.userId);
  const tenantId = normalizeTenantId(input.tenantId);

  if (!userId) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Missing userId',
      },
    };
  }

  if (!tenantId) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Missing tenantId',
      },
    };
  }

  const actorRole = input.actorRole?.trim() || null;
  const reason = normalizeReason(input.reason);
  const ipAddress = input.ipAddress?.trim() || null;
  const userAgent = input.userAgent?.trim() || null;
  const now = input.now ?? new Date();

  const deps: RequestDataDeletionDeps = input.deps ?? {
    findLatestRequest: findLatestRequestDefault,
    insertRequest: insertRequestDefault,
  };

  const latestRequest = await deps.findLatestRequest({ tenantId, userId });
  if (latestRequest?.createdAt) {
    const elapsedMs = now.getTime() - latestRequest.createdAt.getTime();
    const cooldownMs = REQUEST_DATA_DELETION_COOLDOWN_DAYS * MILLISECONDS_PER_DAY;
    if (elapsedMs < cooldownMs) {
      return {
        status: 202,
        body: {
          success: true,
          requestId: latestRequest.id,
          alreadyPending: true,
          retryAfterDays: computeRetryAfterDays(now, latestRequest.createdAt),
        },
      };
    }
  }

  const requestId = await deps.insertRequest({
    tenantId,
    userId,
    actorRole,
    reason,
    ipAddress,
    userAgent,
    requestedAt: now,
  });

  return {
    status: 202,
    body: {
      success: true,
      requestId,
      alreadyPending: false,
    },
  };
}
