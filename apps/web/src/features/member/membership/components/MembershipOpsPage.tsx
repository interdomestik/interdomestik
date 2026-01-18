'use client';

import {
  OpsActionBar,
  OpsDocumentsPanel,
  OpsDrawer,
  OpsQueryState,
  OpsStatusBadge,
  OpsTable,
  OpsTimeline,
} from '@/components/ops';
import {
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

export function MembershipOpsPage({
  subscriptions,
  documents,
}: {
  subscriptions: any[];
  documents: any[];
}) {
  const t = useTranslations('membership');
  const { selectedId, setSelectedId } = useOpsSelectionParam();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const selectedSubscription = subscriptions.find(s => s.id === selectedId);

  // 10D: Fall back gracefully to first item if selection invalid or missing
  useEffect(() => {
    if (
      subscriptions.length > 0 &&
      (!selectedId || !subscriptions.find(s => s.id === selectedId))
    ) {
      setSelectedId(subscriptions[0].id);
    }
  }, [selectedId, subscriptions, setSelectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id === selectedId ? null : id);
  };

  const closeDetail = () => setSelectedId(null);

  // Map subscriptions to OpsTableRow
  const rows = subscriptions.map(sub => ({
    id: sub.id,
    cells: [
      <span key="plan" className="font-medium">
        {sub.plan?.name || sub.planId}
      </span>,
      <OpsStatusBadge key="status" {...toOpsStatus(sub.status)} />,
      <span key="date">
        {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '-'}
      </span>,
    ],
    onClick: () => handleSelect(sub.id),
    className: selectedId === sub.id ? 'bg-muted/50' : '',
  }));

  const columns = [
    { key: 'plan', header: t('plan.plan_label') },
    { key: 'status', header: t('plan.status_label') },
    { key: 'date', header: t('plan.renews_label') },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* List Panel */}
      <div className={`flex-1 min-w-0 ${selectedId && isDesktop ? 'max-w-md' : ''}`}>
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>{t('page.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <OpsQueryState
              isEmpty={rows.length === 0}
              emptyTitle={t('plan.no_membership')}
              emptySubtitle={t('plan.description')}
              className="h-full"
            >
              <OpsTable
                columns={columns}
                rows={rows}
                loading={false}
                emptyLabel={t('plan.no_membership')}
                emptySubtitle={t('plan.description')}
              />
            </OpsQueryState>
          </CardContent>
        </Card>
      </div>

      {/* Detail Panel (Desktop) */}
      {selectedId && isDesktop && (
        <div className="flex-1 min-w-0 animate-in fade-in slide-in-from-right-4">
          <DetailView subscription={selectedSubscription} documents={documents} t={t} />
        </div>
      )}

      {/* Detail Drawer (Mobile) */}
      {!isDesktop && (
        <OpsDrawer
          open={!!selectedId}
          onOpenChange={open => !open && closeDetail()}
          title={selectedSubscription?.plan?.name || t('plan.title')}
        >
          {selectedSubscription && (
            <DetailView subscription={selectedSubscription} documents={documents} t={t} />
          )}
        </OpsDrawer>
      )}
    </div>
  );
}

// ...

function DetailView({
  subscription,
  documents,
  t,
}: {
  subscription: any;
  documents: any[];
  t: any;
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
