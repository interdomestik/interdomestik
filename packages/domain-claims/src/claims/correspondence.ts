import { claimCorrespondence, claimCorrespondenceDocuments, eq } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { z } from 'zod';
import {
  lockCaseForRegister,
  lockRegisterDocuments,
  registerChildWhere,
  registerClaimInput,
  registerDecisionTime,
  registerFailure,
  registerForbidden,
  registerText,
  registerTimestamp,
  resolveRegisterWrite,
  type LockedRegister,
} from './case-register-access';
import {
  lockOutboundAuthorities,
  outboundAuthorityFields,
  outboundAuthoritiesAreValid,
  outboundSharingIsAttested,
} from './outward-action-requirements';
import type { ClaimsSession } from './types';

export {
  setCorrespondenceFollowUp,
  setCorrespondenceFollowUpInputSchema,
} from './correspondence-follow-up';

const correspondenceInput = registerClaimInput.extend({
  correlationId: z.uuid(),
  partyKind: z.enum(['insurer', 'bureau', 'other']),
  partyOrganisation: registerText(200),
  partyReference: registerText(200).nullish(),
  partyContactName: registerText(200).nullish(),
  channel: z.enum(['email', 'post', 'phone', 'portal', 'other']),
  occurredAt: registerTimestamp,
  body: registerText(4000),
});

export const recordOutboundCorrespondenceInputSchema = correspondenceInput.extend(
  outboundAuthorityFields.shape
);
const outboundDecisionSchema =
  recordOutboundCorrespondenceInputSchema.refine(outboundSharingIsAttested);

export const recordInboundCorrespondenceInputSchema = correspondenceInput.extend({
  inReplyToId: z.uuid().nullish(),
});

type Inbound = z.infer<typeof recordInboundCorrespondenceInputSchema>;
type Outbound = z.infer<typeof recordOutboundCorrespondenceInputSchema>;
type Entry = typeof claimCorrespondence.$inferSelect;
type EntryInsert = typeof claimCorrespondence.$inferInsert;

function entryFields(input: Inbound | Outbound) {
  return {
    claimId: input.claimId,
    correlationId: input.correlationId,
    partyKind: input.partyKind,
    partyOrganisation: input.partyOrganisation,
    partyReference: input.partyReference ?? null,
    partyContactName: input.partyContactName ?? null,
    channel: input.channel,
    occurredAt: new Date(input.occurredAt),
    body: input.body,
  };
}

function matchesEntry(row: Entry, input: Inbound | Outbound, actorId: string) {
  const fields = entryFields(input);
  return (
    row.recordedByStaffId === actorId &&
    row.partyKind === fields.partyKind &&
    row.partyOrganisation === fields.partyOrganisation &&
    row.partyReference === fields.partyReference &&
    row.partyContactName === fields.partyContactName &&
    row.channel === fields.channel &&
    row.occurredAt.getTime() === fields.occurredAt.getTime() &&
    row.body === fields.body
  );
}

function matchesOutbound(row: Entry, input: Outbound) {
  return (
    row.direction === 'outbound' &&
    row.recoveryAuthorityId === input.recoveryAuthorityId &&
    row.representationAuthorityId === input.representationAuthorityId &&
    row.sharingAuthorityId === (input.sharingAuthorityId ?? null) &&
    row.sharedDocumentCount === (input.sharedDocumentIds?.length ?? 0)
  );
}

async function replayEntry(
  { tx, tenantId, actorId }: LockedRegister,
  input: Inbound | Outbound,
  row?: Entry
) {
  const conflict = { ok: false, code: 'conflict' } as const;
  if (!row || !matchesEntry(row, input, actorId)) return conflict;
  const success = { ok: true, correspondenceId: row.id } as const;
  if (!('recoveryAuthorityId' in input)) {
    return row.direction === 'inbound' && row.inReplyToId === (input.inReplyToId ?? null)
      ? success
      : conflict;
  }
  if (!matchesOutbound(row, input)) return conflict;
  if (!input.sharedDocumentIds?.length) return success;
  const links = await tx
    .select({ documentId: claimCorrespondenceDocuments.claimDocumentId })
    .from(claimCorrespondenceDocuments)
    .where(
      registerChildWhere(
        claimCorrespondenceDocuments,
        tenantId,
        input.claimId,
        eq(claimCorrespondenceDocuments.correspondenceId, row.id)
      )
    );
  const requested = new Set(input.sharedDocumentIds);
  return links.length === requested.size && links.every(link => requested.has(link.documentId))
    ? success
    : conflict;
}

async function findCorrelation({ tx, tenantId }: LockedRegister, input: Inbound | Outbound) {
  const where = registerChildWhere(
    claimCorrespondence,
    tenantId,
    input.claimId,
    eq(claimCorrespondence.correlationId, input.correlationId)
  );
  const [existing] = await tx.select().from(claimCorrespondence).where(where);
  return existing;
}

async function insertEntry({ tx }: LockedRegister, fields: EntryInsert) {
  const [created] = await tx
    .insert(claimCorrespondence)
    .values(fields)
    .onConflictDoNothing({
      target: [claimCorrespondence.tenantId, claimCorrespondence.correlationId],
    })
    .returning({ id: claimCorrespondence.id });
  return created;
}

function occurredTooLate(occurredAt: string, decisionAt: Date) {
  return Date.parse(occurredAt) > decisionAt.getTime() + 5 * 60_000;
}

async function recordOutbound(context: LockedRegister, input: Outbound) {
  const { tx, tenantId, actorId } = context;
  const existing = await findCorrelation(context, input);
  if (existing) return replayEntry(context, input, existing);

  const authorities = await lockOutboundAuthorities(context, input.claimId, input);
  const documents = await lockRegisterDocuments(
    tx,
    tenantId,
    input.claimId,
    input.sharedDocumentIds ?? []
  );
  if (!documents) return { ok: false, code: 'document_invalid' } as const;
  const decisionAt = await registerDecisionTime(tx);
  if (occurredTooLate(input.occurredAt, decisionAt)) return { ok: false, code: 'invalid' } as const;
  if (!(await outboundAuthoritiesAreValid(context, input, authorities, decisionAt))) {
    return { ok: false, code: 'authority_invalid' } as const;
  }
  const sharing = documents.length > 0;
  const created = await insertEntry(context, {
    ...entryFields(input),
    direction: 'outbound',
    recoveryAuthorityId: input.recoveryAuthorityId,
    representationAuthorityId: input.representationAuthorityId,
    sharingAuthorityId: input.sharingAuthorityId ?? null,
    sharedDocumentCount: documents.length,
    sharingAttestedByUserId: sharing ? actorId : null,
    sharingAttestedAt: sharing ? decisionAt : null,
    recordedByStaffId: actorId,
    tenantId,
  });
  if (!created) return replayEntry(context, input, await findCorrelation(context, input));
  if (sharing)
    await tx.insert(claimCorrespondenceDocuments).values(
      documents.map(document => ({
        claimId: input.claimId,
        correspondenceId: created.id,
        claimDocumentId: document.id,
        documentBucket: document.bucket,
        documentFilePath: document.filePath,
        documentCitationRef: document.citationRef,
        tenantId,
      }))
    );
  return { ok: true, correspondenceId: created.id } as const;
}

export async function recordOutboundCorrespondence(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterWrite(session, authority, input, outboundDecisionSchema);
  if (!access.ok) return access;
  const { tenantId, actor, data } = access;
  try {
    return await withTenantAuthority(access.authority, async tx => {
      if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor))) return registerForbidden;
      return recordOutbound({ tx, tenantId, actorId: actor.userId }, data);
    });
  } catch (error) {
    return registerFailure(error);
  }
}

async function canReply({ tx, tenantId }: LockedRegister, input: Inbound) {
  if (!input.inReplyToId) return true;
  const [parent] = await tx
    .select({ id: claimCorrespondence.id })
    .from(claimCorrespondence)
    .where(
      registerChildWhere(
        claimCorrespondence,
        tenantId,
        input.claimId,
        eq(claimCorrespondence.id, input.inReplyToId),
        eq(claimCorrespondence.direction, 'outbound')
      )
    )
    .for('share');
  return Boolean(parent);
}

async function recordInbound(context: LockedRegister, input: Inbound) {
  const existing = await findCorrelation(context, input);
  if (existing) return replayEntry(context, input, existing);
  if (!(await canReply(context, input))) return { ok: false, code: 'invalid' } as const;
  const decisionAt = await registerDecisionTime(context.tx);
  if (occurredTooLate(input.occurredAt, decisionAt)) return { ok: false, code: 'invalid' } as const;
  const created = await insertEntry(context, {
    ...entryFields(input),
    direction: 'inbound',
    inReplyToId: input.inReplyToId ?? null,
    recordedByStaffId: context.actorId,
    tenantId: context.tenantId,
  });
  if (!created) return replayEntry(context, input, await findCorrelation(context, input));
  return { ok: true, correspondenceId: created.id } as const;
}

export async function recordInboundCorrespondence(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterWrite(
    session,
    authority,
    input,
    recordInboundCorrespondenceInputSchema
  );
  if (!access.ok) return access;
  const { tenantId, actor, data } = access;
  try {
    return await withTenantAuthority(access.authority, async tx => {
      if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor))) return registerForbidden;
      return recordInbound({ tx, tenantId, actorId: actor.userId }, data);
    });
  } catch (error) {
    return registerFailure(error);
  }
}
