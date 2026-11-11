import { getActionContext } from '@/actions/commissions/context';
import { CommissionSummaryCard } from '@/components/agent/commission-summary-card';
import { CommissionsList } from '@/components/agent/commissions-list';
import { ReferralLinkCard } from '@/components/agent/referral-link-card';
import { getMyCommissionsCore } from '@interdomestik/domain-membership-billing/commissions/get-my';
import { getMyCommissionSummaryCore } from '@interdomestik/domain-membership-billing/commissions/summary';
import { getAgentReferralLinkCore } from '@/actions/referrals/get-agent-link';
import { getTranslations } from 'next-intl/server';

export default async function AgentCommissionsPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<React.JSX.Element> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'agent.commissions' });
  const { session, authority } = await getActionContext();

  const [commissionsResult, summaryResult, referralLinkResult] = await Promise.all([
    getMyCommissionsCore({ session, authority }),
    getMyCommissionSummaryCore({ session, authority }),
    getAgentReferralLinkCore({ session, authority }),
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
        <p className="text-muted-foreground">
          Track commission earnings from memberships and renewals
        </p>
      </div>

      <ReferralLinkCard referralLinkResult={referralLinkResult} />
      <CommissionSummaryCard summary={summary} />
      <CommissionsList commissions={commissions} />
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
