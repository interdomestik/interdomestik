import type { ComponentProps } from 'react';
import type { CaseSummary } from '@interdomestik/domain-member';
import { render, screen, within } from '@testing-library/react';
import { getLocale } from 'next-intl/server';
import { describe, expect, it, vi } from 'vitest';

import { formatNumber } from '@/lib/utils/number';
import { formatPilotDate } from '@/lib/utils/date';
import deMessages from '@/messages/de/dashboard.json';
import enMessages from '@/messages/en/dashboard.json';
import mkMessages from '@/messages/mk/dashboard.json';
import sqMessages from '@/messages/sq/dashboard.json';
import srMessages from '@/messages/sr/dashboard.json';

import {
  PortalCasesRegion,
  PortalUpdatesRegion,
  type MemberPortalCopy,
} from './member-portal-runtime';
import { copy, summaries } from './member-portal-runtime-test-support';

vi.mock('@/i18n/routing', () => ({
  Link: (props: ComponentProps<'a'>) => <a data-soft-navigation="true" {...props} />,
}));
vi.mock('next-intl/server', () => ({ getLocale: vi.fn(() => Promise.resolve('en')) }));

function leafPaths(value: unknown, prefix = ''): string[] {
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? leafPaths(child, path) : [path];
  });
}
const PATHS =
  'actions.active|actions.active_in_grace|actions.canceled|actions.grace_expired|actions.none|actions.scheduled_cancel|actions.trialing|description|disclaimer|membership_status.access_allowed|membership_status.access_denied|membership_status.access_label|membership_status.current_period_end_label|membership_status.retry|membership_status.status_label|membership_status.statuses.active|membership_status.statuses.active_in_grace|membership_status.statuses.canceled|membership_status.statuses.grace_expired|membership_status.statuses.none|membership_status.statuses.scheduled_cancel|membership_status.statuses.trialing|membership_status.unavailable|navigation.cases|navigation.documents|navigation.help_now|navigation.label|navigation.membership|next_steps.court_schedule|next_steps.external_response|next_steps.member_action|next_steps.review_case|next_steps.team_review|regions.actions.empty|regions.actions.error|regions.actions.label|regions.actions.loading|regions.case.empty|regions.case.error|regions.case.label|regions.case.loading|regions.updates.empty|regions.updates.error|regions.updates.label|regions.updates.loading|title|updates_item.current_status|updates_item.occurred|warnings.active_in_grace|warnings.grace_expired|warnings.scheduled_cancel';
type NextStepCatalog = Record<Exclude<CaseSummary['nextStep'], 'complete'>, string>;
const NEXT_STEP_CATALOGS: ReadonlyArray<readonly [string, NextStepCatalog]> = [
  ['en', enMessages.dashboard.portal.next_steps],
  ['mk', mkMessages.dashboard.portal.next_steps],
  ['sq', sqMessages.dashboard.portal.next_steps],
  ['sr', srMessages.dashboard.portal.next_steps],
];

describe('Member portal', () => {
  it('renders safe summaries', async () => {
    render(await PortalCasesRegion({ copy, promise: Promise.resolve(summaries) }));
    expect(screen.getByRole('heading', { name: 'Case' })).toBeVisible();
    expect(screen.getByRole('article', { name: 'CLM-001' })).toHaveTextContent('Team review');
    expect(screen.getByRole('article', { name: 'Property damage case' })).toHaveTextContent('0');
    expect(screen.queryByText('claim-1')).not.toBeInTheDocument();
    expect(screen.queryByText('member_action')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View case CLM-001' })).toHaveClass(
      'border-foreground/60',
      'min-h-11'
    );
    expect(screen.getByRole('link', { name: 'View case Property damage case' })).toHaveClass(
      'bg-[hsl(var(--primary))]',
      'min-h-11'
    );
    const nextStep = screen.getByText('Member action').closest('div');
    expect(nextStep).toHaveClass('bg-[hsl(var(--primary-soft))]');
    expect(screen.getByText('Team review').closest('div')).not.toHaveClass(
      'bg-[hsl(var(--primary-soft))]'
    );
  });

  it('maps one unambiguous detail link to each represented case', async () => {
    const anotherMissingReference = {
      ...summaries[1]!,
      id: 'claim-3/../?&%#',
      reference: '   ',
      title: 'Travel incident',
    };
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
    expect(screen.getByRole('link', { name: 'View case Property damage case' })).toHaveAttribute(
      'href',
      '/member/claims/claim-2'
    );
    expect(screen.getByRole('link', { name: 'View case Travel incident' })).toHaveAttribute(
      'href',
      '/member/claims/claim-3%2F..%2F%3F%26%25%23'
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
    for (const article of screen.getAllByRole('article')) {
      expect(article.querySelectorAll('a')).toHaveLength(1);
      expect(article.querySelector('button')).toBeNull();
    }
  });

  it('formats the document count using the current request locale', async () => {
    vi.mocked(getLocale).mockResolvedValueOnce('de');
    render(
      await PortalCasesRegion({
        copy,
        promise: Promise.resolve([{ ...summaries[0]!, documentCount: 1234 }]),
      })
    );
    const card = screen.getByRole('article', { name: 'CLM-001' });
    expect(within(card).getByText('1.234')).toBeVisible();
  });

  it('adds a localized date or list position to the fallback heading and link', async () => {
    const dated = { ...summaries[0]!, reference: ' ', title: ' ' };
    const undated = { ...summaries[1]!, title: '' };
    render(await PortalCasesRegion({ copy, promise: Promise.resolve([dated, undated]) }));

    const references = [
      `Reference unavailable · ${formatPilotDate(dated.occurredAt, 'en', copy.membershipStatus.unavailable)}`,
      `Reference unavailable · ${formatNumber(2, 'en')}`,
    ];
    for (const reference of references) {
      const article = screen.getByRole('article', { name: reference });
      expect(within(article).getByRole('heading', { level: 3, name: reference })).toBeVisible();
      expect(within(article).getByRole('link', { name: `View case ${reference}` })).toBeVisible();
    }
  });

  it('keeps incident dates and input order without inventing updates for undated cases', async () => {
    render(await PortalUpdatesRegion({ copy, locale: 'en', promise: Promise.resolve(summaries) }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    const time = screen.getByRole('listitem').querySelector('time');
    expect(time).toHaveAttribute('datetime', summaries[0]!.occurredAt);
    expect(time).toHaveTextContent('08/29/2026');
    const facts = screen.getByRole('listitem').querySelector('dl');
    expect(facts).toContainElement(time);
    expect(
      within(facts!)
        .getAllByRole('term')
        .map(term => term.textContent)
    ).toEqual(['Incident date', 'Current status']);
    expect(within(facts!).getAllByRole('definition')[1]).toHaveTextContent('Submitted');
    expect(screen.getByRole('listitem')).toHaveTextContent('Submitted');
    expect(screen.queryByText('Reference unavailable')).not.toBeInTheDocument();
  });

  it('announces an empty update timeline when no cases have an incident date', async () => {
    render(
      await PortalUpdatesRegion({
        copy,
        locale: 'en',
        promise: Promise.resolve([summaries[1]!]),
      })
    );
    expect(screen.getByRole('status')).toHaveTextContent(copy.regions.updates.empty);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('keeps four catalog contracts aligned', () => {
    const catalogs = [enMessages, mkMessages, sqMessages, srMessages];
    const portals = catalogs.map(({ dashboard }) => dashboard.portal);
    for (const portal of [...portals, deMessages.dashboard.portal]) {
      expect(
        leafPaths(portal)
          .sort((a, b) => a.localeCompare(b))
          .join('|')
      ).toBe(PATHS);
    }
    expect(catalogs.map(({ dashboard }) => dashboard.member_assistance.cases.open)).toEqual([
      'View case',
      'Види случај',
      'Shiko rastin',
      'Vidi slučaj',
    ]);
    expect(new Set(portals.map(portal => portal.title))).toHaveLength(4);
    expect(new Set(portals.map(portal => portal.next_steps.review_case))).toHaveLength(4);
    for (const portal of portals) {
      expect(portal.warnings.active_in_grace).not.toBe(portal.actions.active_in_grace);
      expect(portal.warnings.grace_expired).not.toBe(portal.actions.grace_expired);
      expect(portal.warnings.scheduled_cancel).not.toBe(portal.actions.scheduled_cancel);
      expect(portal.next_steps.review_case).not.toBe(portal.next_steps.member_action);
    }
  });

  it('keeps verification navigation neutral in four locales', async () => {
    const verification: CaseSummary = {
      caseKind: 'generic',
      documentCount: 1,
      id: 'claim-9',
      nextStep: 'review_case',
      occurredAt: null,
      reference: 'CLM-009',
      status: 'verification',
    };
    for (const [locale, steps] of NEXT_STEP_CATALOGS) {
      // prettier-ignore
      const localized: MemberPortalCopy = { ...copy, caseLabels: summary => ({ ...copy.caseLabels(summary), nextStepValue: summary.nextStep === 'complete' ? copy.status(summary.status) : steps[summary.nextStep] }) };
      const view = render(
        await PortalCasesRegion({ copy: localized, promise: Promise.resolve([verification]) })
      );
      const article = screen.getByRole('article', { name: 'CLM-009' });
      expect(article, locale).toHaveTextContent(steps.review_case);
      expect(article, locale).not.toHaveTextContent(steps.member_action);
      expect(article, locale).not.toHaveTextContent('review_case');
      expect(article.querySelectorAll('a')).toHaveLength(1);
      view.unmount();
    }
  });
});
