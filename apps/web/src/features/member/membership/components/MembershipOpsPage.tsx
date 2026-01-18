'use client';

import { useOpsSelectionParam } from '@/components/ops/useOpsSelectionParam';
import {
  OpsTable,
  OpsDrawer,
  OpsStatusBadge,
  OpsTimeline,
  OpsDocumentsPanel,
  OPS_TEST_IDS,
} from '@/components/ops';
import {
  toOpsStatus,
  toOpsTimelineEvents,
  toOpsDocuments,
} from '@/components/ops/adapters/membership';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@interdomestik/ui';
import { useMediaQuery } from '@/hooks/use-media-query';

// Mock data for skeleton
const MOCK_EVENTS = [
  {
    id: '1',
    type: 'activated',
    date: new Date().toISOString(),
    description: 'Membership activated',
  },
];
const MOCK_DOCS = [
  { id: '1', name: 'Welcome Packet', url: '#', createdAt: new Date().toISOString() },
];

export function MembershipOpsPage({ subscriptions }: { subscriptions: any[] }) {
  const t = useTranslations('membership');
  const { selectedId, setSelectedId } = useOpsSelectionParam();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const selectedSubscription = subscriptions.find(s => s.id === selectedId);

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
            <OpsTable
              columns={columns}
              rows={rows}
              loading={false}
              emptyLabel={t('plan.no_membership')}
              emptySubtitle={t('plan.description')}
            />
          </CardContent>
        </Card>
      </div>

      {/* Detail Panel (Desktop) */}
      {selectedId && isDesktop && (
        <div className="flex-1 min-w-0 animate-in fade-in slide-in-from-right-4">
          <DetailView subscription={selectedSubscription} t={t} />
        </div>
      )}

      {/* Detail Drawer (Mobile) */}
      {!isDesktop && (
        <OpsDrawer
          open={!!selectedId}
          onOpenChange={open => !open && closeDetail()}
          title={selectedSubscription?.plan?.name || t('plan.title')}
        >
          {selectedSubscription && <DetailView subscription={selectedSubscription} t={t} />}
        </OpsDrawer>
      )}
    </div>
  );
}

function DetailView({ subscription, t }: { subscription: any; t: any }) {
  if (!subscription) return null;

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
          {/* Skeleton Actions */}
          <div className="flex gap-2" data-testid={OPS_TEST_IDS.ACTION_BAR}>
            <Button variant="outline" size="sm">
              Manage Plan
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <OpsTimeline
          title="Timeline"
          events={toOpsTimelineEvents(MOCK_EVENTS)}
          emptyLabel="No events"
        />
        <OpsDocumentsPanel
          title="Documents"
          documents={toOpsDocuments(MOCK_DOCS)}
          emptyLabel="No documents"
          viewLabel="View"
        />
      </div>
    </div>
  );
}
