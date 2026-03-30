import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace?: string) => {
    if (namespace === 'dashboard.member_landing') {
      return (key: string) => {
        const messages: Record<string, string> = {
          active_claim_title: 'Kërkesë aktive',
          updated_label: 'Përditësuar',
        };

        return messages[key] ?? key;
      };
    }

    if (namespace === 'claims.status') {
      return (key: string) => {
        const messages: Record<string, string> = {
          court: 'Në gjyq',
        };

        return messages[key] ?? key;
      };
    }

    return (key: string) => {
      const messages: Record<string, string> = {
        court: 'Në gjyq',
      };

      return messages[key] ?? key;
    };
  }),
}));

vi.mock('@/lib/utils/date', () => ({
  formatPilotDateTime: vi.fn(() => '26.03.2026 23:31'),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ActiveClaimFocus } from './active-claim-focus';

describe('ActiveClaimFocus', () => {
  it('does not repeat the localized status when stage and status render identically', async () => {
    const tree = await ActiveClaimFocus({
      claimNumber: null,
      status: 'court',
      stageLabel: 'Në gjyq',
      stageKey: 'court',
      updatedAt: '2026-03-26T22:31:00.000Z',
      locale: 'sq',
    });

    render(tree);

    expect(screen.getByText('Kërkesë aktive')).toBeInTheDocument();
    expect(screen.getAllByText('Në gjyq')).toHaveLength(1);
    expect(screen.getByText('Përditësuar: 26.03.2026 23:31')).toBeInTheDocument();
  });
});
