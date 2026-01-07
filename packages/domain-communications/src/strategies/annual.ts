import { processBatchedUserCampaign, withRetries } from '../campaign-execution';
import { sendAnnualReportEmail } from '../email';
import { sendNotification } from '../notifications/notify';

export async function processAnnualReports() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Annual Reports trigger in December (11)
  if (month !== 11) return { processed: false, message: 'Annual reports only process in December' };

  const campaignId = `annual_report_${year}`;

  const result = await processBatchedUserCampaign({
    campaignId,
    sendToUser: async u => {
      await withRetries(() => sendAnnualReportEmail(u.email!, u.name ?? '', year));
      await withRetries(() =>
        sendNotification(
          u.id,
          'sla_warning',
          {},
          {
            title: `Your ${year} Protection Summary is Ready! 🏆`,
            actionUrl: '/dashboard/wrapped',
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
