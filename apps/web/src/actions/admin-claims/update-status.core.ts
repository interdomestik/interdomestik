import { updateClaimStatusCore as updateClaimStatusCoreDomain } from '@interdomestik/domain-claims/admin-claims/update-status';
import { requireTenantAdminSession } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';

import { logAuditEvent } from '@/lib/audit';
import { notifyStatusChanged } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

// ClaimStatus type removed in favor of Zod schema validation

// validStatuses removed in favor of Zod schema validation

import { enforceRateLimitForAction } from '@/lib/rate-limit';
import { claimStatusSchema } from '@interdomestik/domain-claims/validators/claims';

// ...

export async function updateClaimStatusCore(params: {
  formData: FormData;
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
}) {
  const { formData, session, requestHeaders } = params;

  await requireTenantAdminSession(session as unknown as UserSession | null);

  // Rate Limiting
  if (session?.user?.id) {
    const limit = await enforceRateLimitForAction({
      name: `action:admin-update-status:${session.user.id}`,
      limit: 20, // Higher limit for admins
      windowSeconds: 60,
      headers: requestHeaders,
    });
    if (limit.limited) {
      throw new Error('Too many requests. Please wait a moment.');
    }
  }

  const claimId = formData.get('claimId') as string;
  const newStatus = formData.get('status') as string;
  const locale = formData.get('locale') as string;

  if (!claimId || !newStatus) {
    throw new Error('Missing required fields');
  }

  // Use Zod schema for validation
  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    throw new Error('Invalid status');
  }
  const status = parsed.data.status;

  await updateClaimStatusCoreDomain(
    {
      claimId,
      newStatus: status,
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
}
