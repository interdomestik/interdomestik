'use server';

import { getStaffSupportHandoffDetail as getDomainSupportHandoffDetail } from '@interdomestik/domain-claims/support-handoffs/queue';

import { getActionContext } from './context';

export async function getSupportHandoffDetail(handoffId: string) {
  const { session } = await getActionContext();

  if (
    !session?.user?.id ||
    !session.user.tenantId ||
    !session.user.branchId ||
    (session.user.role !== 'staff' && session.user.role !== 'branch_manager')
  ) {
    return null;
  }

  return getDomainSupportHandoffDetail({
    branchId: session.user.branchId,
    handoffId,
    staffId: session.user.id,
    tenantId: session.user.tenantId,
    viewerRole: session.user.role,
  });
}
