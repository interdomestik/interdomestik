import type { ReactNode } from 'react';

import type * as Member from '@interdomestik/domain-member';
import * as PortalUi from '@interdomestik/ui';

import type { CaseSummaryLabels } from '@/components/dashboard/case-summary/accident-case-summary';
import { renderCaseSummary } from '@/components/dashboard/case-summary/case-kind-registry';
import type { AppLocale } from '@/i18n/locales';
import { Link } from '@/i18n/routing';

import { MemberPortalRegionBoundary as Boundary } from './member-portal-region-boundary';
import type { MemberPortalRegionCopy } from './member-portal-region-boundary';

type ActionCopy = Readonly<{ description: string; label: string; warning: string | null }>;
export type MemberPortalCopy = Readonly<{
  actions: Record<Member.MembershipLifecycleBucket, ActionCopy>;
  caseEntryLabel: string;
  caseLabels: (summary: Member.CaseSummary) => CaseSummaryLabels;
  description: string;
  disclaimer: string;
  navigation: Readonly<Record<'cases' | 'documents' | 'helpNow' | 'label' | 'membership', string>>;
  referenceFallback: string;
  regions: Readonly<Record<'actions' | 'case' | 'updates', MemberPortalRegionCopy>>;
  status: (status: Member.CaseLifecycleStatus) => string;
  title: string;
}>;

type CaseProps = Readonly<{
  copy: MemberPortalCopy;
  promise: Promise<Member.CaseSummary[] | null>;
}>;
// prettier-ignore
type ActionProps = Readonly<{ canDraft: boolean; copy: MemberPortalCopy; isAgent: boolean; locale: AppLocale; promise: Promise<Member.MemberPortalMembership | null> }>;
type UpdateProps = CaseProps & { locale: AppLocale };
export async function PortalCasesRegion({ copy, promise }: CaseProps) {
  const summaries = await promise.catch(() => null);
  if (!summaries) return <Boundary copy={copy.regions.case} state="error" />;
  if (summaries.length === 0) return <Boundary copy={copy.regions.case} state="empty" />;
  return (
    <div className="grid min-w-0 gap-4 sm:gap-5">
      <h2 className="text-lg font-semibold tracking-tight">{copy.regions.case.label}</h2>
      {summaries.map((summary, index) => {
        const labels = copy.caseLabels(summary);
        const referenceValue =
          summary.reference?.trim() || `${labels.referenceFallback} ${index + 1}`;
        const entry = (
          <Link
            className="inline-flex min-h-11 w-full max-w-full items-center justify-between gap-4 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] [overflow-wrap:anywhere] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border forced-colors:border-[CanvasText] sm:w-auto"
            href={`/member/claims/${encodeURIComponent(summary.id)}`}
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {copy.caseEntryLabel} {referenceValue}
            </span>
            <span aria-hidden="true" className="shrink-0 text-lg leading-none">
              →
            </span>
          </Link>
        );
        return renderCaseSummary(summary, labels, entry, referenceValue);
      })}
    </div>
  );
}

export async function PortalActionsRegion({
  canDraft,
  copy,
  isAgent,
  locale,
  promise,
}: ActionProps) {
  const membership = await promise.catch(() => null);
  if (!membership) return <Boundary copy={copy.regions.actions} state="error" />;
  const bucket = isAgent && membership.bucket === 'none' ? 'active' : membership.bucket;
  const inactive = ['none', 'canceled', 'grace_expired'].includes(bucket);
  const action = copy.actions[bucket];
  let path = 'claims/new';
  if (inactive) path += '?mode=drafts';
  if (inactive && !canDraft) path = 'membership';
  const href = `/${locale}/member/${path}`;
  return (
    <div className="grid min-w-0 gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{copy.regions.actions.label}</h2>
      <PortalUi.MatteAnchorCard
        className="border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary-soft))] shadow-none hover:border-[hsl(var(--primary)/0.4)]"
        description={action.description}
        href={href}
        label={path === 'membership' ? copy.navigation.membership : action.label}
      />
      {action.warning ? (
        <p className="rounded-xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-4 text-sm text-foreground/75 forced-colors:border-[CanvasText]">
          {action.warning}
        </p>
      ) : null}
    </div>
  );
}

export async function PortalUpdatesRegion({ copy, locale, promise }: UpdateProps) {
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
    <PortalUi.RefractiveGlassPanel className="space-y-5 bg-[hsl(var(--surface))]/80 shadow-none">
      <h2 className="text-lg font-semibold tracking-tight">{copy.regions.updates.label}</h2>
      <PortalUi.Timeline
        ariaLabel={copy.regions.updates.label}
        emptyLabel={copy.regions.updates.empty}
        items={items}
      />
    </PortalUi.RefractiveGlassPanel>
  );
}

type FrameProps = Readonly<{
  actionsRegion: ReactNode;
  caseRegion: ReactNode;
  copy: MemberPortalCopy;
  updatesRegion: ReactNode;
}>;

export function MemberPortalFrame({ actionsRegion, caseRegion, copy, updatesRegion }: FrameProps) {
  return (
    <section
      aria-labelledby="member-portal-title"
      className="min-w-0 space-y-7 p-4 sm:space-y-8 sm:p-6 md:p-0"
    >
      <header className="max-w-3xl space-y-3 py-1 sm:py-2">
        <h1
          id="member-portal-title"
          className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl"
        >
          {copy.title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-foreground/70 sm:text-base">
          {copy.description}
        </p>
      </header>
      <nav
        aria-label={copy.navigation.label}
        className="flex flex-wrap gap-2 text-sm [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded-xl [&_a]:px-4 [&_a]:font-medium [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-ring [&_a]:focus-visible:ring-offset-2"
      >
        <Link
          className="bg-[hsl(var(--primary-soft))] text-[hsl(var(--primary))] dark:text-foreground"
          href="/member/claims"
        >
          {copy.navigation.cases}
        </Link>
        <Link href="/member/documents">{copy.navigation.documents}</Link>
        <Link href="/member/membership">{copy.navigation.membership}</Link>
        <Link
          className="border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]/70 sm:ml-auto"
          href="/help-now"
        >
          <span aria-hidden="true" className="me-2">
            ↗
          </span>
          {copy.navigation.helpNow}
        </Link>
      </nav>
      <aside
        data-testid="member-portal-disclaimer"
        className="flex max-w-3xl items-start gap-2 text-xs leading-5 text-foreground/70"
      >
        {copy.disclaimer}
      </aside>
      <PortalUi.UnifiedPortalShell
        actionsLabel={copy.regions.actions.label}
        actionsRegion={actionsRegion}
        caseLabel={copy.regions.case.label}
        caseRegion={caseRegion}
        className="md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-start"
        timelineLabel={copy.regions.updates.label}
        timelineRegion={updatesRegion}
      />
    </section>
  );
}
