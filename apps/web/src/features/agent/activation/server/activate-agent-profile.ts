import { user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function activateAgentUserProfile(params: {
  currentRole: string;
  referralCode: string;
  authority: TenantAuthority;
  userId: string;
}): Promise<void> {
  const { tenantId } = readTenantAuthority(params.authority);
  const updatedRows = await withTenantAuthority(params.authority, tx =>
    tx
      .update(user)
      .set({
        role: 'agent',
        referralCode: params.referralCode,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(user.id, params.userId),
          eq(user.tenantId, tenantId),
          eq(user.role, params.currentRole)
        )
      )
      .returning({ id: user.id })
  );

  if (updatedRows.length === 0) {
    throw new Error('Agent activation scope no longer matches the authenticated session');
  }
}
