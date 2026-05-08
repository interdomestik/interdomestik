import { claims, db, desc, eq, supportHandoffs } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, count, inArray } from 'drizzle-orm';

import {
  ACTIVE_HANDOFF_STATUSES,
  type ActiveHandoffStatus,
  type MemberActiveHandoffAdvisory,
} from './types';

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function normalizeSourceLabel(value: string | null | undefined) {
  if (value === 'member_claim_detail' || value === 'member_help') return value;
  return 'unknown';
}

function buildActiveMemberHandoffScope(args: { memberId: string; tenantId: string }) {
  return withTenant(
    args.tenantId,
    supportHandoffs.tenantId,
    and(
      eq(supportHandoffs.memberId, args.memberId),
      inArray(supportHandoffs.status, ACTIVE_HANDOFF_STATUSES)
    )
  );
}

function buildActiveClaimHandoffScope(args: {
  claimId: string;
  memberId: string;
  tenantId: string;
}) {
  return withTenant(
    args.tenantId,
    supportHandoffs.tenantId,
    and(
      eq(supportHandoffs.memberId, args.memberId),
      eq(supportHandoffs.claimId, args.claimId),
      inArray(supportHandoffs.status, ACTIVE_HANDOFF_STATUSES)
    )
  );
}

export async function getMemberActiveHandoffAdvisory(args: {
  claimId?: string | null;
  memberId: string;
  tenantId: string;
}): Promise<MemberActiveHandoffAdvisory> {
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const countQuery = db
    .select({ activeCount: count() })
    .from(supportHandoffs)
    .where(buildActiveMemberHandoffScope(args));

  if (!args.claimId) {
    const [countRow] = await countQuery;
    const activeCount = Number(countRow?.activeCount ?? 0);
    return { activeCount, claimMatch: null, linkedClaim: null };
  }

  const claimMatchQuery = db
    .select({
      status: supportHandoffs.status,
      createdAt: supportHandoffs.createdAt,
      updatedAt: supportHandoffs.updatedAt,
      source: supportHandoffs.source,
      claimNumber: claims.claimNumber,
      claimTitle: claims.title,
      claimStatus: claims.status,
    })
    .from(supportHandoffs)
    .leftJoin(
      claims,
      and(eq(supportHandoffs.claimId, claims.id), eq(claims.tenantId, args.tenantId))
    )
    .where(
      buildActiveClaimHandoffScope({
        claimId: args.claimId,
        memberId: args.memberId,
        tenantId: args.tenantId,
      })
    )
    .orderBy(desc(supportHandoffs.createdAt), desc(supportHandoffs.id))
    .limit(1);

  const [[countRow], [claimMatchRow]] = await Promise.all([countQuery, claimMatchQuery]);
  const activeCount = Number(countRow?.activeCount ?? 0);

  if (!claimMatchRow) {
    return { activeCount, claimMatch: null, linkedClaim: null };
  }

  return {
    activeCount,
    claimMatch: {
      status: claimMatchRow.status as ActiveHandoffStatus,
      createdAt: normalizeDate(claimMatchRow.createdAt),
      updatedAt: normalizeDate(claimMatchRow.updatedAt),
      sourceLabel: normalizeSourceLabel(claimMatchRow.source),
    },
    linkedClaim: {
      label: claimMatchRow.claimNumber ?? claimMatchRow.claimTitle ?? args.claimId,
      status: claimMatchRow.claimStatus ?? null,
    },
  };
}
