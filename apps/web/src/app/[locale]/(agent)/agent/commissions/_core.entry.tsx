import { getMyCommissions, getMyCommissionSummary } from '@/actions/commissions';
import { CommissionSummaryCard } from '@/components/agent/commission-summary-card';
import { CommissionsList } from '@/components/agent/commissions-list';
import { ReferralLinkCard } from '@/components/agent/referral-link-card';
import { getTranslations } from 'next-intl/server';

export default async function AgentCommissionsPage() {
  const t = await getTranslations('agent.commissions');

  const [commissionsResult, summaryResult] = await Promise.all([
    getMyCommissions(),
    getMyCommissionSummary(),
  ]);

  const commissions = commissionsResult.success ? (commissionsResult.data ?? []) : [];
  const summary = summaryResult.success
    ? (summaryResult.data ?? {
        totalPending: 0,
        totalApproved: 0,
        totalPaid: 0,
        pendingCount: 0,
        approvedCount: 0,
        paidCount: 0,
      })
    : {
        totalPending: 0,
        totalApproved: 0,
        totalPaid: 0,
        pendingCount: 0,
        approvedCount: 0,
        paidCount: 0,
      };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">Track your earnings from member referrals</p>
      </div>

      <ReferralLinkCard />
      <CommissionSummaryCard summary={summary} />
      <CommissionsList commissions={commissions} />
    </div>
  );
}
