import type { IngressCapability } from '@interdomestik/database/ingress';
import { processBatchedUserCampaign, withRetries } from '../campaign-execution';
import { sendAnnualReportEmail } from '../email';
import { sendNotification } from '../notifications/notify';

export async function processAnnualReports(ingress: IngressCapability<'cron' | 'inngest'>) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Annual Reports trigger in December (11)
  if (month !== 11) return { processed: false, message: 'Annual reports only process in December' };

  const campaignId = `annual_report_${year}`;

  const result = await processBatchedUserCampaign({
    ingress,
    campaignId,
    sendToUser: async (u, authority) => {
      await withRetries(() => sendAnnualReportEmail(u.email!, u.name ?? '', year));
      // In-app rows are tenant-owned; a user without a tenant only receives the email.
      if (!u.tenantId) return;
      await withRetries(() =>
        sendNotification(
          u.id,
          'sla_warning',
          {},
          {
            title: `Your ${year} Protection Summary is Ready! 🏆`,
            actionUrl: '/dashboard/wrapped',
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
