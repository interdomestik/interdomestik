import { and, claimCorrespondence, eq, sql } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { z } from 'zod';
import {
  lockCaseForRegister,
  registerClaimInput,
  registerFailure,
  registerForbidden,
  registerTimestamp,
  resolveRegisterWrite,
  type LockedRegister,
  registerUuid,
  normalizeRegisterInput,
} from './case-register-access';
import type { ClaimsSession } from './types';

export const setCorrespondenceFollowUpInputSchema = registerClaimInput.extend({
  correspondenceId: registerUuid,
  expectedFollowUpAt: registerTimestamp.nullable(),
  followUpAt: registerTimestamp.nullable(),
});

type FollowUp = z.infer<typeof setCorrespondenceFollowUpInputSchema>;

async function setFollowUp({ tx, tenantId }: LockedRegister, input: FollowUp) {
  const [entry] = await tx
    .select({ id: claimCorrespondence.id })
    .from(claimCorrespondence)
    .where(
      withTenant(
        tenantId,
        claimCorrespondence.tenantId,
        and(
          eq(claimCorrespondence.claimId, input.claimId),
          eq(claimCorrespondence.id, input.correspondenceId),
          eq(claimCorrespondence.direction, 'outbound')
        )
      )
    )
    .for('update');
  if (!entry) return { ok: false, code: 'invalid_state' } as const;
  // The follow-up the editor saw is repeated as the update condition (R-17).
  const [updated] = await tx
    .update(claimCorrespondence)
    .set({ followUpAt: input.followUpAt ? new Date(input.followUpAt) : null })
    .where(
      withTenant(
        tenantId,
        claimCorrespondence.tenantId,
        and(
          eq(claimCorrespondence.claimId, input.claimId),
          eq(claimCorrespondence.id, input.correspondenceId),
          eq(claimCorrespondence.direction, 'outbound'),
          sql`${claimCorrespondence.followUpAt} is not distinct from ${input.expectedFollowUpAt}::timestamptz`
        )
      )
    )
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
  const { tenantId, actor } = access;
  const data = normalizeRegisterInput(access.data);
  try {
    return await withTenantAuthority(access.authority, async tx => {
      if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor))) return registerForbidden;
      return setFollowUp({ tx, tenantId, actorId: actor.userId }, data);
    });
  } catch (error) {
    return registerFailure(error);
  }
}
