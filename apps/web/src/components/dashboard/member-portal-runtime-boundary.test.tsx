import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CaseSummary, MembershipLifecycleBucket } from '@interdomestik/domain-member';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MemberPortalRegionBoundary } from './member-portal-region-boundary';
import {
  MemberPortalRuntime,
  PortalActionsRegion,
  PortalCasesRegion,
  PortalUpdatesRegion,
  type MemberPortalCopy,
} from './member-portal-runtime';

const summaries: CaseSummary[] = [
  {
    caseKind: 'accident',
    id: 'claim-1',
    reference: 'CLM-001',
    status: 'submitted',
    documentCount: 2,
    nextStep: 'team_review',
    occurredAt: '2026-08-29T10:00:00.000Z',
  },
  {
    caseKind: 'generic',
    id: 'claim-2',
    reference: null,
    status: 'draft',
    documentCount: 0,
    nextStep: 'member_action',
    occurredAt: null,
  },
];

const buckets: MembershipLifecycleBucket[] = [
  'none',
  'active',
  'trialing',
  'active_in_grace',
  'grace_expired',
  'scheduled_cancel',
  'canceled',
];

const actionCopy = Object.fromEntries(
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
  actions: actionCopy,
  caseLabels: summary => ({
    documentCount: 'Documents',
    nextStep: 'Next step',
    nextStepValue: summary.nextStep === 'team_review' ? 'Team review' : 'Member action',
    reference: 'Case reference',
    referenceFallback: 'Reference unavailable',
    status: 'Status',
    statusValue: summary.status === 'submitted' ? 'Submitted' : 'Draft',
  }),
  description: 'Safe portal description',
  disclaimer: 'No outcome is promised and professional review may be required.',
  navigation: {
    documents: 'Documents',
    helpNow: 'Help Now',
    label: 'Member shortcuts',
    membership: 'Membership',
  },
  referenceFallback: 'Reference unavailable',
  regions: {
    actions: {
      empty: 'No action',
      error: 'Actions unavailable',
      label: 'Actions',
      loading: 'Loading actions',
    },
    case: {
      empty: 'No cases yet',
      error: 'Cases unavailable',
      label: 'Case',
      loading: 'Loading case',
    },
    updates: {
      empty: 'No updates yet',
      error: 'Updates unavailable',
      label: 'Recent case updates',
      loading: 'Loading updates',
    },
  },
  status: value => (value === 'submitted' ? 'Submitted' : 'Draft'),
  title: 'My cases',
};

describe('MemberPortalRuntime boundaries', () => {
  it('renders accident and generic safe summaries without raw identifiers or tokens', async () => {
    render(await PortalCasesRegion({ copy, promise: Promise.resolve(summaries) }));
    expect(screen.getByRole('heading', { name: 'Case' })).toBeVisible();
    expect(screen.getByRole('article', { name: 'CLM-001' })).toHaveTextContent('Team review');
    expect(screen.getByRole('article', { name: 'Reference unavailable' })).toHaveTextContent('0');
    expect(screen.queryByText('claim-1')).not.toBeInTheDocument();
    expect(screen.queryByText('member_action')).not.toBeInTheDocument();
  });

  it('maps every lifecycle bucket to the exact canonical intake action and textual warnings', async () => {
    for (const bucket of buckets) {
      const view = render(
        await PortalActionsRegion({
          copy,
          locale: 'sq',
          promise: Promise.resolve({ bucket }),
        })
      );
      const inactive = bucket === 'none' || bucket === 'canceled' || bucket === 'grace_expired';
      expect(screen.getByRole('heading', { name: 'Actions' })).toBeVisible();
      expect(
        screen.getByRole('link', { name: new RegExp(`Action ${bucket}`, 'u') })
      ).toHaveAttribute('href', `/sq/member/claims/new${inactive ? '?mode=drafts' : ''}`);
      if (bucket.includes('grace') || bucket === 'scheduled_cancel') {
        expect(screen.getByText(`Warning ${bucket}`)).toBeVisible();
      }
      view.unmount();
    }
  });

  it('presents recent safe updates and explicit empty, loading, and error states', async () => {
    const view = render(
      await PortalUpdatesRegion({ copy, locale: 'en', promise: Promise.resolve(summaries) })
    );
    expect(screen.getByRole('heading', { name: 'Recent case updates' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Recent case updates' })).toHaveTextContent('CLM-001');
    expect(screen.queryByText('claim-1')).not.toBeInTheDocument();
    view.rerender(await PortalCasesRegion({ copy, promise: Promise.resolve([]) }));
    expect(screen.getByRole('heading', { name: 'Case' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Case' })).toHaveTextContent('No cases yet');
    view.rerender(
      await PortalUpdatesRegion({ copy, locale: 'en', promise: Promise.reject(new Error('no')) })
    );
    expect(screen.getByRole('alert', { name: 'Recent case updates' })).toHaveTextContent(
      'Updates unavailable'
    );
    view.rerender(<MemberPortalRegionBoundary copy={copy.regions.case} state="loading" />);
    expect(screen.getByText('Loading case')).not.toHaveAttribute('role', 'status');
  });

  it('keeps navigation and disclaimer outside three independent server boundaries', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/member-portal-runtime.tsx'),
      'utf8'
    );
    expect(source.match(/<Suspense\b/gu) ?? []).toHaveLength(3);
    expect(source).toMatch(/<nav[\s\S]+member-portal-disclaimer[\s\S]+<UnifiedPortalShell/u);
    expect(source).toMatch(/casesPromise[\s\S]+casesPromise[\s\S]+membershipPromise/u);
    expect(source).not.toMatch(
      /@interdomestik\/(?:database|shared-auth)|fetch\(|['"]use client['"]|proxy|middleware/u
    );
    const element = await MemberPortalRuntime({
      casesPromise: Promise.resolve([]),
      copy,
      locale: 'sq',
      membershipPromise: Promise.resolve({ bucket: 'active' }),
    });
    expect(element.type).toBe('section');
  });

  it('owns the same complete portal copy contract in exactly four locale catalogs', () => {
    const portals = ['en', 'mk', 'sq', 'sr'].map(
      locale =>
        JSON.parse(
          readFileSync(resolve(process.cwd(), `src/messages/${locale}/dashboard.json`), 'utf8')
        ).dashboard.portal
    );
    expect(
      portals.every(portal => portal?.regions?.updates?.label && portal?.actions?.scheduled_cancel)
    ).toBe(true);
    expect(new Set(portals.map(portal => portal.title))).toHaveLength(4);
  });
});
