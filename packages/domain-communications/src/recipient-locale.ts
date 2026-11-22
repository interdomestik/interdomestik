import type { TenantTransaction } from '@interdomestik/database';
import { recipientLocales, user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import type { SessionWithTenant } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import { preferredLocaleForTenant } from './tenant-locale';

export { recipientLocales };
type RecipientLocale = (typeof recipientLocales)[number];

export async function resolveRecipientLocale(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
): Promise<RecipientLocale> {
  const [recipient] = await tx
    .select({ locale: user.preferredLocale })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.id, userId)));
  return recipient?.locale ?? preferredLocaleForTenant(tenantId);
}

export async function savePreferredLocale(
  authority: TenantAuthority,
  session: SessionWithTenant,
  locale: RecipientLocale
): Promise<'saved' | 'conflict' | 'profile_scope_unavailable' | 'UNAUTHORIZED'> {
  const { tenantId, accessTenantId, principal, purpose } = readTenantAuthority(authority);
  const userId = principal?.userId;
  const sessionUser = session?.user;
  if (purpose !== 'session' || !userId || userId !== sessionUser?.id) {
    return 'UNAUTHORIZED';
  }

  const profileTenantId = sessionUser.tenantId?.trim();
  if (profileTenantId !== tenantId || profileTenantId !== accessTenantId) {
    return 'profile_scope_unavailable';
  }

  return withTenantAuthority(authority, async tx => {
    const rows = await tx
      .update(user)
      .set({ preferredLocale: locale })
      .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
      .returning({ id: user.id });
    return rows.length === 1 ? 'saved' : 'conflict';
  });
}
