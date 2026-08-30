import { Suspense } from 'react';

import type * as Member from '@interdomestik/domain-member';
import * as PortalUi from '@interdomestik/ui';

import type { CaseSummaryLabels } from '@/components/dashboard/case-summary/accident-case-summary';
import { renderCaseSummary } from '@/components/dashboard/case-summary/case-kind-registry';
import type { AppLocale } from '@/i18n/locales';
import { Link } from '@/i18n/routing';

import { MemberPortalRegionBoundary as Boundary } from './member-portal-region-boundary';
import type { MemberPortalRegionCopy } from './member-portal-region-boundary';

const { UnifiedPortalShell } = PortalUi;
type ActionCopy = Readonly<{ description: string; label: string; warning: string | null }>;
export type MemberPortalCopy = Readonly<{
  actions: Record<Member.MembershipLifecycleBucket, ActionCopy>;
  caseLabels: (summary: Member.CaseSummary) => CaseSummaryLabels;
  description: string;
  disclaimer: string;
  navigation: Readonly<{ documents: string; helpNow: string; label: string; membership: string }>;
  referenceFallback: string;
  regions: Readonly<Record<'actions' | 'case' | 'updates', MemberPortalRegionCopy>>;
  status: (status: Member.CaseLifecycleStatus) => string;
  title: string;
}>;

type CasesBound = Readonly<{ copy: MemberPortalCopy; promise: Promise<Member.CaseSummary[]> }>;
type ActionsBound = Readonly<{
  copy: MemberPortalCopy;
  locale: AppLocale;
  promise: Promise<Member.MemberPortalMembership>;
}>;
type RuntimeBound = Readonly<{
  casesPromise: CasesBound['promise'];
  membershipPromise: ActionsBound['promise'];
}> &
  Pick<ActionsBound, 'copy' | 'locale'>;
type UpdatesBound = CasesBound & { locale: AppLocale };
export async function PortalCasesRegion({ copy, promise }: CasesBound) {
  const summaries = await promise.catch(() => null);
  if (!summaries) return <Boundary copy={copy.regions.case} state="error" />;
  if (summaries.length === 0) return <Boundary copy={copy.regions.case} state="empty" />;
  return (
    <PortalUi.RefractiveGlassPanel className="grid gap-5">
      <h2>{copy.regions.case.label}</h2>
      {summaries.map(summary => (
        <div key={summary.id}>{renderCaseSummary(summary, copy.caseLabels(summary))}</div>
      ))}
    </PortalUi.RefractiveGlassPanel>
  );
}

export async function PortalActionsRegion({ copy, locale, promise }: ActionsBound) {
  const membership = await promise.catch(() => null);
  if (!membership) return <Boundary copy={copy.regions.actions} state="error" />;
  const inactive = ['none', 'canceled', 'grace_expired'].includes(membership.bucket);
  const action = copy.actions[membership.bucket];
  return (
    <div className="grid min-w-0 gap-3">
      <h2>{copy.regions.actions.label}</h2>
      <PortalUi.MatteAnchorCard
        description={action.description}
        eyebrow={copy.regions.actions.label}
        href={`/${locale}/member/claims/new${inactive ? '?mode=drafts' : ''}`}
        label={action.label}
      />
      {action.warning ? <p className="rounded-xl border p-4 text-sm">{action.warning}</p> : null}
    </div>
  );
}

export async function PortalUpdatesRegion({ copy, locale, promise }: UpdatesBound) {
  const summaries = await promise.catch(() => null);
  if (!summaries) return <Boundary copy={copy.regions.updates} state="error" />;
  const items = summaries.flatMap(summary =>
    summary.occurredAt
      ? [
          {
            dateLabel: new Date(summary.occurredAt).toLocaleDateString(locale, { timeZone: 'UTC' }),
            dateTime: summary.occurredAt,
            id: summary.id,
            stateLabel: copy.status(summary.status),
            title: summary.reference ?? copy.referenceFallback,
          },
        ]
      : []
  );
  return (
    <PortalUi.RefractiveGlassPanel>
      <h2>{copy.regions.updates.label}</h2>
      <PortalUi.Timeline
        ariaLabel={copy.regions.updates.label}
        emptyLabel={copy.regions.updates.empty}
        items={items}
      />
    </PortalUi.RefractiveGlassPanel>
  );
}

export async function MemberPortalRuntime({
  casesPromise,
  copy,
  locale,
  membershipPromise,
}: RuntimeBound) {
  const fallback = (region: MemberPortalRegionCopy) => <Boundary copy={region} state="loading" />;
  return (
    <section aria-labelledby="member-portal-title" className="min-w-0 space-y-6 p-4 sm:p-6 md:p-0">
      <header className="space-y-2">
        <h1 id="member-portal-title" className="text-2xl">
          {copy.title}
        </h1>
        <p className="max-w-3xl text-sm text-foreground/70 sm:text-base">{copy.description}</p>
      </header>
      <nav
        aria-label={copy.navigation.label}
        className="flex flex-wrap gap-3 text-sm [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:px-3 [&_a]:focus-visible:ring-2"
      >
        <Link href="/help-now">{copy.navigation.helpNow}</Link>
        <Link href="/member/documents">{copy.navigation.documents}</Link>
        <Link href="/member/membership">{copy.navigation.membership}</Link>
      </nav>
      <aside data-testid="member-portal-disclaimer" className="rounded-xl border p-4">
        {copy.disclaimer}
      </aside>
      <UnifiedPortalShell
        actionsLabel={copy.regions.actions.label}
        actionsRegion={
          <Suspense fallback={fallback(copy.regions.actions)}>
            <PortalActionsRegion copy={copy} locale={locale} promise={membershipPromise} />
          </Suspense>
        }
        caseLabel={copy.regions.case.label}
        caseRegion={
          <Suspense fallback={fallback(copy.regions.case)}>
            <PortalCasesRegion copy={copy} promise={casesPromise} />
          </Suspense>
        }
        timelineLabel={copy.regions.updates.label}
        timelineRegion={
          <Suspense fallback={fallback(copy.regions.updates)}>
            <PortalUpdatesRegion copy={copy} locale={locale} promise={casesPromise} />
          </Suspense>
        }
      />
    </section>
  );
}
