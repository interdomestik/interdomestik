import { claimCorrespondence, eq, isNull } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { z } from 'zod';
import {
  lockCaseForRegister,
  registerChildWhere,
  registerClaimInput,
  registerFailure,
  registerForbidden,
  registerTimestamp,
  resolveRegisterWrite,
  type LockedRegister,
} from './case-register-access';
import type { ClaimsSession } from './types';

export const setCorrespondenceFollowUpInputSchema = registerClaimInput.extend({
  correspondenceId: z.uuid(),
  expectedFollowUpAt: registerTimestamp.nullable(),
  followUpAt: registerTimestamp.nullable(),
});

type FollowUp = z.infer<typeof setCorrespondenceFollowUpInputSchema>;

async function setFollowUp({ tx, tenantId }: LockedRegister, input: FollowUp) {
  const id = eq(claimCorrespondence.id, input.correspondenceId);
  const outbound = eq(claimCorrespondence.direction, 'outbound');
  const [entry] = await tx
    .select({ id: claimCorrespondence.id })
    .from(claimCorrespondence)
    .where(registerChildWhere(claimCorrespondence, tenantId, input.claimId, id, outbound))
    .for('update');
  if (!entry) return { ok: false, code: 'invalid_state' } as const;
  const expected = input.expectedFollowUpAt
    ? eq(claimCorrespondence.followUpAt, new Date(input.expectedFollowUpAt))
    : isNull(claimCorrespondence.followUpAt);
  const [updated] = await tx
    .update(claimCorrespondence)
    .set({ followUpAt: input.followUpAt ? new Date(input.followUpAt) : null })
    .where(registerChildWhere(claimCorrespondence, tenantId, input.claimId, id, outbound, expected))
    .returning({ id: claimCorrespondence.id });
  return updated
    ? ({ ok: true, correspondenceId: updated.id } as const)
    : ({ ok: false, code: 'conflict' } as const);
}

export async function setCorrespondenceFollowUp(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterWrite(
    session,
    authority,
    input,
    setCorrespondenceFollowUpInputSchema
  );
  if (!access.ok) return access;
  const { tenantId, actor, data } = access;
  try {
    return await withTenantAuthority(access.authority, async tx => {
      if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor))) return registerForbidden;
      return setFollowUp({ tx, tenantId, actorId: actor.userId }, data);
    });
  } catch (error) {
    return registerFailure(error);
  }
}
