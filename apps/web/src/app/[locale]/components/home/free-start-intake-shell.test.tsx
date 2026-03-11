import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import enFreeStartMessages from '@/messages/en/freeStart.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

const hoisted = vi.hoisted(() => ({
  freeStartCompletedMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    freeStart: enFreeStartMessages.freeStart,
  })),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/support-contacts', () => ({
  getSupportContacts: () => ({
    telHref: 'tel:+38349900600',
  }),
}));

vi.mock('@/lib/analytics', async () => {
  const actual = await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics');

  return {
    ...actual,
    CommercialFunnelEvents: {
      ...actual.CommercialFunnelEvents,
      freeStartCompleted: hoisted.freeStartCompletedMock,
    },
  };
});

import { FreeStartIntakeShell } from './free-start-intake-shell';

describe('FreeStartIntakeShell', () => {
  it('shows the three launch categories before the guided intake starts', () => {
    render(<FreeStartIntakeShell continueHref="/register" locale="en" tenantId="tenant_public" />);

    expect(screen.getByTestId('free-start-category-vehicle')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-property')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-injury')).toBeInTheDocument();
  });

  it('lets a public user complete the intake path and generates a pack shell summary', async () => {
    const user = userEvent.setup();

    render(<FreeStartIntakeShell continueHref="/register" locale="en" tenantId="tenant_public" />);

    await user.click(screen.getByTestId('free-start-category-property'));
    await user.click(screen.getByRole('button', { name: 'Continue to guided intake' }));

    await user.selectOptions(screen.getByLabelText('What happened?'), 'water_damage');
    await user.type(screen.getByLabelText('When did it happen?'), '2026-03-01');
    await user.type(screen.getByLabelText('Who are you dealing with?'), 'Building insurer');
    await user.selectOptions(screen.getByLabelText('What do you want to recover?'), 'repair');
    await user.type(
      screen.getByLabelText('Brief summary'),
      'Water entered through the roof after a storm and damaged two rooms.'
    );
    await user.click(screen.getByRole('button', { name: 'Preview your Free Start pack' }));
    await user.click(screen.getByRole('button', { name: 'Finish Free Start' }));

    expect(screen.getByTestId('free-start-complete')).toBeInTheDocument();
    expect(screen.getByText('Property damage')).toBeInTheDocument();
    expect(screen.getByText('Water damage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to membership' })).toHaveAttribute(
      'href',
      '/register'
    );
    expect(hoisted.freeStartCompletedMock).toHaveBeenCalledWith(
      {
        locale: 'en',
        tenantId: 'tenant_public',
        variant: 'hero_v2',
      },
      expect.objectContaining({
        claim_category: 'property',
        intake_issue: 'water_damage',
      })
    );
  });
});
