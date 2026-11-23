import { dbAdmin } from '@interdomestik/database/db';
import { user as userTable } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

import { coerceTenantId, type TenantId } from '@/lib/tenant/tenant-hosts';

export async function lookupNeutralOtpAccountByEmail(email: string): Promise<{
  tenantId: TenantId | null;
  tenantClassificationPending: boolean;
} | null> {
  // db-access-guard: system-exempt -- reason: anonymous login resolves tenant and door eligibility by normalized email before a tenant session exists
  const rows = await dbAdmin
    .select({
      tenantId: userTable.tenantId,
      tenantClassificationPending: userTable.tenantClassificationPending,
    })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  const [account] = rows;
  if (!account) {
    return null;
  }
  return {
    tenantId: coerceTenantId(account.tenantId),
    tenantClassificationPending: account.tenantClassificationPending === true,
  };
}

export async function lookupUserTenantByEmail(email: string): Promise<TenantId | null> {
  const account = await lookupNeutralOtpAccountByEmail(email);
  return account?.tenantId ?? null;
}
