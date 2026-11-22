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
import { alias } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  lockCaseForRegister,
  registerChildWhere,
  registerClaimInput,
  registerForbidden,
  resolveRegisterRead,
} from './case-register-access';
import type { ClaimsSession } from './types';

export const listClaimCorrespondenceInputSchema = registerClaimInput;
export const getClaimCorrespondenceSummaryInputSchema = registerClaimInput;

const reply = alias(claimCorrespondence, 'correspondence_reply');

export function hasCorrespondenceReply() {
  return sql<boolean>`exists (
    select 1 from ${claimCorrespondence} as ${sql.identifier('correspondence_reply')}
    where ${and(
      eq(reply.tenantId, claimCorrespondence.tenantId),
      eq(reply.claimId, claimCorrespondence.claimId),
      eq(reply.inReplyToId, claimCorrespondence.id),
      eq(reply.direction, 'inbound')
    )}
  )`;
}

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
      answered: hasCorrespondenceReply(),
    })
    .from(claimCorrespondence)
    .where(registerChildWhere(claimCorrespondence, tenantId, claimId))
    .orderBy(asc(claimCorrespondence.occurredAt), asc(claimCorrespondence.id));
  const links = await tx
    .select({
      correspondenceId: claimCorrespondenceDocuments.correspondenceId,
      documentId: claimCorrespondenceDocuments.claimDocumentId,
    })
    .from(claimCorrespondenceDocuments)
    .where(registerChildWhere(claimCorrespondenceDocuments, tenantId, claimId))
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
    .where(registerChildWhere(claimCorrespondence, tenantId, claimId))
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
