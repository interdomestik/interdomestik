import { withTenantContext } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import type { ClaimsDeps } from '../claims/types';
import type { ClaimStatus } from './types';

export function scheduleStatusChangeNotification(params: {
  claimId: string;
  claimTitle: string;
  deps: ClaimsDeps;
  newStatus: ClaimStatus;
  oldStatus: ClaimStatus | null;
  tenantId: string;
  userId: string;
}) {
  const { claimId, claimTitle, deps, newStatus, oldStatus, tenantId, userId } = params;
  const notifyStatusChanged = deps.notifyStatusChanged;

  if (!notifyStatusChanged || !oldStatus || oldStatus === newStatus) {
    return;
  }

  void (async () => {
    try {
      const member = await withTenantContext({ tenantId }, tx =>
        tx.query.user.findFirst({
          where: (userTable, { eq }) =>
            withTenant(tenantId, userTable.tenantId, eq(userTable.id, userId)),
          columns: {
            email: true,
          },
        })
      );

      if (!member?.email) {
        return;
      }

      await notifyStatusChanged(
        userId,
        member.email,
        { id: claimId, title: claimTitle },
        oldStatus,
        newStatus,
        { tenantId }
      );
    } catch (error) {
      console.error('Failed to send status change notification:', error);
    }
  })();
}
