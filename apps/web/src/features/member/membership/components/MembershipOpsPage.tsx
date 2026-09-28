'use client';

import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { ClaimScopeTree } from '@/components/commercial/claim-scope-tree';
import { buildClaimScopeTreeProps } from '@/components/commercial/claim-scope-tree-content';
import { OpsStatusBadge, OpsTable } from '@/components/ops';
import { DbDocument, toOpsStatus } from '@/components/ops/adapters/membership';
import { useOpsSelectionParam } from '@/components/ops/useOpsSelectionParam';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Link } from '@/i18n/routing';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { SubscriptionRecord } from '@/app/[locale]/(app)/member/membership/_core';
import { DetailView } from './membership-detail-view';

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
    <div className="space-y-6">
      <CommercialDisclaimerNotice
        sectionTestId="membership-commercial-disclaimers"
        eyebrow={t('disclaimers.eyebrow')}
        items={[
          {
            title: t('disclaimers.freeStart.title'),
            body: t('disclaimers.freeStart.body'),
          },
          {
            title: t('disclaimers.hotline.title'),
            body: t('disclaimers.hotline.body'),
          },
        ]}
      />

      <ClaimScopeTree {...buildClaimScopeTreeProps(t, 'membership-scope-tree')} />

      {subscriptions.length === 0 ? (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>{t('ops.no_membership_title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('ops.no_membership_body')}</p>
            <Link
              href="/pricing"
              className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              {t('ops.choose_plan')}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex h-[calc(100vh-4rem)]">
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
                <DetailView
                  key={selectedSubscription.id}
                  subscription={selectedSubscription}
                  documents={documents}
                  t={t}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                {t('ops.select_subscription')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
