import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/agent-users', () => ({
  getAgentUsers: vi.fn(async () => []),
}));

vi.mock('@/components/agent/agent-users-filters', () => ({
  AgentUsersFilters: () => null,
}));

vi.mock('@/components/agent/agent-users-sections', () => ({
  AgentUsersSections: () => null,
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));

import AgentClientsPage from './_core.entry';

describe('/agent/clients list header', () => {
  it('does not render enrollment CTA during pilot', async () => {
    const element = await AgentClientsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(element);

    expect(document.querySelector('a[href="/agent/clients/new"]')).toBeNull();
    expect(screen.queryByText(/register member/i)).not.toBeInTheDocument();
  });
});
