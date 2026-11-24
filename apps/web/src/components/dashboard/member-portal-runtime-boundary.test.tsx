import { Suspense, type ComponentProps } from 'react';
import type { MembershipLifecycleBucket } from '@interdomestik/domain-member';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { formatPilotDate } from '@/lib/utils/date';

import { MemberPortalRegionBoundary } from './member-portal-region-boundary';
import {
  MemberPortalFrame,
  PortalActionsRegion,
  PortalCasesRegion,
  PortalUpdatesRegion,
} from './member-portal-runtime';
import { buckets, copy, summaries } from './member-portal-runtime-test-support';

vi.mock('@/i18n/routing', () => ({
  Link: (props: ComponentProps<'a'>) => <a data-soft-navigation="true" {...props} />,
}));
vi.mock('next-intl/server', () => ({ getLocale: vi.fn(() => Promise.resolve('en')) }));

// prettier-ignore
const action = (bucket: MembershipLifecycleBucket, canDraft: boolean, currentPeriodEnd: Date | null = new Date('2026-12-30T23:30:00.000Z')) => PortalActionsRegion({ canDraft, copy, locale: 'sq', promise: Promise.resolve({ bucket, currentPeriodEnd, grantsNewCaseAccess: ['active', 'trialing', 'active_in_grace', 'scheduled_cancel'].includes(bucket) }) });

describe('Member portal', () => {
  it('maps lifecycle actions', async () => {
    for (const bucket of buckets) {
      const view = render(await action(bucket, true));
      const inactive = bucket === 'none' || bucket === 'canceled' || bucket === 'grace_expired';
      // prettier-ignore
      expect(screen.getByRole('link', { name: new RegExp(`Action ${bucket}`, 'u') })).toHaveAttribute('href', `/sq/member/claims/new${inactive ? '?mode=drafts' : ''}`);
      expect(screen.getAllByRole('link')).toHaveLength(1);
      expect(screen.getAllByText('Actions')).toHaveLength(1);
      expect(screen.queryByText(copy.actions[bucket].description)).not.toBeInTheDocument();
      expect(screen.getByText(`Status ${bucket}`)).toBeVisible();
      expect(screen.getByText(`Status ${bucket}`)).toHaveAttribute('data-lifecycle-status', bucket);
      expect(screen.getByTestId('member-membership-access')).toHaveTextContent(
        inactive ? 'Not available' : 'Available'
      );
      expect(
        screen.getByTestId('member-membership-access').querySelector('[data-access]')
      ).toHaveAttribute('data-access', inactive ? 'denied' : 'allowed');
      expect(screen.getByTestId('member-membership-access')).toHaveTextContent(
        formatPilotDate('2026-12-30T23:30:00.000Z', 'sq', copy.membershipStatus.unavailable)
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

  it.each(['canceled', 'grace_expired', 'none'] as const)(
    'renders one membership link and keeps the lifecycle copy for %s without draft access',
    async bucket => {
      const { container } = render(await action(bucket, false, null));
      const { label, warning } = copy.actions[bucket];
      expect(screen.getAllByRole('link')).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Membership' })).toHaveAttribute(
        'href',
        '/sq/member/membership'
      );
      expect(container).not.toHaveTextContent(label);
      const facts = screen.getByTestId('member-membership-access');
      expect(facts).toHaveTextContent(copy.membershipStatus.statuses[bucket]);
      expect(facts.querySelector('[data-access]')).toHaveAttribute('data-access', 'denied');
      expect(facts.querySelector(':scope > div:last-child dd')).toHaveTextContent(
        copy.membershipStatus.unavailable
      );
      if (warning) expect(screen.getByText(warning)).toBeVisible();
    }
  );

  it('renders update boundary states', async () => {
    // prettier-ignore
    const view = render(await PortalUpdatesRegion({ copy, locale: 'en', promise: Promise.resolve(summaries) }));
    expect(screen.getByRole('heading', { name: 'Recent case updates' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Recent case updates' })).toHaveTextContent('CLM-001');
    expect(screen.queryByText('claim-1')).not.toBeInTheDocument();
    view.rerender(await PortalCasesRegion({ copy, promise: Promise.resolve([]) }));
    expect(screen.getByRole('heading', { name: 'Case' })).toBeVisible();
    expect(screen.getByText('No cases yet')).toHaveAttribute('role', 'status');
    expect(screen.getByText('No cases yet')).not.toHaveAttribute('aria-label');
    // prettier-ignore
    view.rerender(await PortalUpdatesRegion({ copy, locale: 'en', promise: Promise.reject(new Error('no')) }));
    expect(screen.getByText('Updates unavailable')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Updates unavailable')).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/en/member');
    view.rerender(<MemberPortalRegionBoundary copy={copy.regions.case} state="loading" />);
    const loading = screen.getByText('Loading case');
    expect(loading).toBeVisible();
    expect(loading).not.toHaveAttribute('role');
    expect(loading).not.toHaveAttribute('aria-label');
    const card = loading.closest('[data-region-state="loading"]');
    expect(card).not.toHaveAttribute('role');
    expect(card).toHaveAttribute('aria-busy', 'true');
    const skeletons = Array.from(card!.querySelectorAll('[aria-hidden="true"] > div'));
    expect(skeletons).toHaveLength(2);
    for (const skeleton of skeletons) expect(skeleton).toBeVisible();
  });

  it('renders a native retry link synchronously with the supplied locale', () => {
    render(
      MemberPortalRegionBoundary({
        action: { href: '/member', label: 'Try again' },
        copy: copy.regions.case,
        locale: 'sq',
        state: 'error',
      })
    );
    const retry = screen.getByRole('link', { name: 'Try again' });
    expect(retry).toHaveAttribute('href', '/sq/member');
    expect(retry).not.toHaveAttribute('data-soft-navigation');
  });

  it('renders disclaimer and ready regions while Case is pending', async () => {
    const pending = new Promise<never>(() => {});
    function SlowCase(): never {
      throw pending;
    }
    const { container } = render(
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
    const sections = Array.from(container.querySelectorAll('section[aria-label]'));
    expect(sections.map(section => section.getAttribute('aria-label'))).toEqual([
      copy.regions.case.label,
      copy.regions.actions.label,
      copy.regions.updates.label,
    ]);
    expect(
      disclaimer.compareDocumentPosition(sections[0]!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
    expect(
      within(screen.getByRole('navigation'))
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual(['/member/claims', '/member/documents', '/member/membership', '/help-now']);
    expect(sections[0]).toHaveClass('md:col-span-2');
    expect(sections[0]?.parentElement).toHaveClass('md:grid-cols-2');
    expect(disclaimer).toBeVisible();
    expect(
      disclaimer.compareDocumentPosition(loading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Action active/u })).toBeVisible();
    expect(screen.getByText('Updates unavailable')).toBeVisible();
    expect(screen.getByText('Updates unavailable')).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('link', { name: 'Cases' })).toHaveAttribute('href', '/member/claims');
    expect(screen.queryByTestId('member-dashboard-ready')).not.toBeInTheDocument();
  });

  it.each(['null', 'reject'] as const)('keeps failed data distinct from empty: %s', async mode => {
    const promise = () =>
      mode === 'null' ? Promise.resolve(null) : Promise.reject(new Error('private failure'));
    const view = render(await PortalCasesRegion({ copy, promise: promise() }));
    expect(screen.getByText('Case unavailable')).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/en/member');
    expect(screen.queryByText('No cases yet')).not.toBeInTheDocument();
    view.rerender(
      await PortalActionsRegion({
        canDraft: true,
        copy,
        locale: 'en',
        promise: promise(),
      })
    );
    expect(screen.getByText('Actions unavailable')).toBeVisible();
    expect(screen.getByText('Actions unavailable')).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/en/member');
    view.rerender(await PortalUpdatesRegion({ copy, locale: 'en', promise: promise() }));
    expect(screen.getByText('Updates unavailable')).toBeVisible();
    expect(screen.getByText('Updates unavailable')).toHaveAttribute('role', 'alert');
    expect(screen.queryByText('private failure')).not.toBeInTheDocument();
  });
});
