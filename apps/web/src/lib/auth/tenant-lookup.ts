import { db } from '@interdomestik/database/db';
import { user as userTable } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

import { coerceTenantId, type TenantId } from '@/lib/tenant/tenant-hosts';

export async function lookupUserTenantByEmail(email: string): Promise<TenantId | null> {
  const rows = await db
    .select({ tenantId: userTable.tenantId })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  return coerceTenantId(rows[0]?.tenantId ?? undefined);
}
