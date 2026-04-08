'use client';

import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { ClaimScopeTree } from '@/components/commercial/claim-scope-tree';
import { buildClaimScopeTreeProps } from '@/components/commercial/claim-scope-tree-content';
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
  getSponsoredMembershipState,
  OpsActionConfig,
  toOpsDocuments,
  toOpsStatus,
  toOpsTimelineEvents,
} from '@/components/ops/adapters/membership';
import { useOpsSelectionParam } from '@/components/ops/useOpsSelectionParam';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Link, useRouter } from '@/i18n/routing';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import {
  activateSponsoredMembership,
  cancelSubscription,
  getPaymentUpdateUrl,
} from '@/actions/subscription.core';
import { buildCancellationFeedbackMessage } from '@/features/member/membership/cancellation-feedback';
import { toast } from 'sonner';

// ... imports
import { SubscriptionRecord } from '@/app/[locale]/(app)/member/membership/_core';
// ...

// Loose type for next-intl translator to avoid complex generic drilling
type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

function normalizePricingPlanId(planId: string | null | undefined) {
  if (!planId) return null;

  const normalized = planId.trim().toLowerCase();
  if (normalized.includes('family')) return 'family';
  if (normalized.includes('business')) return 'business';
  if (normalized.includes('standard')) return 'standard';

  return null;
}

function getMembershipPricingHref(planId?: string | null) {
  const normalizedPlanId = normalizePricingPlanId(planId ?? null);
  return normalizedPlanId ? `/pricing?plan=${normalizedPlanId}` : '/pricing';
}

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
      )}
    </div>
  );
}

function DetailView({
  subscription,
  documents,
  t,
}: {
  subscription: SubscriptionRecord;
  documents: DbDocument[];
  t: TranslationFn;
}) {
  const cancellationKeyRef = useRef<string | null>(null);
  const router = useRouter();
  const { primary, secondary } = getMembershipActions(subscription, t);
  const sponsoredState = getSponsoredMembershipState(subscription);

  const handleAction = async (id: string) => {
    try {
      if (id === 'activate_sponsored') {
        const result = await activateSponsoredMembership(subscription.id);
        if ('error' in result) {
          toast.error(t('errors.action_failed'));
          return;
        }

        toast.success(t('sponsored.activation.success'));
        return;
      }

      if (id === 'renew' || id === 'update_payment') {
        const result = await getPaymentUpdateUrl(subscription.id);
        if (result.error || !result.url) {
          toast.error(t('errors.action_failed'));
          return;
        }

        const { url } = result;
        window.location.href = url;
        return;
      }

      if (id === 'complete_membership') {
        router.push(getMembershipPricingHref(subscription.planId));
        return;
      }

      if (id === 'cancel') {
        // Simple confirm for now
        if (!confirm(t('actions.confirm_cancel'))) return;

        const idempotencyKey = cancellationKeyRef.current ?? crypto.randomUUID();
        cancellationKeyRef.current = idempotencyKey;
        const result = await cancelSubscription(subscription.id, idempotencyKey);
        if (result.error || !result.success) {
          cancellationKeyRef.current = null;
          toast.error(t('errors.action_failed'));
          return;
        }

        cancellationKeyRef.current = null;
        toast.success(buildCancellationFeedbackMessage(t, result.cancellationTerms));
        return;
      }

      console.log('[Membership Action] Unhandled:', id);
    } catch (err) {
      cancellationKeyRef.current = null;
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

          {primary?.id === 'complete_membership' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-900">
                {t('ops.membership_not_active_title')}
              </h4>
              <p className="mt-1 text-sm text-slate-600">{t('ops.membership_not_active_body')}</p>
            </div>
          ) : null}

          {sponsoredState === 'activation_required' ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-900">
                {t('sponsored.activation.title')}
              </h4>
              <p className="mt-1 text-sm text-slate-600">{t('sponsored.activation.body')}</p>
              <button
                type="button"
                onClick={() => handleAction('activate_sponsored')}
                className="mt-3 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('sponsored.activation.cta')}
              </button>
            </div>
          ) : null}

          {sponsoredState === 'eligible_for_family_upgrade' ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-900">
                {t('sponsored.upgrade.title')}
              </h4>
              <p className="mt-1 text-sm text-slate-600">{t('sponsored.upgrade.body')}</p>
              <Link
                href="/pricing?plan=family"
                className="mt-3 inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                {t('sponsored.upgrade.cta')}
              </Link>
            </div>
          ) : null}
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
