import type { ReactNode } from 'react';

import type * as Member from '@interdomestik/domain-member';
import { TriangleAlert } from 'lucide-react';
import { getLocale } from 'next-intl/server';

import {
  caseSummaryStatusPillClass,
  type CaseSummaryLabels,
} from '@/components/dashboard/case-summary/accident-case-summary';
import { renderCaseSummary } from '@/components/dashboard/case-summary/case-kind-registry';
import type { AppLocale } from '@/i18n/locales';
import { Link } from '@/i18n/routing';
import { formatPilotDate } from '@/lib/utils/date';
import { formatNumber } from '@/lib/utils/number';

import { OUTLINED_LINK, PRIMARY_LINK } from './member-portal-link-styles';
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
  membershipStatus: Readonly<{
    accessAllowed: string;
    accessDenied: string;
    accessLabel: string;
    currentPeriodEndLabel: string;
    retry: string;
    statusLabel: string;
    statuses: Record<Member.MembershipLifecycleBucket, string>;
    unavailable: string;
  }>;
  referenceFallback: string;
  regions: Readonly<Record<'actions' | 'case' | 'updates', MemberPortalRegionCopy>>;
  status: (status: Member.CaseLifecycleStatus) => string;
  title: string;
  updates_item: Readonly<{ occurred: string; current_status: string }>;
}>;

type CaseProps = Readonly<{
  copy: MemberPortalCopy;
  promise: Promise<Member.CaseSummary[] | null>;
}>;
// prettier-ignore
type ActionProps = Readonly<{ canDraft: boolean; copy: MemberPortalCopy; locale: AppLocale; promise: Promise<Member.MemberPortalMembership | null> }>;
type UpdateProps = CaseProps & { locale: AppLocale };
export async function PortalCasesRegion({ copy, promise }: CaseProps) {
  const summaries = await promise.catch(() => null);
  if (!summaries)
    return (
      <Boundary
        action={{ href: '/member', label: copy.membershipStatus.retry }}
        copy={copy.regions.case}
        locale={await getLocale()}
        state="error"
      />
    );
  if (summaries.length === 0) return <Boundary copy={copy.regions.case} state="empty" />;
  const locale = await getLocale();
  return (
    <div className="grid min-w-0 gap-4 sm:gap-5">
      <h2 className="text-lg font-semibold tracking-tight">{copy.regions.case.label}</h2>
      {summaries.map((summary, index) => {
        const labels = {
          ...copy.caseLabels(summary),
          documentCountValue: formatNumber(summary.documentCount, locale) ?? undefined,
        };
        const reference = summary.reference?.trim() || summary.title?.trim();
        const referenceValue =
          reference ||
          `${labels.referenceFallback} · ${
            summary.occurredAt
              ? formatPilotDate(summary.occurredAt, locale, copy.membershipStatus.unavailable)
              : formatNumber(index + 1, locale)
          }`;
        const linkStyle = summary.nextStep === 'member_action' ? PRIMARY_LINK : OUTLINED_LINK;
        const entry = (
          <Link
            className={`${linkStyle} w-full sm:w-fit`}
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

export async function PortalActionsRegion({ canDraft, copy, locale, promise }: ActionProps) {
  const membership = await promise.catch(() => null);
  if (!membership)
    return (
      <Boundary
        action={{ href: '/member', label: copy.membershipStatus.retry }}
        copy={copy.regions.actions}
        locale={locale}
        state="error"
      />
    );
  const bucket = membership.bucket;
  const grantsAccess = membership.grantsNewCaseAccess;
  const action = copy.actions[bucket];
  let path = 'claims/new';
  if (!grantsAccess) path += '?mode=drafts';
  if (!grantsAccess && !canDraft) path = 'membership';
  const href = `/${locale}/member/${path}`;
  const showMembership = path === 'membership';
  return (
    <div className="grid min-w-0 gap-5 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-5 [overflow-wrap:anywhere] sm:p-6 forced-colors:border-[CanvasText]">
      <h2 className="text-lg font-semibold tracking-tight">{copy.regions.actions.label}</h2>
      <a className={PRIMARY_LINK} href={href}>
        <span className="min-w-0">
          {showMembership ? copy.navigation.membership : action.label}
        </span>
        <span aria-hidden="true" className="shrink-0 text-lg leading-none">
          →
        </span>
      </a>
      {action.warning && (
        <p className="flex items-start gap-2 rounded-xl border border-foreground/60 p-3 text-sm font-medium leading-6 text-foreground/70 forced-colors:border-[CanvasText]">
          <TriangleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {action.warning}
        </p>
      )}
      <dl
        className="grid gap-3 border-t border-[hsl(var(--border-strong))] pt-5 text-sm forced-colors:border-[CanvasText]"
        data-testid="member-membership-access"
      >
        <div className="min-w-0 space-y-1">
          <dt className="text-foreground/70">{copy.membershipStatus.statusLabel}</dt>
          <dd className="font-semibold" data-lifecycle-status={membership.bucket}>
            {copy.membershipStatus.statuses[membership.bucket]}
          </dd>
        </div>
        <div className="min-w-0 space-y-1">
          <dt className="text-foreground/70">{copy.membershipStatus.accessLabel}</dt>
          <dd className="font-semibold" data-access={grantsAccess ? 'allowed' : 'denied'}>
            {grantsAccess
              ? copy.membershipStatus.accessAllowed
              : copy.membershipStatus.accessDenied}
          </dd>
        </div>
        <div className="min-w-0 space-y-1">
          <dt className="text-foreground/70">{copy.membershipStatus.currentPeriodEndLabel}</dt>
          <dd className="font-semibold">
            {formatPilotDate(
              membership.currentPeriodEnd,
              locale,
              copy.membershipStatus.unavailable
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export async function PortalUpdatesRegion({ copy, locale, promise }: UpdateProps) {
  const summaries = await promise.catch(() => null);
  if (!summaries)
    return (
      <Boundary
        action={{ href: '/member', label: copy.membershipStatus.retry }}
        copy={copy.regions.updates}
        locale={locale}
        state="error"
      />
    );
  const items = summaries.flatMap(summary =>
    summary.occurredAt
      ? [
          {
            dateLabel: formatPilotDate(
              summary.occurredAt,
              locale,
              copy.membershipStatus.unavailable
            ),
            dateTime: summary.occurredAt,
            id: summary.id,
            status: summary.status,
            title: summary.reference?.trim() || summary.title?.trim() || copy.referenceFallback,
          },
        ]
      : []
  );
  if (items.length === 0) return <Boundary copy={copy.regions.updates} state="empty" />;
  const { occurred, current_status: currentStatus } = copy.updates_item;

  return (
    <div className="min-w-0 space-y-5 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-5 [overflow-wrap:anywhere] sm:p-6 forced-colors:border-[CanvasText]">
      <h2 className="text-lg font-semibold tracking-tight">{copy.regions.updates.label}</h2>
      <ol
        aria-label={copy.regions.updates.label}
        className="list-disc space-y-4 marker:text-transparent"
      >
        {items.map(item => (
          <li key={item.id} className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-2 size-2 shrink-0 rounded-full border border-current bg-current"
            />
            <div className="min-w-0 space-y-2">
              <p className="font-semibold">{item.title}</p>
              <dl className="space-y-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <dt className="text-foreground/70">{occurred}</dt>
                  <dd>
                    <time dateTime={item.dateTime}>{item.dateLabel}</time>
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <dt className="text-foreground/70">{currentStatus}</dt>
                  <dd className={caseSummaryStatusPillClass(item.status)}>
                    {copy.status(item.status)}
                  </dd>
                </div>
              </dl>
            </div>
          </li>
        ))}
      </ol>
    </div>
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
      className="min-w-0 space-y-6 p-4 [overflow-wrap:anywhere] sm:space-y-8 sm:p-6 md:p-0"
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
        className="grid grid-cols-2 gap-2 text-sm sm:flex sm:flex-wrap [&_a]:inline-flex [&_a]:min-h-11 [&_a]:min-w-11 [&_a]:max-w-full [&_a]:items-center [&_a]:rounded-full [&_a]:border [&_a]:border-foreground/60 [&_a]:px-3 [&_a]:py-2 [&_a]:font-medium [&_a:hover]:underline [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-ring [&_a]:focus-visible:ring-offset-2 forced-colors:[&_a]:border-[CanvasText] forced-colors:[&_a]:focus-visible:outline"
      >
        <Link className="bg-[hsl(var(--primary-soft))] text-foreground" href="/member/claims">
          {copy.navigation.cases}
        </Link>
        <Link href="/member/documents">{copy.navigation.documents}</Link>
        <Link href="/member/membership">{copy.navigation.membership}</Link>
        <Link className="md:ms-auto" href="/help-now">
          <span aria-hidden="true" className="me-2">
            ↗
          </span>
          {copy.navigation.helpNow}
        </Link>
      </nav>
      <aside
        data-testid="member-portal-disclaimer"
        className="max-w-3xl text-xs leading-5 text-foreground/70"
      >
        {copy.disclaimer}
      </aside>
      <div className="grid min-w-0 items-start gap-6 md:grid-cols-2">
        <section aria-label={copy.regions.case.label} className="min-w-0 md:col-span-2">
          {caseRegion}
        </section>
        <section aria-label={copy.regions.actions.label} className="min-w-0">
          {actionsRegion}
        </section>
        <section aria-label={copy.regions.updates.label} className="min-w-0">
          {updatesRegion}
        </section>
      </div>
    </section>
  );
}
