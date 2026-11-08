import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardHeader } from './DashboardHeader';

vi.mock('next-intl', () => ({
  useLocale: () => 'de',
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('DashboardHeader', () => {
  it('writes the German dashboard date in German', () => {
    render(<DashboardHeader tenantName="tenant_ks" today={new Date('2026-11-08T12:00:00.000Z')} />);

    expect(
      screen.getByText(/^Sonntag, 8\. November 2026 • admin\.dashboard_v2\.header\.title$/u)
    ).toBeInTheDocument();
  });
});
