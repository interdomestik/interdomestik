import { engagementEmailSends } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function isDunningSuppressed(
  authority: TenantAuthority,
  dedupeKey: string
): Promise<boolean> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx =>
    Boolean(
      await tx.query.engagementEmailSends.findFirst({
        columns: { id: true },
        where: and(
          eq(engagementEmailSends.tenantId, tenantId),
          eq(engagementEmailSends.dedupeKey, dedupeKey),
          eq(engagementEmailSends.status, 'skipped')
        ),
      })
    )
  );
}

export async function recordDunningSuppression(
  authority: TenantAuthority,
  dedupeKey: string,
  userId: string,
  subscriptionId: string
): Promise<void> {
  const { tenantId } = readTenantAuthority(authority);
  await withTenantAuthority(authority, async tx => {
    await tx
      .insert(engagementEmailSends)
      .values({
        id: nanoid(),
        tenantId,
        userId,
        subscriptionId,
        dedupeKey,
        templateKey: 'dunning_cron',
        status: 'skipped',
        sentAt: null,
        providerMessageId: null,
        error: null,
      })
      .onConflictDoNothing({ target: engagementEmailSends.dedupeKey });
  });
}
