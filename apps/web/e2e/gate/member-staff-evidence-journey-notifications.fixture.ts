import {
  E2E_USERS,
  and,
  eq,
  inArray,
  notifications,
  type TenantTransaction,
  type claims,
} from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { expect } from '../fixtures/auth.fixture';

export async function drainJourneyNotifications(
  tx: TenantTransaction,
  lockedClaims: Pick<
    typeof claims.$inferSelect,
    'id' | 'caseLifecycleState' | 'recoveryLifecycleState'
  >[]
): Promise<void> {
  if (lockedClaims.length === 0) return;

  const expected = lockedClaims.map(claim => ({
    url: `/member/claims/${claim.id}`,
    types:
      claimStatusFromLifecycleFields(claim) === 'submitted'
        ? ['claim_submitted']
        : ['claim_status_changed', 'claim_submitted'],
  }));
  await expect
    .poll(
      async () => {
        const rows = await tx.query.notifications.findMany({
          where: and(
            eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
            inArray(
              notifications.actionUrl,
              expected.map(({ url }) => url)
            ),
            inArray(notifications.type, ['claim_status_changed', 'claim_submitted'])
          ),
          columns: { actionUrl: true, type: true },
          orderBy: notifications.type,
        });
        return expected.map(({ url }) => ({
          url,
          types: rows.filter(row => row.actionUrl === url).map(row => row.type),
        }));
      },
      { message: 'Drain committed journey notifications before deleting residue', timeout: 15_000 }
    )
    .toEqual(expected);
}
