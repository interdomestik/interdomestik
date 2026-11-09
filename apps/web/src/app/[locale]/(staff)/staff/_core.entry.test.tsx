import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: { user: { id: 'staff-1', role: 'staff', secret: 'server-only' } },
  getSession: vi.fn(),
  requireSession: vi.fn(),
  admitPortal: vi.fn(),
  authorizeTenant: vi.fn(),
  requireAdmin: vi.fn(),
  shell: vi.fn(),
}));
vi.mock('@/app/_segment-exports', () => ({ generateMetadata: vi.fn(), generateViewport: vi.fn() }));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getMessages: vi.fn(() =>
    Promise.resolve({ nav: {}, dashboard: {}, common: {}, 'agent-claims': {} })
  ),
}));
vi.mock('@/components/shell/session', () => ({
  getSessionSafe: state.getSession,
  requireSessionOrRedirect: state.requireSession,
}));
vi.mock('@/server/auth/effective-portal-access', () => ({
  requireEffectivePortalAccessOrNotFound: state.admitPortal,
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: state.authorizeTenant }));
vi.mock('@interdomestik/domain-users/admin/access', () => ({
  requireTenantAdminSession: state.requireAdmin,
}));
vi.mock('@/components/shell/authenticated-shell', () => ({
  AuthenticatedShell: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
}));
vi.mock('@/components/shell/staff-role-shell', () => ({
  StaffRoleShell: (props: Readonly<{ children: ReactNode }>) => {
    state.shell(props);
    return <>{props.children}</>;
  },
}));

import StaffLayout from './_core.entry';

beforeEach(() => {
  vi.clearAllMocks();
  state.getSession.mockResolvedValue(state.session);
  state.requireSession.mockReturnValue(state.session);
  state.authorizeTenant.mockResolvedValue({ authority: 'existing-authority' });
  state.requireAdmin.mockResolvedValue(undefined);
});

describe('StaffLayout shared shell composition', () => {
  it.each(['staff', 'branch_manager'])(
    'keeps existing %s admission and client-safe props',
    async role => {
      const session = { user: { ...state.session.user, role } };
      state.getSession.mockResolvedValue(session);
      state.requireSession.mockReturnValue(session);
      render(
        await StaffLayout({ params: Promise.resolve({ locale: 'sq' }), children: <h1>Case</h1> })
      );

      expect(state.getSession).toHaveBeenCalledWith('StaffLayout');
      expect(state.requireSession).toHaveBeenCalledWith(session, 'sq');
      expect(state.admitPortal).toHaveBeenCalledWith(session, ['staff', 'branch_manager']);
      expect(state.requireAdmin).toHaveBeenCalledWith(session, 'existing-authority');
      expect(state.shell).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'staff-1', role }),
          adminAccess: true,
        })
      );
      expect(state.shell.mock.calls[0][0].user).not.toHaveProperty('secret');
      expect(screen.getByRole('heading', { name: 'Case' })).toBeInTheDocument();
    }
  );

  it('preserves the fail-closed account presentation when the admin lookup rejects', async () => {
    state.requireAdmin.mockRejectedValueOnce(new Error('denied'));
    render(await StaffLayout({ params: Promise.resolve({ locale: 'en' }), children: 'Queue' }));
    expect(state.shell).toHaveBeenCalledWith(expect.objectContaining({ adminAccess: false }));
  });
});
