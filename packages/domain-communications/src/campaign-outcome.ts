import { emailCampaignLogs, engagementEmailSends } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type CampaignOutcome = void | 'skipped';
const templateKey = (campaignId: string) => `campaign:${campaignId}`;

export async function skippedCampaignUsers(
  authority: TenantAuthority,
  campaignId: string,
  userIds: string[]
) {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx =>
    tx.query.engagementEmailSends.findMany({
      columns: { tenantId: true, userId: true },
      where: and(
        eq(engagementEmailSends.tenantId, tenantId),
        eq(engagementEmailSends.templateKey, templateKey(campaignId)),
        eq(engagementEmailSends.status, 'skipped'),
        inArray(engagementEmailSends.userId, userIds)
      ),
    })
  );
}

export async function recordCampaignOutcome(
  authority: TenantAuthority,
  campaignId: string,
  userId: string,
  outcome: CampaignOutcome
): Promise<void> {
  const { tenantId } = readTenantAuthority(authority);
  await withTenantAuthority(authority, async tx => {
    if (outcome === 'skipped') {
      await tx
        .insert(engagementEmailSends)
        .values({
          id: nanoid(),
          tenantId,
          userId,
          templateKey: templateKey(campaignId),
          dedupeKey: JSON.stringify(['campaign', tenantId, campaignId, userId]),
          status: 'skipped',
          sentAt: null,
          providerMessageId: null,
          error: null,
        })
        .onConflictDoNothing({ target: engagementEmailSends.dedupeKey });
      return;
    }
    await tx.insert(emailCampaignLogs).values({
      id: `ecl_${nanoid()}`,
      tenantId,
      userId,
      campaignId,
      sentAt: new Date(),
    });
  });
}
