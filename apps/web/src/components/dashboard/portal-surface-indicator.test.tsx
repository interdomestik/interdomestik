import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(() => ({
      data: {
        user: {
          role: 'branch_manager',
        },
      },
    })),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/sq/staff/claims',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const dictionary: Record<string, string> = {
      portal_label: `Portal: ${values?.portal ?? ''}`,
      surface_label: `Surface: ${values?.surface ?? ''}`,
      'portal.member': 'Member',
      'portal.agent': 'Agent',
      'portal.staff': 'Staff',
      'portal.admin': 'Admin',
      'surface.v3': 'V3',
      'surface.legacy': 'Legacy',
    };

    return dictionary[key] || key;
  },
}));

import { PortalSurfaceIndicator } from './portal-surface-indicator';

describe('PortalSurfaceIndicator', () => {
  it('prefers the canonical staff route over a branch-manager session role', () => {
    render(<PortalSurfaceIndicator />);

    expect(screen.getByTestId('portal-surface-indicator')).toHaveTextContent('Portal: Staff');
  });
});
