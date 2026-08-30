import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CaseSummary, MembershipLifecycleBucket } from '@interdomestik/domain-member';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import enMessages from '@/messages/en/dashboard.json';
import mkMessages from '@/messages/mk/dashboard.json';
import sqMessages from '@/messages/sq/dashboard.json';
import srMessages from '@/messages/sr/dashboard.json';

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

function leafPaths(value: unknown, prefix = ''): string[] {
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? leafPaths(child, path) : [path];
  });
}

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
  navigation: { documents: 'Docs', helpNow: 'Help', label: 'Shortcuts', membership: 'Membership' },
  referenceFallback: 'Reference unavailable',
  regions: {
    actions: { empty: 'None', error: 'Unavailable', label: 'Actions', loading: 'Loading' },
    case: { empty: 'No cases yet', error: 'Unavailable', label: 'Case', loading: 'Loading case' },
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
    const source = readFileSync(resolve(import.meta.dirname, 'member-portal-runtime.tsx'), 'utf8');
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
    const portals = [enMessages, mkMessages, sqMessages, srMessages].map(
      ({ dashboard }) => dashboard.portal
    );
    const expectedPaths = [
      'title',
      'description',
      'disclaimer',
      ...['label', 'help_now', 'documents', 'membership'].map(key => `navigation.${key}`),
      ...['case', 'actions', 'updates'].flatMap(region =>
        ['label', 'loading', 'empty', 'error'].map(state => `regions.${region}.${state}`)
      ),
      ...buckets.map(bucket => `actions.${bucket}`),
    ].sort();
    expect(portals.map(portal => leafPaths(portal).sort())).toEqual(
      portals.map(() => expectedPaths)
    );
    expect(new Set(portals.map(portal => portal.title))).toHaveLength(4);
  });
});
