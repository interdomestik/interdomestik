import { processBatchedUserCampaign, withRetries } from '../campaign-execution';
import { sendSeasonalEmail } from '../email';
import { sendNotification } from '../notifications/notify';

export async function processSeasonalCampaigns() {
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
    campaignId,
    sendToUser: async u => {
      await withRetries(() => sendSeasonalEmail(u.email!, { season: season, name: u.name ?? '' }));
      await withRetries(() =>
        sendNotification(
          u.id,
          'sla_warning',
          {},
          {
            title: season === 'winter' ? 'Winter Safety Check ❄️' : 'Summer Readiness ☀️',
            actionUrl: '/dashboard',
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
