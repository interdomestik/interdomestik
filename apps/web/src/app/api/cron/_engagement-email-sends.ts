import { listScheduledTenantWork } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { engagementEmailSends } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/**
 * The scheduled-work authority of every tenant a cron run may visit, keyed by tenant id. The
 * authorities come only from the cron-admitted producer; a member row's tenant id merely selects
 * which of them applies and never creates one, so a tenant the producer did not list has no entry.
 */
export async function loadScheduledAuthorities(
  ingress: IngressCapability<'cron'>
): Promise<ReadonlyMap<string, TenantAuthority>> {
  const work = await listScheduledTenantWork(ingress);
  return new Map(work.map(({ tenantId, authority }) => [tenantId, authority]));
}

/** The authority for a member's tenant, or null when the tenant is absent or was not scheduled. */
export function authorityForTenant(
  authorities: ReadonlyMap<string, TenantAuthority>,
  tenantId: string | null
): TenantAuthority | null {
  return (tenantId ? authorities.get(tenantId) : undefined) ?? null;
}

export async function createPendingEngagementSend(args: {
  authority: TenantAuthority;
  userId: string;
  subscriptionId: string;
  templateKey: string;
  dedupeKey: string;
  metadata: Record<string, unknown>;
}) {
  const { authority, userId, subscriptionId, templateKey, dedupeKey, metadata } = args;
  const { tenantId } = readTenantAuthority(authority);

  return await withTenantAuthority(authority, tx =>
    tx
      .insert(engagementEmailSends)
      .values({
        id: nanoid(),
        tenantId,
        userId,
        subscriptionId,
        templateKey,
        dedupeKey,
        status: 'pending',
        createdAt: new Date(),
        metadata,
      })
      .onConflictDoNothing({ target: engagementEmailSends.dedupeKey })
      .returning({ id: engagementEmailSends.id })
  );
}

export async function updateEngagementSend(
  authority: TenantAuthority,
  dedupeKey: string,
  values: Partial<typeof engagementEmailSends.$inferInsert>
) {
  const { tenantId } = readTenantAuthority(authority);

  await withTenantAuthority(authority, async tx => {
    await tx
      .update(engagementEmailSends)
      .set(values)
      .where(
        and(
          eq(engagementEmailSends.dedupeKey, dedupeKey),
          eq(engagementEmailSends.tenantId, tenantId)
        )
      );
  });
}
