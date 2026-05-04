import { randomUUID } from 'node:crypto';

import { claims, db, desc, eq, subscriptions, supportHandoffs } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and } from 'drizzle-orm';

import { deriveSupportHandoffSignals } from './derivation';
import {
  SUPPORT_HANDOFF_SOURCES,
  type CreateSupportHandoffInput,
  type SupportHandoffActionResult,
  type SupportHandoffContactPreference,
  type SupportHandoffDeps,
  type SupportHandoffSession,
  type SupportHandoffSource,
} from './types';

const MAX_SUBJECT_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 2_000;
const CONTACT_PREFERENCES = new Set<SupportHandoffContactPreference>([
  'staff_reply',
  'phone',
  'email',
  'whatsapp',
]);
const SUPPORT_HANDOFF_SOURCE_VALUES = new Set<SupportHandoffSource>(SUPPORT_HANDOFF_SOURCES);
const FORBIDDEN_OWNERSHIP_FIELDS = [
  'tenantId',
  'memberId',
  'branchId',
  'staffId',
  'actorId',
  'status',
  'urgency',
  'trustRisk',
] as const;

type ClaimContext = {
  id: string;
  branchId: string | null;
  staffId: string | null;
  status: ClaimStatus | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  statusUpdatedAt: Date | string | null;
};

function normalizeText(value: string | null | undefined, maxLength: number) {
  return value?.trim().replace(/\s+/g, ' ').slice(0, maxLength) ?? '';
}

function normalizeMessage(value: string | null | undefined) {
  return value?.trim().slice(0, MAX_MESSAGE_LENGTH) ?? '';
}

function normalizeContactPreference(value: unknown): SupportHandoffContactPreference {
  return typeof value === 'string' &&
    CONTACT_PREFERENCES.has(value as SupportHandoffContactPreference)
    ? (value as SupportHandoffContactPreference)
    : 'staff_reply';
}

function normalizeSourceHint(value: unknown): SupportHandoffSource | null {
  return typeof value === 'string' &&
    SUPPORT_HANDOFF_SOURCE_VALUES.has(value as SupportHandoffSource)
    ? (value as SupportHandoffSource)
    : null;
}

function deriveSource(args: {
  claimContext: ClaimContext | null;
  sourceClaimId: unknown;
  sourceHint: unknown;
}): SupportHandoffSource {
  const sourceHint = normalizeSourceHint(args.sourceHint);
  const sourceClaimId = normalizeText(
    typeof args.sourceClaimId === 'string' ? args.sourceClaimId : undefined,
    160
  );

  if (sourceHint === 'member_claim_detail' && sourceClaimId === args.claimContext?.id) {
    return 'member_claim_detail';
  }

  return 'member_help';
}

function hasForbiddenOwnershipFields(input: Record<string, unknown>) {
  return FORBIDDEN_OWNERSHIP_FIELDS.some(field =>
    Object.prototype.hasOwnProperty.call(input, field)
  );
}

async function getMemberSubscriptionBranch(args: { memberId: string; tenantId: string }) {
  const [subscription] = await db
    .select({ branchId: subscriptions.branchId })
    .from(subscriptions)
    .where(
      withTenant(args.tenantId, subscriptions.tenantId, eq(subscriptions.userId, args.memberId))
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  return subscription?.branchId ?? null;
}

async function getOwnedClaimContext(args: {
  claimId: string;
  memberId: string;
  tenantId: string;
}): Promise<ClaimContext | null> {
  const [claim] = await db
    .select({
      id: claims.id,
      branchId: claims.branchId,
      staffId: claims.staffId,
      status: claims.status,
      createdAt: claims.createdAt,
      updatedAt: claims.updatedAt,
      statusUpdatedAt: claims.statusUpdatedAt,
    })
    .from(claims)
    .where(
      withTenant(
        args.tenantId,
        claims.tenantId,
        and(eq(claims.id, args.claimId), eq(claims.userId, args.memberId))
      )
    )
    .limit(1);

  return claim ?? null;
}

export async function createMemberSupportHandoffCore(
  params: {
    input: CreateSupportHandoffInput & Record<string, unknown>;
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<{ id: string }>> {
  if (params.session?.user?.role !== 'member' && params.session?.user?.role !== 'user') {
    return { success: false, error: 'Unauthorized' };
  }

  if (hasForbiddenOwnershipFields(params.input)) {
    return { success: false, error: 'Ownership fields are server-derived' };
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(params.session);
  } catch {
    return { success: false, error: 'Unauthorized' };
  }
  const memberId = params.session.user.id;
  const subject = normalizeText(params.input.subject, MAX_SUBJECT_LENGTH);
  const message = normalizeMessage(params.input.message);
  const contactPreference = normalizeContactPreference(params.input.contactPreference);
  const requestedClaimId = normalizeText(params.input.claimId ?? undefined, 160) || null;

  if (!subject) {
    return { success: false, error: 'Subject is required' };
  }

  if (message.length < 10) {
    return { success: false, error: 'Message must include enough detail' };
  }

  const claimContext = requestedClaimId
    ? await getOwnedClaimContext({ claimId: requestedClaimId, memberId, tenantId })
    : null;

  if (requestedClaimId && claimContext == null) {
    return { success: false, error: 'Claim not found or access denied' };
  }

  const branchId =
    claimContext?.branchId ??
    params.session.user.branchId ??
    (await getMemberSubscriptionBranch({ memberId, tenantId }));
  if (!branchId) {
    return { success: false, error: 'Branch is required for support routing' };
  }
  const signals = deriveSupportHandoffSignals({ claim: claimContext });
  const source = deriveSource({
    claimContext,
    sourceClaimId: params.input.sourceClaimId,
    sourceHint: params.input.source,
  });
  const handoffId = `support_handoff_${randomUUID()}`;
  const now = new Date();

  await db.insert(supportHandoffs).values({
    id: handoffId,
    tenantId,
    memberId,
    branchId,
    claimId: claimContext?.id ?? null,
    source,
    subject,
    message,
    contactPreference,
    status: 'open',
    urgency: signals.urgency,
    trustRisk: signals.trustRisk,
    createdAt: now,
    updatedAt: now,
  });

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: memberId,
      actorRole: params.session.user.role,
      tenantId,
      action: 'support_handoff.created',
      entityType: 'support_handoff',
      entityId: handoffId,
      metadata: {
        claimId: claimContext?.id ?? null,
        source,
        urgency: signals.urgency,
        trustRisk: signals.trustRisk,
      },
      headers: params.requestHeaders,
    });
  }

  return { success: true, data: { id: handoffId } };
}
