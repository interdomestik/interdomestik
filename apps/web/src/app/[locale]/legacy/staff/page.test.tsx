import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LegacyStaffPage from './page';

vi.mock('@/components/agent/agent-stats-cards', () => ({
  AgentStatsCards: () => <div data-testid="agent-stats-cards" />,
}));

vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: () => <span data-testid="claim-status-badge" />,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: {
          id: 'staff-1',
          tenantId: 'tenant-1',
          role: 'staff',
        },
      }),
    },
  },
}));

vi.mock('@/lib/db.server', () => ({
  db: {},
}));

vi.mock('@/app/[locale]/(staff)/staff/_core', () => ({
  getStaffDashboardCore: async () => ({
    ok: true,
    data: {
      stats: {},
      recentClaims: [
        {
          id: 'claim-1',
          title: 'Sample claim',
          companyName: 'Acme Co',
          status: 'submitted',
          user: { name: 'Jane Doe' },
        },
      ],
    },
  }),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: () => null,
  getTranslations: async () => (key: string) => key,
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: () => {
    throw new Error('redirect');
  },
}));

describe('LegacyStaffPage', () => {
  it('renders view links with unique aria-labels', async () => {
    const result = await LegacyStaffPage({ params: Promise.resolve({ locale: 'en' }) });
    render(result);

    expect(screen.getByLabelText('View claim Sample claim')).toBeInTheDocument();
  });
});
