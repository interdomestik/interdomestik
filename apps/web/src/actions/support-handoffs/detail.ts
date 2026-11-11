'use server';

import { getStaffSupportHandoffDetail as getDomainSupportHandoffDetail } from '@interdomestik/domain-claims/support-handoffs/queue';

import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { getHandoffMetadata } from '@/features/claims/support-handoffs/get-handoff-metadata';

import { getActionContext } from './context';

export async function getSupportHandoffDetail(handoffId: string) {
  const { session, authority } = await getActionContext();

  if (
    !authority ||
    !session?.user?.id ||
    !session.user.tenantId ||
    !session.user.branchId ||
    (session.user.role !== 'staff' && session.user.role !== 'branch_manager')
  ) {
    return null;
  }

  if (deniesClaimMessageContent(session.user.role)) {
    return {
      kind: 'metadata' as const,
      result: await getHandoffMetadata({ authority, handoffId }),
    };
  }

  return getDomainSupportHandoffDetail({
    branchId: session.user.branchId,
    authority,
    handoffId,
    staffId: session.user.id,
    viewerRole: session.user.role,
  });
}
