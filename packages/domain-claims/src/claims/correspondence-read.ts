import {
  and,
  claimCorrespondence,
  claimDocuments,
  claims,
  desc,
  inArray,
  eq,
  type TenantTransaction,
} from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  REGISTER_MAX_PAGE_SIZE,
  lockCaseForRegister,
  registerClaimInput,
  registerForbidden,
  registerId,
  registerPageInput,
  resolveRegisterRead,
} from './case-register-access';
import { recordInboundCorrespondenceInputSchema } from './correspondence';
import { readCorrespondenceDocumentLinks } from './correspondence-links';
import { readSummary } from './correspondence-summary';
import { caseAuthorityScopes, MAX_SHARED_DOCUMENTS } from './outward-action-requirements';
import { filterRegisterCitationNames } from './register-citation-access';
import type { ClaimsSession } from './types';

export { SUMMARY_DATE_LIMIT } from './correspondence-summary';

export {
  registerPageInput as listClaimCorrespondenceInputSchema,
  registerClaimInput as getClaimCorrespondenceSummaryInputSchema,
} from './case-register-access';
const correspondenceDirection = z.enum(['outbound', 'inbound']);
const correspondenceContact = recordInboundCorrespondenceInputSchema.shape;
const citationNamesInput = registerClaimInput.extend({
  documentIds: z
    .array(registerId)
    .max(REGISTER_MAX_PAGE_SIZE * MAX_SHARED_DOCUMENTS + Object.keys(caseAuthorityScopes).length),
});

export type CorrespondenceReplyParent = Pick<
  ClaimCorrespondenceEntry,
  'id' | 'partyOrganisation' | 'occurredAt'
>;

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
  // Return one answered flag per page entry, even if it has many inbound replies.
  const replies =
    entryIds.length === 0
      ? []
      : await tx
          .selectDistinct({ inReplyToId: claimCorrespondence.inReplyToId })
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
  const parents = new Set(rows.flatMap(({ inReplyToId }) => (inReplyToId ? [inReplyToId] : [])));
  const replyParents =
    parents.size === 0
      ? []
      : await tx
          .select({
            id: claimCorrespondence.id,
            partyOrganisation: claimCorrespondence.partyOrganisation,
            occurredAt: claimCorrespondence.occurredAt,
          })
          .from(claimCorrespondence)
          .where(
            withTenant(
              tenantId,
              claimCorrespondence.tenantId,
              and(
                eq(claimCorrespondence.claimId, claimId),
                inArray(claimCorrespondence.id, [...parents])
              )
            )
          );
  const { byEntry, receivedByEntry } = await readCorrespondenceDocumentLinks(
    tx,
    tenantId,
    claimId,
    rows
  );
  const now = Date.now();
  return {
    page,
    perPage,
    total,
    replyParents: replyParents.map(row => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
    entries: rows.map(row => ({
      ...row,
      direction: correspondenceDirection.parse(row.direction),
      partyKind: correspondenceContact.partyKind.parse(row.partyKind),
      channel: correspondenceContact.channel.parse(row.channel),
      answered: answered.has(row.id),
      occurredAt: row.occurredAt.toISOString(),
      followUpAt: row.followUpAt?.toISOString() ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      sharingAttestedAt: row.sharingAttestedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      sharedDocumentIds: byEntry.get(row.id) ?? [],
      receivedDocumentIds: receivedByEntry.get(row.id) ?? [],
      overdue:
        row.direction === 'outbound' &&
        !answered.has(row.id) &&
        row.followUpAt !== null &&
        row.followUpAt.getTime() < now,
    })),
  };
}

/** Names only for this page's citations and only with claim-document metadata access. */
export async function listRegisterCitationNames(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterRead(session, authority, input, 'full', citationNamesInput);
  if (!access.ok) return access;
  const {
    tenantId,
    actor,
    data: { claimId, documentIds },
  } = access;
  return withTenantAuthority(access.authority, async tx => {
    if (!(await lockCaseForRegister(tx, tenantId, claimId, actor, 'full')))
      return registerForbidden;
    const candidates =
      documentIds.length === 0
        ? []
        : await tx
            .select({
              id: claimDocuments.id,
              name: claimDocuments.name,
              uploadedBy: claimDocuments.uploadedBy,
              category: claimDocuments.category,
              claim: {
                caseLifecycleState: claims.caseLifecycleState,
                staffId: claims.staffId,
                userId: claims.userId,
              },
            })
            .from(claimDocuments)
            .innerJoin(
              claims,
              and(
                eq(claims.tenantId, claimDocuments.tenantId),
                eq(claims.id, claimDocuments.claimId)
              )
            )
            .where(
              withTenant(
                tenantId,
                claimDocuments.tenantId,
                and(
                  eq(claimDocuments.claimId, claimId),
                  inArray(claimDocuments.id, documentIds),
                  sql`(exists (
          select 1 from public."claim_authorities" a
          where a.tenant_id = "claim_documents"."tenant_id"
            and a.claim_id = "claim_documents"."claim_id"
            and a.evidence_document_id = "claim_documents"."id"
        ) or exists (
          select 1 from public."claim_correspondence_documents" d
          where d.tenant_id = "claim_documents"."tenant_id"
            and d.claim_id = "claim_documents"."claim_id"
            and d.claim_document_id = "claim_documents"."id"
        ) or exists (
          select 1 from public."claim_correspondence_received_documents" r
          where r.tenant_id = "claim_documents"."tenant_id"
            and r.claim_id = "claim_documents"."claim_id"
            and r.claim_document_id = "claim_documents"."id"
        ))`
                )
              )
            );
    const documents = await filterRegisterCitationNames(
      tx,
      candidates,
      actor,
      { accessTenantId: tenantId, caseId: claimId },
      session?.user.caseScopedAccessGrants
    );
    return { ok: true as const, documents };
  });
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
