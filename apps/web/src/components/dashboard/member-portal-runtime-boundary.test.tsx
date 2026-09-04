import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CaseSummary, MembershipLifecycleBucket } from '@interdomestik/domain-member';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
  caseLabels: summary => ({
    documentCount: 'Documents',
    nextStep: 'Next step',
    nextStepValue: summary.nextStep === 'team_review' ? 'Team review' : 'Member action',
    reference: 'Case reference',
    referenceFallback: 'Reference unavailable',
    status: 'Status',
    statusValue: summary.status === 'submitted' ? 'Submitted' : 'Draft',
  }),
  status: value => (value === 'submitted' ? 'Submitted' : 'Draft'),
};
// prettier-ignore
const action = (bucket: MembershipLifecycleBucket, canDraft: boolean, isAgent = false) => PortalActionsRegion({ canDraft, copy, isAgent, locale: 'sq', promise: Promise.resolve({ bucket }) });

function leafPaths(value: unknown, prefix = ''): string[] {
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? leafPaths(child, path) : [path];
  });
}
const PATHS =
  'actions.active|actions.active_in_grace|actions.canceled|actions.grace_expired|actions.none|actions.scheduled_cancel|actions.trialing|description|disclaimer|navigation.cases|navigation.documents|navigation.help_now|navigation.label|navigation.membership|next_steps.court_schedule|next_steps.external_response|next_steps.member_action|next_steps.team_review|regions.actions.empty|regions.actions.error|regions.actions.label|regions.actions.loading|regions.case.empty|regions.case.error|regions.case.label|regions.case.loading|regions.updates.empty|regions.updates.error|regions.updates.label|regions.updates.loading|title|warnings.active_in_grace|warnings.grace_expired|warnings.scheduled_cancel';

describe('Member portal', () => {
  it('renders safe summaries', async () => {
    render(await PortalCasesRegion({ copy, promise: Promise.resolve(summaries) }));
    expect(screen.getByRole('heading', { name: 'Case' })).toBeVisible();
    expect(screen.getByRole('article', { name: 'CLM-001' })).toHaveTextContent('Team review');
    expect(screen.getByRole('article', { name: 'Reference unavailable' })).toHaveTextContent('0');
    expect(screen.queryByText('claim-1')).not.toBeInTheDocument();
    expect(screen.queryByText('member_action')).not.toBeInTheDocument();
  });

  it('maps lifecycle actions', async () => {
    for (const bucket of buckets) {
      const view = render(await action(bucket, true));
      const inactive = bucket === 'none' || bucket === 'canceled' || bucket === 'grace_expired';
      // prettier-ignore
      expect(screen.getByRole('link', { name: new RegExp(`Action ${bucket}`, 'u') })).toHaveAttribute('href', `/sq/member/claims/new${inactive ? '?mode=drafts' : ''}`);
      expect(screen.getAllByText('Actions')).toHaveLength(1);
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
    render(await action('none', false, true));
    expect(screen.getByRole('link', { name: /Action active/u })).toHaveAttribute(
      'href',
      '/sq/member/claims/new'
    );
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

  it('keeps navigation outside boundaries', async () => {
    const source = readFileSync(resolve(import.meta.dirname, 'member-portal-runtime.tsx'), 'utf8');
    expect(source.match(/<Suspense\b/gu) ?? []).toHaveLength(3);
    expect(source).toMatch(/<nav[\s\S]+member-portal-disclaimer[\s\S]+PortalUi\.Unified/u);
    expect(source).toMatch(/<Link href="\/member\/claims">\s*\{copy\.navigation\.cases\}/u);
    expect(source).toMatch(/caseTask[\s\S]+caseTask[\s\S]+membershipTask/u);
    expect(source).not.toMatch(
      /@interdomestik\/(?:database|shared-auth)|fetch\(|['"]use client['"]|proxy|middleware/u
    );
    expect(MemberPortalRuntime).toBeTypeOf('function');
  });

  it('keeps four catalog contracts aligned', () => {
    const portals = [enMessages, mkMessages, sqMessages, srMessages].map(
      ({ dashboard }) => dashboard.portal
    );
    for (const portal of portals) expect(leafPaths(portal).sort().join('|')).toBe(PATHS);
    expect(new Set(portals.map(portal => portal.title))).toHaveLength(4);
    for (const portal of portals) {
      expect(portal.warnings.active_in_grace).not.toBe(portal.actions.active_in_grace);
      expect(portal.warnings.grace_expired).not.toBe(portal.actions.grace_expired);
      expect(portal.warnings.scheduled_cancel).not.toBe(portal.actions.scheduled_cancel);
    }
  });
});
