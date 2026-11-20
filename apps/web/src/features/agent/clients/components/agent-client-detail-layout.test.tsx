import { render, screen } from '@testing-library/react';
import { Button } from '@interdomestik/ui';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import mk from '@/messages/mk/agent.json';
import { AgentClientDetailV2Page } from './AgentClientDetailV2Page';

vi.mock('@/i18n/routing', () => ({ Link: (props: ComponentProps<'a'>) => <a {...props} /> }));
vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: async () => ({
    session: { user: { id: 'agent', role: 'agent', tenantId: 'mk' } },
    authority: {},
  }),
}));
vi.mock('@/app/[locale]/(agent)/agent/clients/[id]/_core', () => ({
  getAgentClientProfileCore: async () => ({
    kind: 'ok',
    member: {
      id: 'member',
      name: 'Тест Член',
      email: 'long.member.address@example.invalid',
      role: 'member',
      createdAt: '2026-01-01',
    },
    membership: { status: 'active', badgeClass: '' },
    preferences: null,
    claimCounts: {},
    recentClaims: [],
    activities: [],
  }),
}));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations:
    async ({ namespace }: { namespace: string }) =>
    (key: string) =>
      namespace === 'agent' && key === 'activity.section_title'
        ? mk.agent.activity.section_title
        : key,
}));
vi.mock('@/components/agent/member-notes-card', () => ({ MemberNotesCard: () => null }));
vi.mock('@/components/crm/activity-feed', () => ({ ActivityFeed: () => null }));
vi.mock('@/components/crm/log-activity-dialog', () => ({
  LogActivityDialog: () => <Button>{mk.agent.activity_dialog.trigger}</Button>,
}));
vi.mock('@/app/[locale]/(agent)/agent/clients/[id]/components/membership-card', () => ({
  MembershipCard: () => null,
}));
vi.mock('@/app/[locale]/(agent)/agent/clients/[id]/components/agent-card', () => ({
  AgentCard: () => null,
}));
vi.mock('@/app/[locale]/(agent)/agent/clients/[id]/components/preferences-card', () => ({
  PreferencesCard: () => null,
}));
vi.mock('@/app/[locale]/(agent)/agent/clients/[id]/components/claims-overview-card', () => ({
  ClaimsOverviewCard: () => null,
}));
vi.mock('@/app/[locale]/(agent)/agent/clients/[id]/components/recent-claims-card', () => ({
  RecentClaimsCard: () => null,
}));

describe('Macedonian client detail reflow', () => {
  it('stacks the activity action on phones and wraps the member email', async () => {
    render(await AgentClientDetailV2Page({ id: 'member', locale: 'mk' }));
    const root = screen.getByTestId('agent-member-detail-ready');
    expect(root).toHaveClass('min-w-0', '[overflow-wrap:anywhere]');
    const title = screen.getByRole('heading', { name: mk.agent.activity.section_title });
    expect(title.parentElement).toHaveClass(
      'flex-col',
      'items-start',
      'sm:flex-row',
      'sm:flex-wrap',
      'gap-3'
    );
    expect(title.parentElement).toContainElement(
      screen.getByRole('button', { name: mk.agent.activity_dialog.trigger })
    );
    expect(screen.getByText('long.member.address@example.invalid')).toHaveClass(
      'min-w-0',
      '[overflow-wrap:anywhere]'
    );
    for (const grid of root.querySelectorAll(':scope > .grid'))
      expect(grid).toHaveClass('min-w-0', 'grid-cols-1');
  });
});
