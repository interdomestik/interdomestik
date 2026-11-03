import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import type { ClaimsDeps } from '../claims/types';
import type { ClaimStatus } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export function scheduleStatusChangeNotification(params: {
  authority: TenantAuthority;
  claimId: string;
  claimTitle: string;
  deps: ClaimsDeps;
  newStatus: ClaimStatus;
  oldStatus: ClaimStatus | null;
  userId: string;
}) {
  const { authority, claimId, claimTitle, deps, newStatus, oldStatus, userId } = params;
  const { tenantId } = readTenantAuthority(authority);
  const notifyStatusChanged = deps.notifyStatusChanged;

  if (!notifyStatusChanged || !oldStatus || oldStatus === newStatus) {
    return;
  }

  void (async () => {
    try {
      const member = await withTenantAuthority(authority, tx =>
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
        { authority }
      );
    } catch (error) {
      console.error('Failed to send status change notification:', error);
    }
  })();
}
