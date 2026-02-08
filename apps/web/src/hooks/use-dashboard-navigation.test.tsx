import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDashboardNavigation } from './use-dashboard-navigation';

const mockCanAccessAdmin = vi.fn();
vi.mock('@/actions/admin-access', () => ({
  canAccessAdmin: () => mockCanAccessAdmin(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(),
  },
}));

import { authClient } from '@/lib/auth-client';
const mockUseSession = vi.mocked(authClient.useSession);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function HookHarness({ agentTier }: { agentTier?: string }) {
  const { items } = useDashboardNavigation(agentTier);
  return (
    <div>
      {items.map(item => (
        <div
          key={`${item.title}-${item.href}`}
          data-testid="nav-item"
          data-title={item.title}
          data-href={item.href}
        />
      ))}
    </div>
  );
}

describe('useDashboardNavigation', () => {
  beforeEach(() => {
    mockCanAccessAdmin.mockResolvedValue(false);
  });

  it('does not check admin access before role is known', async () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: true,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<HookHarness />);

    await waitFor(() => {
      expect(mockCanAccessAdmin).not.toHaveBeenCalled();
    });
  });

  it('returns canonical agent hub link', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: 'agent' } },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<HookHarness />);

    await waitFor(() => {
      const items = screen.getAllByTestId('nav-item');
      const agentHub = items.find(item => item.getAttribute('data-title') === 'Agent Hub');
      expect(agentHub).toBeTruthy();
      expect(agentHub?.getAttribute('data-href')).toBe('/agent');
    });
  });

  it('returns canonical admin dashboard link', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: 'admin' } },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<HookHarness />);

    await waitFor(() => {
      const items = screen.getAllByTestId('nav-item');
      const adminDashboard = items.find(
        item => item.getAttribute('data-title') === 'adminDashboard'
      );
      expect(adminDashboard).toBeTruthy();
      expect(adminDashboard?.getAttribute('data-href')).toBe('/admin/overview');
    });
  });
});
