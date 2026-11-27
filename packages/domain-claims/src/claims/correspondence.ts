import { and, claimCorrespondenceDocuments, eq } from '@interdomestik/database';
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
export {
  hasUniqueReceivedDocumentIds,
  recordInboundCorrespondence,
  recordInboundCorrespondenceInputSchema,
} from './correspondence-inbound';

export const recordOutboundCorrespondenceInputSchema = correspondenceInput.extend(
  outboundAuthorityFields.shape
);
const outboundDecisionSchema =
  recordOutboundCorrespondenceInputSchema.refine(outboundSharingIsAttested);

type Outbound = z.infer<typeof recordOutboundCorrespondenceInputSchema>;

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
  input: Outbound,
  row?: Entry
) {
  const conflict = { ok: false, code: 'conflict' } as const;
  if (!row || !matchesEntry(row, input, actorId)) return conflict;
  const success = { ok: true, correspondenceId: row.id } as const;
  if (!matchesOutbound(row, input)) return conflict;
  if (!input.sharedDocumentIds?.length) return success;
  const links = await tx
    .select({ documentId: claimCorrespondenceDocuments.claimDocumentId })
    .from(claimCorrespondenceDocuments)
    .where(
      withTenant(
        tenantId,
        claimCorrespondenceDocuments.tenantId,
        and(
          eq(claimCorrespondenceDocuments.claimId, input.claimId),
          eq(claimCorrespondenceDocuments.correspondenceId, row.id)
        )
      )
    );
  const requested = new Set(input.sharedDocumentIds);
  return links.length === requested.size && links.every(link => requested.has(link.documentId))
    ? success
    : conflict;
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
  const { tenantId, actor } = access;
  const data = normalizeRegisterInput(access.data);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTenantAuthority(access.authority, async tx => {
        if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor))) {
          return registerForbidden;
        }
        return recordOutbound({ tx, tenantId, actorId: actor.userId }, data);
      });
    } catch (error) {
      if (!retryRegisterDeadlock(error, attempt)) return registerFailure(error);
    }
  }
}
