import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

function HookHarness() {
  useDashboardNavigation();
  return null;
}

describe('useDashboardNavigation', () => {
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
});
