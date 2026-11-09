import { claimMessages } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { hasPermission, PERMISSIONS } from '@interdomestik/shared-auth';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';

import type { Session } from '../types';
import { isMessageParticipant, readAgentScope } from './access';
import { buildAcknowledgementClaimFilter } from './acknowledgement';

function requireMessageScopeString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Invalid message access context');
  }
  return value;
}

/**
 * Mark messages as read.
 * Scoped by Tenant and User access (via Claim ownership or Staff role).
 */
export async function markMessagesAsReadCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  messageIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { session, authority, messageIds } = params;

    if (!session?.user || !authority) {
      return { success: false, error: 'Unauthorized' };
    }

    if (messageIds.length === 0) {
      return { success: true };
    }

    const actor = session.user;
    const { tenantId } = readTenantAuthority(authority);
    const userRole = requireMessageScopeString(actor.role || 'user');
    if (!isMessageParticipant(userRole)) {
      return { success: false, error: 'Access denied' };
    }
    const isStaff = hasPermission(userRole, PERMISSIONS['claims.update']);

    return await withTenantAuthority(authority, async tx => {
      const agentUserId = userRole === 'agent' ? requireMessageScopeString(actor.id) : null;
      const agentScope =
        agentUserId !== null ? await readAgentScope(tx, { tenantId, userId: agentUserId }) : null;
      if (userRole === 'agent' && !agentScope) {
        return { success: false, error: 'Access denied' };
      }
      // A read receipt must be created by a recipient for a message visible to their role.
      const baseCondition = and(
        eq(claimMessages.tenantId, tenantId),
        inArray(claimMessages.id, messageIds),
        isNull(claimMessages.readAt),
        ne(claimMessages.senderId, agentUserId ?? requireMessageScopeString(actor.id)),
        isStaff ? undefined : eq(claimMessages.isInternal, false)
      );

      const accessCondition = buildAcknowledgementClaimFilter({
        claimIdColumn: claimMessages.claimId,
        branchId: userRole === 'agent' ? (agentScope?.branchId ?? null) : (actor.branchId ?? null),
        role: userRole,
        tenantId,
        tx,
        userId: agentUserId ?? requireMessageScopeString(actor.id),
      });

      // db-access-guard: tenant-scoped -- reason: tenantId resolved into local variable before this DB call
      await tx
        .update(claimMessages)
        .set({ readAt: new Date() })
        .where(and(baseCondition, accessCondition));

      return { success: true };
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return { success: false, error: 'Failed to mark messages as read' };
  }
}
