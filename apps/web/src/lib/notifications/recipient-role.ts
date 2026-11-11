import 'server-only';

import { user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, eq } from 'drizzle-orm';

/** Re-read the recipient, never infer their role from the sender or the delivery payload. */
export async function getNotificationRecipientRole(
  authority: TenantAuthority,
  recipientId: string
): Promise<string | null> {
  const { tenantId, accessTenantId } = readTenantAuthority(authority);
  if (tenantId !== accessTenantId || !recipientId) return null;
  return await withTenantAuthority(authority, async tx => {
    const [recipient] = await tx
      .select({ role: user.role })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.id, recipientId)))
      .limit(1);
    return recipient?.role ?? null;
  });
}
