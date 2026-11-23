import {
  and,
  asc,
  claimCorrespondence,
  claimCorrespondenceDocuments,
  eq,
  type TenantTransaction,
} from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { sql } from 'drizzle-orm';
import {
  lockCaseForRegister,
  registerClaimInput,
  registerForbidden,
  resolveRegisterRead,
} from './case-register-access';
import type { ClaimsSession } from './types';

export const listClaimCorrespondenceInputSchema = registerClaimInput;
export const getClaimCorrespondenceSummaryInputSchema = registerClaimInput;

function groupDocumentIds(links: { correspondenceId: string; documentId: string }[]) {
  const byEntry = new Map<string, string[]>();
  for (const link of links) {
    const ids = byEntry.get(link.correspondenceId) ?? [];
    ids.push(link.documentId);
    byEntry.set(link.correspondenceId, ids);
  }
  return byEntry;
}

async function readCorrespondence(tx: TenantTransaction, tenantId: string, claimId: string) {
  const rows = await tx
    .select({
      id: claimCorrespondence.id,
      direction: claimCorrespondence.direction,
      partyKind: claimCorrespondence.partyKind,
      partyOrganisation: claimCorrespondence.partyOrganisation,
      partyReference: claimCorrespondence.partyReference,
      partyContactName: claimCorrespondence.partyContactName,
      channel: claimCorrespondence.channel,
      occurredAt: claimCorrespondence.occurredAt,
      body: claimCorrespondence.body,
      inReplyToId: claimCorrespondence.inReplyToId,
      recoveryAuthorityId: claimCorrespondence.recoveryAuthorityId,
      representationAuthorityId: claimCorrespondence.representationAuthorityId,
      sharingAuthorityId: claimCorrespondence.sharingAuthorityId,
      sharingAttestedByUserId: claimCorrespondence.sharingAttestedByUserId,
      sharingAttestedAt: claimCorrespondence.sharingAttestedAt,
      followUpAt: claimCorrespondence.followUpAt,
      decidedAt: claimCorrespondence.decidedAt,
      recordedByStaffId: claimCorrespondence.recordedByStaffId,
      createdAt: claimCorrespondence.createdAt,
      // Outer columns are written qualified: Drizzle renders an interpolated column of a
      // single-table select unqualified, which the subquery would resolve to its own table.
      answered: sql<boolean>`exists (
        select 1 from "claim_correspondence" as correspondence_reply
        where correspondence_reply.tenant_id = "claim_correspondence"."tenant_id"
          and correspondence_reply.claim_id = "claim_correspondence"."claim_id"
          and correspondence_reply.in_reply_to_id = "claim_correspondence"."id"
          and correspondence_reply.direction = 'inbound'
      )`,
    })
    .from(claimCorrespondence)
    .where(
      withTenant(
        tenantId,
        claimCorrespondence.tenantId,
        and(eq(claimCorrespondence.claimId, claimId))
      )
    )
    .orderBy(asc(claimCorrespondence.occurredAt), asc(claimCorrespondence.id));
  const links = await tx
    .select({
      correspondenceId: claimCorrespondenceDocuments.correspondenceId,
      documentId: claimCorrespondenceDocuments.claimDocumentId,
    })
    .from(claimCorrespondenceDocuments)
    .where(
      withTenant(
        tenantId,
        claimCorrespondenceDocuments.tenantId,
        and(eq(claimCorrespondenceDocuments.claimId, claimId))
      )
    )
    .orderBy(asc(claimCorrespondenceDocuments.claimDocumentId));
  const byEntry = groupDocumentIds(links);
  const now = Date.now();
  return {
    entries: rows.map(row => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
      followUpAt: row.followUpAt?.toISOString() ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      sharingAttestedAt: row.sharingAttestedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      sharedDocumentIds: byEntry.get(row.id) ?? [],
      overdue:
        row.direction === 'outbound' &&
        !row.answered &&
        row.followUpAt !== null &&
        row.followUpAt.getTime() < now,
    })),
  };
}

export type ClaimCorrespondenceEntry = Awaited<
  ReturnType<typeof readCorrespondence>
>['entries'][number];

export async function listClaimCorrespondence(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterRead(session, authority, input, 'full');
  if (!access.ok) return access;
  const { tenantId, actor, data } = access;
  return withTenantAuthority(access.authority, async tx => {
    if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor, 'full'))) {
      return registerForbidden;
    }
    return { ...(await readCorrespondence(tx, tenantId, data.claimId)), ok: true as const };
  });
}

async function readSummary(tx: TenantTransaction, tenantId: string, claimId: string) {
  const rows = await tx
    .select({ occurredAt: claimCorrespondence.occurredAt })
    .from(claimCorrespondence)
    .where(
      withTenant(
        tenantId,
        claimCorrespondence.tenantId,
        and(eq(claimCorrespondence.claimId, claimId))
      )
    )
    .orderBy(asc(claimCorrespondence.occurredAt));
  return { summary: { total: rows.length, dates: rows.map(row => row.occurredAt.toISOString()) } };
}

export async function getClaimCorrespondenceSummary(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterRead(session, authority, input, 'summary');
  if (!access.ok) return access;
  const { tenantId, actor, data } = access;
  return withTenantAuthority(access.authority, async tx => {
    if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor, 'summary'))) {
      return registerForbidden;
    }
    return { ...(await readSummary(tx, tenantId, data.claimId)), ok: true as const };
  });
}
