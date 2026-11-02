import { z } from 'zod';

import { requireTenantAdminSession } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimitForAction } from '@/lib/rate-limit';

import type { Session } from './context';

const adminSettingsSchema = z
  .object({
    appName: z.string().trim().min(1).max(100),
    supportEmail: z.string().email(), // NOSONAR
    autoAssign: z.boolean(),
    defaultExpiry: z.number().int().min(1).max(365),
  })
  .strict();

type AdminSettingsInput = z.infer<typeof adminSettingsSchema>;

export async function adminUpdateSettingsCore(params: {
  session: Session | null;
  authority?: TenantAuthority | null;
  requestHeaders?: Headers;
  data: unknown;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { session, authority, data } = params;

  await requireTenantAdminSession(session as unknown as UserSession | null, authority);

  const parsed = adminSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: 'Validation failed' };
  }

  const headers = params.requestHeaders ?? new Headers();
  const limit = await enforceRateLimitForAction({
    name: 'action:admin-settings-update',
    limit: 10,
    windowSeconds: 60,
    headers,
    productionSensitive: true,
  });

  if (limit.limited) {
    return { success: false, error: 'Too many requests. Please wait a moment.' };
  }

  const settings: AdminSettingsInput = parsed.data;

  // NOTE: This is a stub for future global settings table

  // The audit row is written under the caller's authority; without one there is no tenant to
  // record it in, so nothing is written.
  if (authority) {
    await logAuditEvent({
      authority,
      actorId: session?.user?.id ?? null,
      actorRole: session?.user?.role ?? null,
      action: 'settings.updated',
      entityType: 'settings',
      metadata: { keys: Object.keys(settings) },
    });
  }

  return { success: true };
}
