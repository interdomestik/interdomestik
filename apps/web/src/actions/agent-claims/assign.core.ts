import { assignClaimCore as assignClaimCoreDomain } from '@interdomestik/domain-claims/agent-claims/assign';

import { logAuditEvent } from '@/lib/audit';
import { notifyClaimAssigned } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

export async function assignClaimCore(params: {
  claimId: string;
  agentId: string | null;
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
}) {
  await assignClaimCoreDomain(params, {
    logAuditEvent,
    notifyClaimAssigned,
  });

  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${params.claimId}`);
  revalidatePath('/admin/claims');
  revalidatePath(`/admin/claims/${params.claimId}`);
  revalidatePath('/staff/claims');
  revalidatePath(`/staff/claims/${params.claimId}`);
}
