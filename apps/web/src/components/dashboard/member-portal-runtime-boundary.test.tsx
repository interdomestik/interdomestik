import { Suspense } from 'react';
import type { CaseSummary, MembershipLifecycleBucket } from '@interdomestik/domain-member';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import enMessages from '@/messages/en/dashboard.json';
import mkMessages from '@/messages/mk/dashboard.json';
import sqMessages from '@/messages/sq/dashboard.json';
import srMessages from '@/messages/sr/dashboard.json';

import { MemberPortalRegionBoundary } from './member-portal-region-boundary';
import {
  MemberPortalFrame,
  PortalActionsRegion,
  PortalCasesRegion,
  PortalUpdatesRegion,
  type MemberPortalCopy,
} from './member-portal-runtime';

vi.mock('@/i18n/routing', () => ({ Link: 'a' }));

const summaries = JSON.parse(
  '[{"caseKind":"accident","id":"claim-1","reference":"CLM-001","status":"submitted","documentCount":2,"nextStep":"team_review","occurredAt":"2026-08-29T10:00:00.000Z"},{"caseKind":"generic","id":"claim-2","reference":null,"status":"draft","documentCount":0,"nextStep":"member_action","occurredAt":null}]'
) as CaseSummary[];
const buckets =
  'none active trialing active_in_grace grace_expired scheduled_cancel canceled'.split(
    ' '
  ) as MembershipLifecycleBucket[];

const actions = Object.fromEntries(
  buckets.map(bucket => [
    bucket,
    {
      description: `Description ${bucket}`,
      label: `Action ${bucket}`,
      warning:
        bucket.includes('grace') || bucket === 'scheduled_cancel' ? `Warning ${bucket}` : null,
    },
  ])
) as MemberPortalCopy['actions'];

const copy: MemberPortalCopy = {
  ...JSON.parse(
    '{"description":"Safe portal description","disclaimer":"No outcome is promised.","navigation":{"cases":"Cases","documents":"Docs","helpNow":"Help","label":"Shortcuts","membership":"Membership"},"referenceFallback":"Reference unavailable","regions":{"actions":{"empty":"None","error":"Unavailable","label":"Actions","loading":"Loading actions"},"case":{"empty":"No cases yet","error":"Unavailable","label":"Case","loading":"Loading case"},"updates":{"empty":"No updates yet","error":"Updates unavailable","label":"Recent case updates","loading":"Loading updates"}},"title":"My cases"}'
  ),
  actions,
  caseEntryLabel: 'View case',
  caseLabels: summary => ({
    documentCount: 'Documents',
    nextStep: 'Next step',
    nextStepValue: summary.nextStep === 'team_review' ? 'Team review' : 'Member action',
    reference: 'Case reference',
    referenceFallback: 'Reference unavailable',
    status: 'Status',
    statusValue: summary.status === 'submitted' ? 'Submitted' : 'Draft',
  }),
  membershipStatus: {
    accessAllowed: 'Available',
    accessDenied: 'Not available',
    accessLabel: 'New-case access',
    currentPeriodEndLabel: 'Current period ends',
    retry: 'Try again',
    statusLabel: 'Membership status',
    statuses: Object.fromEntries(buckets.map(bucket => [bucket, `Status ${bucket}`])) as Record<
      MembershipLifecycleBucket,
      string
    >,
    unavailable: 'Not available',
  },
  status: value => (value === 'submitted' ? 'Submitted' : 'Draft'),
};
// prettier-ignore
const action = (bucket: MembershipLifecycleBucket, canDraft: boolean) => PortalActionsRegion({ canDraft, copy, locale: 'sq', promise: Promise.resolve({ bucket, currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'), grantsNewCaseAccess: ['active', 'trialing', 'active_in_grace', 'scheduled_cancel'].includes(bucket) }) });

function leafPaths(value: unknown, prefix = ''): string[] {
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? leafPaths(child, path) : [path];
  });
}
const PATHS =
  'actions.active|actions.active_in_grace|actions.canceled|actions.grace_expired|actions.none|actions.scheduled_cancel|actions.trialing|description|disclaimer|membership_status.access_allowed|membership_status.access_denied|membership_status.access_label|membership_status.current_period_end_label|membership_status.retry|membership_status.status_label|membership_status.statuses.active|membership_status.statuses.active_in_grace|membership_status.statuses.canceled|membership_status.statuses.grace_expired|membership_status.statuses.none|membership_status.statuses.scheduled_cancel|membership_status.statuses.trialing|membership_status.unavailable|navigation.cases|navigation.documents|navigation.help_now|navigation.label|navigation.membership|next_steps.court_schedule|next_steps.external_response|next_steps.member_action|next_steps.team_review|regions.actions.empty|regions.actions.error|regions.actions.label|regions.actions.loading|regions.case.empty|regions.case.error|regions.case.label|regions.case.loading|regions.updates.empty|regions.updates.error|regions.updates.label|regions.updates.loading|title|warnings.active_in_grace|warnings.grace_expired|warnings.scheduled_cancel';

describe('Member portal', () => {
  it('renders safe summaries', async () => {
    render(await PortalCasesRegion({ copy, promise: Promise.resolve(summaries) }));
    expect(screen.getByRole('heading', { name: 'Case' })).toBeVisible();
    expect(screen.getByRole('article', { name: 'CLM-001' })).toHaveTextContent('Team review');
    expect(screen.getByRole('article', { name: 'Reference unavailable 2' })).toHaveTextContent('0');
    expect(screen.queryByText('claim-1')).not.toBeInTheDocument();
    expect(screen.queryByText('member_action')).not.toBeInTheDocument();
  });

  it('maps one unambiguous detail link to each represented case', async () => {
    const anotherMissingReference = { ...summaries[1]!, id: 'claim-3/../?&%#', reference: '   ' };
    render(
      await PortalCasesRegion({
        copy,
        promise: Promise.resolve([...summaries, anotherMissingReference]),
      })
    );

    expect(screen.getByRole('link', { name: 'View case CLM-001' })).toHaveAttribute(
      'href',
      '/member/claims/claim-1'
    );
    expect(screen.getByRole('link', { name: 'View case Reference unavailable 2' })).toHaveAttribute(
      'href',
      '/member/claims/claim-2'
    );
    expect(screen.getByRole('link', { name: 'View case Reference unavailable 3' })).toHaveAttribute(
      'href',
      '/member/claims/claim-3%2F..%2F%3F%26%25%23'
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
    for (const article of screen.getAllByRole('article')) {
      expect(article.querySelectorAll('a')).toHaveLength(1);
      expect(article.querySelector('button')).toBeNull();
    }
  });

  it('maps lifecycle actions', async () => {
    for (const bucket of buckets) {
      const view = render(await action(bucket, true));
      const inactive = bucket === 'none' || bucket === 'canceled' || bucket === 'grace_expired';
      // prettier-ignore
      expect(screen.getByRole('link', { name: new RegExp(`Action ${bucket}`, 'u') })).toHaveAttribute('href', `/sq/member/claims/new${inactive ? '?mode=drafts' : ''}`);
      expect(screen.getAllByText('Actions')).toHaveLength(1);
      expect(screen.getByText(`Status ${bucket}`)).toBeVisible();
      expect(screen.getByTestId('member-membership-access')).toHaveTextContent(
        inactive ? 'Not available' : 'Available'
      );
      expect(
        screen.getByTestId('member-membership-access').querySelector('[data-access]')
      ).toHaveAttribute('data-access', inactive ? 'denied' : 'allowed');
      expect(screen.getByTestId('member-membership-access')).toHaveTextContent(
        new Date('2026-12-31T00:00:00.000Z').toLocaleDateString('sq', { timeZone: 'UTC' })
      );
      if (bucket.includes('grace') || bucket === 'scheduled_cancel') {
        expect(screen.getByText(`Warning ${bucket}`)).toBeVisible();
      }
      view.unmount();
    }

    const inactive = render(await action('canceled', false));
    expect(screen.getByRole('link', { name: /Membership/u })).toHaveAttribute(
      'href',
      '/sq/member/membership'
    );
    inactive.unmount();
    render(await action('none', false));
    expect(screen.getByRole('link', { name: /Membership/u })).toHaveAttribute(
      'href',
      '/sq/member/membership'
    );
    expect(screen.getByText('Status none')).toBeVisible();
    expect(screen.getByText('Not available')).toBeVisible();
  });

  it('renders update boundary states', async () => {
    // prettier-ignore
    const view = render(await PortalUpdatesRegion({ copy, locale: 'en', promise: Promise.resolve(summaries) }));
    expect(screen.getByRole('heading', { name: 'Recent case updates' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Recent case updates' })).toHaveTextContent('CLM-001');
    expect(screen.queryByText('claim-1')).not.toBeInTheDocument();
    view.rerender(await PortalCasesRegion({ copy, promise: Promise.resolve([]) }));
    expect(screen.getByRole('heading', { name: 'Case' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Case' })).toHaveTextContent('No cases yet');
    // prettier-ignore
    view.rerender(await PortalUpdatesRegion({ copy, locale: 'en', promise: Promise.reject(new Error('no')) }));
    // prettier-ignore
    expect(screen.getByRole('alert', { name: 'Recent case updates' })).toHaveTextContent('Updates unavailable');
    view.rerender(<MemberPortalRegionBoundary copy={copy.regions.case} state="loading" />);
    expect(screen.getByText('Loading case')).not.toHaveAttribute('role', 'status');
  });

  it('renders disclaimer and ready regions while Case is pending', async () => {
    const pending = new Promise<never>(() => {});
    function SlowCase(): never {
      throw pending;
    }
    render(
      <MemberPortalFrame
        copy={copy}
        actionsRegion={await action('active', false)}
        caseRegion={
          <Suspense
            fallback={<MemberPortalRegionBoundary copy={copy.regions.case} state="loading" />}
          >
            <SlowCase />
          </Suspense>
        }
        updatesRegion={await PortalUpdatesRegion({
          copy,
          locale: 'sq',
          promise: Promise.reject(new Error('updates')),
        })}
      />
    );
    const disclaimer = screen.getByTestId('member-portal-disclaimer');
    const loading = screen.getByText('Loading case');
    expect(disclaimer).toBeVisible();
    expect(
      disclaimer.compareDocumentPosition(loading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Action active/u })).toBeVisible();
    expect(screen.getByRole('alert', { name: 'Recent case updates' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Cases' })).toHaveAttribute('href', '/member/claims');
    expect(screen.queryByTestId('member-dashboard-ready')).not.toBeInTheDocument();
  });

  it.each(['null', 'reject'] as const)('keeps failed data distinct from empty: %s', async mode => {
    const promise = () =>
      mode === 'null' ? Promise.resolve(null) : Promise.reject(new Error('private failure'));
    const view = render(await PortalCasesRegion({ copy, promise: promise() }));
    expect(screen.getByRole('alert', { name: 'Case' })).toHaveTextContent('Unavailable');
    expect(screen.queryByText('No cases yet')).not.toBeInTheDocument();
    view.rerender(
      await PortalActionsRegion({
        canDraft: true,
        copy,
        locale: 'en',
        promise: promise(),
      })
    );
    expect(screen.getByRole('alert', { name: 'Actions' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/member');
    view.rerender(await PortalUpdatesRegion({ copy, locale: 'en', promise: promise() }));
    expect(screen.getByRole('alert', { name: 'Recent case updates' })).toBeVisible();
    expect(screen.queryByText('private failure')).not.toBeInTheDocument();
  });

  it('keeps incident dates and input order without inventing updates for undated cases', async () => {
    render(await PortalUpdatesRegion({ copy, locale: 'en', promise: Promise.resolve(summaries) }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(document.querySelector('time')).toHaveAttribute('datetime', summaries[0]!.occurredAt);
    expect(screen.queryByText('Reference unavailable')).not.toBeInTheDocument();
  });

  it('keeps four catalog contracts aligned', () => {
    const catalogs = [enMessages, mkMessages, sqMessages, srMessages];
    const portals = catalogs.map(({ dashboard }) => dashboard.portal);
    for (const portal of portals) expect(leafPaths(portal).sort().join('|')).toBe(PATHS);
    expect(catalogs.map(({ dashboard }) => dashboard.member_assistance.cases.open)).toEqual([
      'View case',
      'Види случај',
      'Shiko rastin',
      'Vidi slučaj',
    ]);
    expect(new Set(portals.map(portal => portal.title))).toHaveLength(4);
    for (const portal of portals) {
      expect(portal.warnings.active_in_grace).not.toBe(portal.actions.active_in_grace);
      expect(portal.warnings.grace_expired).not.toBe(portal.actions.grace_expired);
      expect(portal.warnings.scheduled_cancel).not.toBe(portal.actions.scheduled_cancel);
    }
  });
});
