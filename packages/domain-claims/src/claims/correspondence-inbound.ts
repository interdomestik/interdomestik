import { randomUUID } from 'node:crypto';
import {
  and,
  claimCorrespondence,
  claimCorrespondenceReceivedSeals,
  claimInboundUploadDecisions,
  eq,
  inArray,
} from '@interdomestik/database';
import { insertClaimReceivedLinks } from '@interdomestik/database/claim-evidence-object-lock';
import { bindTenantTransactionPrincipal } from '@interdomestik/database/free-start-drafts';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { z } from 'zod';
import {
  lockCaseForRegister,
  lockRegisterDocuments,
  normalizeRegisterInput,
  registerDecisionTime,
  registerFailure,
  registerForbidden,
  registerId,
  registerUuid,
  resolveRegisterWrite,
  retryRegisterDeadlock,
  type LockedRegister,
} from './case-register-access';
import {
  correspondenceInput,
  entryFields,
  findCorrelation,
  insertEntry,
  matchesEntry,
  occurredTooLate,
  type Entry,
} from './correspondence-entry';
import { readReceivedDocumentLinks } from './correspondence-links';
import { readInboundPilotCase } from './inbound-upload';
import type { ClaimsSession } from './types';

export const recordInboundCorrespondenceInputSchema = correspondenceInput.extend({
  inReplyToId: registerUuid.nullish(),
  receivedDocumentIds: z.array(registerId.max(128)).max(20).optional(),
});

type Inbound = z.infer<typeof recordInboundCorrespondenceInputSchema>;

export function hasUniqueReceivedDocumentIds({
  receivedDocumentIds = [],
}: Pick<Inbound, 'receivedDocumentIds'>): boolean {
  return new Set(receivedDocumentIds).size === receivedDocumentIds.length;
}

const inboundDecisionSchema = recordInboundCorrespondenceInputSchema.refine(
  hasUniqueReceivedDocumentIds
);

async function replayEntry({ actorId, tx, tenantId }: LockedRegister, input: Inbound, row: Entry) {
  const conflict = { ok: false, code: 'conflict' } as const;
  if (
    row.direction !== 'inbound' ||
    row.inReplyToId !== (input.inReplyToId ?? null) ||
    !matchesEntry(row, input, actorId)
  )
    return conflict;
  const links = await readReceivedDocumentLinks(tx, tenantId, input.claimId, [row.id]);
  const requested = new Set(input.receivedDocumentIds ?? []);
  if (links.length !== requested.size || !links.every(link => requested.has(link.documentId))) {
    return conflict;
  }
  return { ok: true, correspondenceId: row.id } as const;
}

async function canReply({ tx, tenantId }: LockedRegister, input: Inbound) {
  if (!input.inReplyToId) return true;
  const [parent] = await tx
    .select({ id: claimCorrespondence.id })
    .from(claimCorrespondence)
    .where(
      withTenant(
        tenantId,
        claimCorrespondence.tenantId,
        and(
          eq(claimCorrespondence.claimId, input.claimId),
          eq(claimCorrespondence.id, input.inReplyToId),
          eq(claimCorrespondence.direction, 'outbound')
        )
      )
    )
    .for('share');
  return Boolean(parent);
}

class ReceivedCorrelationConflict extends Error {}

async function lockReceivedDocuments(context: LockedRegister, claimId: string, ids: string[]) {
  const { tx, tenantId } = context;
  const documents = await lockRegisterDocuments(tx, tenantId, claimId, ids);
  if (!documents || documents.length === 0) return documents;
  const approvals = await tx
    .select({
      id: claimInboundUploadDecisions.documentId,
      bucket: claimInboundUploadDecisions.bucket,
      filePath: claimInboundUploadDecisions.filePath,
    })
    .from(claimInboundUploadDecisions)
    .where(
      and(
        eq(claimInboundUploadDecisions.tenantId, tenantId),
        eq(claimInboundUploadDecisions.claimId, claimId),
        inArray(claimInboundUploadDecisions.documentId, ids)
      )
    );
  const byId = new Map(approvals.map(row => [row.id, row]));
  return documents.every(document => {
    const approval = byId.get(document.id);
    return approval?.bucket === document.bucket && approval.filePath === document.filePath;
  })
    ? documents
    : null;
}

async function recordInbound(context: LockedRegister, input: Inbound) {
  const existing = await findCorrelation(context, input);
  if (existing) return replayEntry(context, input, existing);
  if (!(await canReply(context, input))) return { ok: false, code: 'invalid' } as const;
  const decisionAt = await registerDecisionTime(context.tx);
  if (occurredTooLate(input.occurredAt, decisionAt)) return { ok: false, code: 'invalid' } as const;
  const { tx, tenantId } = context;
  const pilot = await readInboundPilotCase(tx, tenantId, input.claimId);
  if (input.receivedDocumentIds?.length && (!pilot?.enrolledAt || pilot.paused)) {
    return { ok: false, code: 'document_invalid' } as const;
  }
  const documents = await lockReceivedDocuments(
    context,
    input.claimId,
    input.receivedDocumentIds ?? []
  );
  if (!documents) return { ok: false, code: 'document_invalid' } as const;
  const id = randomUUID();
  if (pilot?.enrolledAt) {
    await tx.insert(claimCorrespondenceReceivedSeals).values({
      tenantId,
      claimId: input.claimId,
      correspondenceId: id,
      documentCount: documents.length,
    });
  }
  const created = await insertEntry(context, {
    ...entryFields(input),
    id,
    direction: 'inbound',
    inReplyToId: input.inReplyToId ?? null,
    recordedByStaffId: context.actorId,
    tenantId: context.tenantId,
  });
  if (!created) throw new ReceivedCorrelationConflict();
  if (documents.length) {
    await insertClaimReceivedLinks(
      tx,
      documents.map(document => ({
        tenantId,
        claimId: input.claimId,
        correspondenceId: id,
        claimDocumentId: document.id,
      }))
    );
  }
  return { ok: true, correspondenceId: created.id } as const;
}

export async function recordInboundCorrespondence(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterWrite(session, authority, input, inboundDecisionSchema);
  if (!access.ok) return access;
  const { tenantId, actor } = access;
  const data = normalizeRegisterInput(access.data);
  if (data.receivedDocumentIds?.length && actor.role !== 'staff') return registerForbidden;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTenantAuthority(access.authority, async tx => {
        if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor)))
          return registerForbidden;
        if (data.receivedDocumentIds?.length) {
          await bindTenantTransactionPrincipal(tx, actor);
        }
        return recordInbound({ tx, tenantId, actorId: actor.userId }, data);
      });
    } catch (error) {
      if (error instanceof ReceivedCorrelationConflict) {
        if (attempt === 1) continue;
        return { ok: false, code: 'conflict' } as const;
      }
      if (!retryRegisterDeadlock(error, attempt)) return registerFailure(error);
    }
  }
}
