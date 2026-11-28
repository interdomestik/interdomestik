import { and, claimCorrespondence, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { z } from 'zod';
import {
  registerClaimInput,
  registerText,
  registerTimestamp,
  registerUuid,
  type LockedRegister,
} from './case-register-access';

export const correspondenceInput = registerClaimInput.extend({
  correlationId: registerUuid,
  partyKind: z.enum(['insurer', 'bureau', 'other']),
  partyOrganisation: registerText(200),
  partyReference: registerText(200).nullish(),
  partyContactName: registerText(200).nullish(),
  channel: z.enum(['email', 'post', 'phone', 'portal', 'other']),
  occurredAt: registerTimestamp,
  body: registerText(4000),
});

export type Entry = typeof claimCorrespondence.$inferSelect;
type EntryInsert = typeof claimCorrespondence.$inferInsert;

export function entryFields(input: z.infer<typeof correspondenceInput>) {
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

export function matchesEntry(
  row: Entry,
  input: z.infer<typeof correspondenceInput>,
  actorId: string
) {
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

export async function findCorrelation(
  { tx, tenantId }: LockedRegister,
  input: Pick<z.infer<typeof correspondenceInput>, 'claimId' | 'correlationId'>
) {
  const [existing] = await tx
    .select()
    .from(claimCorrespondence)
    .where(
      withTenant(
        tenantId,
        claimCorrespondence.tenantId,
        and(
          eq(claimCorrespondence.claimId, input.claimId),
          eq(claimCorrespondence.correlationId, input.correlationId)
        )
      )
    );
  return existing;
}

export async function insertEntry({ tx }: LockedRegister, fields: EntryInsert) {
  const [created] = await tx
    .insert(claimCorrespondence)
    .values(fields)
    .onConflictDoNothing({
      target: [claimCorrespondence.tenantId, claimCorrespondence.correlationId],
    })
    .returning({ id: claimCorrespondence.id });
  return created;
}

export function occurredTooLate(occurredAt: string, decisionAt: Date) {
  return Date.parse(occurredAt) > decisionAt.getTime() + 5 * 60_000;
}
