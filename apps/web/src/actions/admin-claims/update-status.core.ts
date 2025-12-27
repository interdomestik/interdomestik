import { updateClaimStatusCore as updateClaimStatusCoreDomain } from '@interdomestik/domain-claims/admin-claims/update-status';

import { logAuditEvent } from '@/lib/audit';
import { notifyStatusChanged } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { Session } from './context';

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

const validStatuses: ClaimStatus[] = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
  'rejected',
];

export async function updateClaimStatusCore(params: {
  formData: FormData;
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
}) {
  const { formData, session, requestHeaders } = params;

  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  const claimId = formData.get('claimId') as string;
  const newStatus = formData.get('status') as ClaimStatus;
  const locale = formData.get('locale') as string;

  if (!claimId || !newStatus) {
    throw new Error('Missing required fields');
  }

  if (!validStatuses.includes(newStatus)) {
    throw new Error('Invalid status');
  }

  await updateClaimStatusCoreDomain(
    {
      claimId,
      newStatus,
      session,
      requestHeaders,
    },
    {
      logAuditEvent,
      notifyStatusChanged,
    }
  );

  revalidatePath(`/${locale}/admin/claims`);
  revalidatePath(`/${locale}/admin/claims/${claimId}`);
  revalidatePath(`/${locale}/member/claims/${claimId}`);

  redirect(`/${locale}/admin/claims/${claimId}`);
}
