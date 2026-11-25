'use server';

import { createPublicTrackingLink as createPublicTrackingLinkCore } from '@/features/claims/tracking/server/createPublicTrackingLink';
import { memberGuarded } from '@/lib/privacy/require-member-acceptance';
import { actionFailure, defineAction } from '@/lib/safe-action';
import { assertSessionContext } from '@/lib/safe-action.basis';
import { ensureClaimsAccess } from '@/server/domains/claims/guards';
import type { AuthorizedSession } from '@/lib/tenant-authority.server';
import { z } from 'zod';

function trackingLinkAction(authorized: AuthorizedSession) {
  return defineAction({
    name: 'claims.createPublicTrackingLink',
    basis: { kind: 'self' },
    subject: { type: 'claim', from: 'claimId' },
    input: z.strictObject({ claimId: z.string().min(1).max(128).regex(/^\S+$/u) }),
    async handler({ claimId }) {
      const { authority, session } = authorized;
      assertSessionContext(session);
      const access = ensureClaimsAccess(session);
      const result = await createPublicTrackingLinkCore(claimId, {
        authority,
        actorUserId: access.userId,
        role: access.role,
        branchId: access.branchId,
      });
      return 'code' in result ? actionFailure(result.code) : result;
    },
  });
}

const guardedCreatePublicTrackingLink = memberGuarded(async (authorized, claimId: string) =>
  trackingLinkAction(authorized)({ claimId })
);

export async function createPublicTrackingLink(
  ...args: Parameters<typeof guardedCreatePublicTrackingLink>
) {
  return guardedCreatePublicTrackingLink(...args);
}
