'use client';

import {
  OpsActionBar,
  OpsDocumentsPanel,
  OpsStatusBadge,
  OpsTable,
  OpsTimeline,
} from '@/components/ops';
import {
  DbDocument,
  getMembershipActions,
  OpsActionConfig,
  toOpsDocuments,
  toOpsStatus,
  toOpsTimelineEvents,
} from '@/components/ops/adapters/membership';
import { useOpsSelectionParam } from '@/components/ops/useOpsSelectionParam';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { getCustomerPortalUrl, requestCancellation } from '@/actions/memberships';
import { toast } from 'sonner';

// ... imports
import { SubscriptionRecord } from '@/app/[locale]/(app)/member/membership/_core';
// ...

// Loose type for next-intl translator to avoid complex generic drilling
// Loose type for next-intl translator to avoid complex generic drilling
type TranslationFn = (key: string, values?: any, formats?: any) => string;

export function MembershipOpsPage({
  subscriptions,
  documents,
}: {
  subscriptions: SubscriptionRecord[];
  documents: DbDocument[];
}) {
  const { selectedId, setSelectedId } = useOpsSelectionParam();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const t = useTranslations('membership');

  // Sync selection if not present and we have data (desktop only or robust default)
  useEffect(() => {
    if (!selectedId && subscriptions.length > 0 && isDesktop) {
      setSelectedId(subscriptions[0].id);
    }
  }, [selectedId, subscriptions, isDesktop, setSelectedId]);

  const selectedSubscription = subscriptions.find(s => s.id === selectedId);

  const tableRows = subscriptions.map(s => ({
    id: s.id,
    cells: [
      <div key="plan" className="flex flex-col">
        <span className="font-medium" data-testid="subscription-plan-name">
          {s.plan?.name || s.planId}
        </span>
        <span className="text-xs text-muted-foreground">
          {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'}
        </span>
      </div>,
      <OpsStatusBadge key="status" {...toOpsStatus(s.status)} />,
    ],
    onClick: () => setSelectedId(s.id),
    className: selectedId === s.id ? 'bg-primary/5' : undefined,
  }));

  const tableColumns = [
    { key: 'plan', header: 'Plan' },
    { key: 'status', header: 'Status' },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Panel: List */}
      <div
        className={`w-full md:w-1/3 border-r bg-muted/10 flex flex-col ${
          selectedId && !isDesktop ? 'hidden' : 'flex'
        }`}
      >
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">{t('ops.title')}</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <OpsTable
            rows={tableRows}
            columns={tableColumns}
            emptyLabel={t('ops.empty_list')}
            rowTestId="subscription-item"
          />
        </div>
      </div>

      {/* Right Panel: Detail */}
      <div
        className={`w-full md:w-2/3 flex flex-col bg-background ${
          !selectedId && !isDesktop ? 'hidden' : 'flex'
        }`}
      >
        {selectedSubscription ? (
          <div className="flex-1 p-6 overflow-hidden">
            {!isDesktop && (
              <button
                onClick={() => setSelectedId(null)}
                className="mb-4 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                ← {t('ops.back_to_list')}
              </button>
            )}
            <DetailView subscription={selectedSubscription} documents={documents} t={t} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {t('ops.select_subscription')}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailView({
  subscription,
  documents,
  t,
}: {
  subscription: SubscriptionRecord | null;
  documents: DbDocument[];
  t: TranslationFn;
}) {
  if (!subscription) return null;

  const { primary, secondary } = getMembershipActions(subscription, t);

  const handleAction = async (id: string) => {
    try {
      if (id === 'renew' || id === 'update_payment') {
        const { url } = await getCustomerPortalUrl(subscription.id);
        window.location.href = url;
        return;
      }

      if (id === 'cancel') {
        // Simple confirm for now
        if (!confirm(t('actions.confirm_cancel'))) return;

        await requestCancellation(subscription.id);
        toast.success(t('actions.cancel_requested'));
        return;
      }

      console.log('[Membership Action] Unhandled:', id);
    } catch (err) {
      console.error(err);
      toast.error(t('errors.action_failed'));
    }
  };

  const mapAction = (config: OpsActionConfig) => ({
    ...config,
    onClick: () => handleAction(config.id),
  });

  return (
    <div className="space-y-4 h-full overflow-y-auto pr-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            {subscription.plan?.name || subscription.planId}
            <OpsStatusBadge {...toOpsStatus(subscription.status)} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">{t('plan.renews_label')}</h4>
            <p>
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : '-'}
            </p>
          </div>

          <OpsActionBar
            primary={primary ? mapAction(primary) : undefined}
            secondary={secondary.map(mapAction)}
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <OpsTimeline
          title="Timeline"
          events={toOpsTimelineEvents(subscription)}
          emptyLabel="No events"
        />
        <OpsDocumentsPanel
          title="Documents"
          documents={toOpsDocuments(documents)}
          emptyLabel="No documents"
          viewLabel="View"
        />
      </div>
    </div>
  );
}
