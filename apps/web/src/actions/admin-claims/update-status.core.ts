import { updateClaimStatusCore as updateClaimStatusCoreDomain } from '@interdomestik/domain-claims/admin-claims/update-status';
import { db } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

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

  // Check for authentication and valid session
  if (!session?.user?.id || !session?.user?.tenantId) {
    throw new Error('Unauthorized');
  }

  // Manual RBAC check: Must be Tenant Admin OR Staff with permission
  // We can use shared-auth helpers if available, or manual role check.
  // Ideally: hasPermission(session.user.role, 'claims.update')
  // For now, explicit check for Admin or Staff
  const isAllowed =
    session.user.role === 'tenant_admin' ||
    session.user.role === 'staff' ||
    session.user.role === 'super_admin';

  if (!isAllowed) {
    throw new Error('Forbidden: Insufficient permissions to update status');
  }

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
  const tenantId = session.user.tenantId;

  const claim = await db.query.claims.findFirst({
    where: (claimsTable, { eq }) =>
      withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
    columns: {
      status: true,
    },
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  const currentStatus = claim.status ?? 'draft';
  if (currentStatus === status) {
    return;
  }

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

  const updatedClaim = await db.query.claims.findFirst({
    where: (claimsTable, { eq }) =>
      withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
    columns: {
      status: true,
    },
  });

  const persistedStatus = updatedClaim?.status ?? 'draft';
  if (persistedStatus !== currentStatus) {
    revalidatePath(`/${locale}/admin/claims`);
    revalidatePath(`/${locale}/admin/claims/${claimId}`);
    revalidatePath(`/${locale}/member/claims/${claimId}`);
  }
}
