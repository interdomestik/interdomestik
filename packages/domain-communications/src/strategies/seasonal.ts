import { requireEmailDelivery } from '../non-sending-email';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { processBatchedUserCampaign, withRetries } from '../campaign-execution';
import { sendSeasonalEmail } from '../email';
import { sendNotification } from '../notifications/notify';

export async function processSeasonalCampaigns(ingress: IngressCapability<'cron' | 'inngest'>) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  let season: 'winter' | 'summer' | null = null;
  let campaignId = '';

  // Winter: Oct(9) - Dec(11), Summer: May(4) - Jun(5)
  if (month >= 9 && month <= 11) {
    season = 'winter';
    campaignId = `seasonal_winter_${year}`;
  } else if (month >= 4 && month <= 5) {
    season = 'summer';
    campaignId = `seasonal_summer_${year}`;
  }

  if (!season) return { processed: false, message: 'No active seasonal campaign' };

  const result = await processBatchedUserCampaign({
    ingress,
    campaignId,
    sendToUser: async (u, authority) => {
      requireEmailDelivery(
        await withRetries(() => sendSeasonalEmail(u.email!, { season: season, name: u.name ?? '' }))
      );
      // In-app rows are tenant-owned; a user without a tenant only receives the email.
      if (!u.tenantId) return;
      await withRetries(() =>
        sendNotification(
          u.id,
          'sla_warning',
          {},
          {
            title: season === 'winter' ? 'Winter Safety Check ❄️' : 'Summer Readiness ☀️',
            actionUrl: '/dashboard',
            authority,
          }
        )
      );
    },
  });

  return {
    processed: true,
    ...result,
  };
}
