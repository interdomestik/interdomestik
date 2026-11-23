import {
  and,
  asc,
  claimCorrespondence,
  desc,
  inArray,
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
  registerPageInput,
  resolveRegisterRead,
} from './case-register-access';
import type { ClaimsSession } from './types';

export const listClaimCorrespondenceInputSchema = registerPageInput;
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

type RegisterPage = { claimId: string; page: number; perPage: number };

/** One page of the register, newest first; links are read for the page's entries only. */
async function readCorrespondence(tx: TenantTransaction, tenantId: string, input: RegisterPage) {
  const { claimId, page, perPage } = input;
  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(claimCorrespondence)
    .where(
      withTenant(tenantId, claimCorrespondence.tenantId, eq(claimCorrespondence.claimId, claimId))
    );
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
    })
    .from(claimCorrespondence)
    .where(
      withTenant(
        tenantId,
        claimCorrespondence.tenantId,
        and(eq(claimCorrespondence.claimId, claimId))
      )
    )
    .orderBy(desc(claimCorrespondence.occurredAt), desc(claimCorrespondence.id))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const entryIds = rows.map(row => row.id);
  // Replies to this page's entries only (claim_correspondence_reply_idx), so the cost follows
  // the page size, not the size of the tenant's register.
  const replies =
    entryIds.length === 0
      ? []
      : await tx
          .select({ inReplyToId: claimCorrespondence.inReplyToId })
          .from(claimCorrespondence)
          .where(
            withTenant(
              tenantId,
              claimCorrespondence.tenantId,
              and(
                eq(claimCorrespondence.claimId, claimId),
                eq(claimCorrespondence.direction, 'inbound'),
                inArray(claimCorrespondence.inReplyToId, entryIds)
              )
            )
          );
  const answered = new Set(replies.map(reply => reply.inReplyToId));
  const links =
    entryIds.length === 0
      ? []
      : await tx
          .select({
            correspondenceId: claimCorrespondenceDocuments.correspondenceId,
            documentId: claimCorrespondenceDocuments.claimDocumentId,
          })
          .from(claimCorrespondenceDocuments)
          .where(
            withTenant(
              tenantId,
              claimCorrespondenceDocuments.tenantId,
              and(
                eq(claimCorrespondenceDocuments.claimId, claimId),
                inArray(claimCorrespondenceDocuments.correspondenceId, entryIds)
              )
            )
          )
          .orderBy(asc(claimCorrespondenceDocuments.claimDocumentId));
  const byEntry = groupDocumentIds(links);
  const now = Date.now();
  return {
    page,
    perPage,
    total,
    entries: rows.map(row => ({
      ...row,
      answered: answered.has(row.id),
      occurredAt: row.occurredAt.toISOString(),
      followUpAt: row.followUpAt?.toISOString() ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      sharingAttestedAt: row.sharingAttestedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      sharedDocumentIds: byEntry.get(row.id) ?? [],
      overdue:
        row.direction === 'outbound' &&
        !answered.has(row.id) &&
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
  const access = resolveRegisterRead(session, authority, input, 'full', registerPageInput);
  if (!access.ok) return access;
  const { tenantId, actor, data } = access;
  return withTenantAuthority(access.authority, async tx => {
    if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor, 'full'))) {
      return registerForbidden;
    }
    return { ...(await readCorrespondence(tx, tenantId, data)), ok: true as const };
  });
}

/** The branch summary: the total and the latest dates only (bounded read). */
export const SUMMARY_DATE_LIMIT = 50;

async function readSummary(tx: TenantTransaction, tenantId: string, claimId: string) {
  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(claimCorrespondence)
    .where(
      withTenant(tenantId, claimCorrespondence.tenantId, eq(claimCorrespondence.claimId, claimId))
    );
  const rows = await tx
    .select({ occurredAt: claimCorrespondence.occurredAt })
    .from(claimCorrespondence)
    .where(
      withTenant(tenantId, claimCorrespondence.tenantId, eq(claimCorrespondence.claimId, claimId))
    )
    .orderBy(desc(claimCorrespondence.occurredAt))
    .limit(SUMMARY_DATE_LIMIT);
  return { summary: { total, dates: rows.map(row => row.occurredAt.toISOString()) } };
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
