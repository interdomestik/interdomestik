import { z } from 'zod';

import { requireTenantAdminSession } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimitForAction } from '@/lib/rate-limit';

import type { Session } from './context';

const adminSettingsSchema = z
  .object({
    appName: z.string().trim().min(1).max(100),
    supportEmail: z.string().email(),
    autoAssign: z.boolean(),
    defaultExpiry: z.number().int().min(1).max(365),
  })
  .strict();

type AdminSettingsInput = z.infer<typeof adminSettingsSchema>;

export async function adminUpdateSettingsCore(params: {
  session: Session | null;
  requestHeaders?: Headers;
  data: unknown;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { session, data } = params;

  await requireTenantAdminSession(session as unknown as UserSession | null);

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
  });

  if (limit.limited) {
    return { success: false, error: 'Too many requests. Please wait a moment.' };
  }

  const settings: AdminSettingsInput = parsed.data;

  // NOTE: This is a stub for future global settings table
  console.log('Updating global settings:', { keys: Object.keys(settings) });

  await logAuditEvent({
    actorId: session?.user?.id ?? null,
    actorRole: session?.user?.role ?? null,
    tenantId: session?.user?.tenantId ?? null,
    action: 'settings.updated',
    entityType: 'settings',
    metadata: { keys: Object.keys(settings) },
  });

  return { success: true };
}
