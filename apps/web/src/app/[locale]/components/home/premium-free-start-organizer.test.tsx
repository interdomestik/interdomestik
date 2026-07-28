import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '@/messages/en/freeStart.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

const hoisted = vi.hoisted(() => ({ submit: vi.fn(), generate: vi.fn() }));

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    common: { errors: { retry: 'Please try again.' } },
    freeStart: enMessages.freeStart,
  })),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/support-contacts', () => ({
  getSupportContacts: () => ({ telHref: 'tel:+38349900600' }),
}));

vi.mock('@/lib/analytics', async () => {
  const actual = await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics');
  return {
    ...actual,
    CommercialFunnelEvents: { ...actual.CommercialFunnelEvents, freeStartCompleted: vi.fn() },
  };
});

vi.mock('@/actions/free-start.core', () => ({
  submitFreeStartIntake: (...args: unknown[]) => hoisted.submit(...args),
}));

vi.mock('@/actions/claim-pack.core', () => ({
  generateClaimPackAction: (...args: unknown[]) => hoisted.generate(...args),
}));

import { FreeStartIntakeShell } from './free-start-intake-shell/index';
import { getContinueLabel } from './free-start-intake-shell/helpers';
import type { FreeStartCopy } from './free-start-intake-shell/types';

const translate = ((key: string) => {
  return key.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, enMessages.freeStart) as string;
}) as FreeStartCopy;

describe('premium Free Start organizer', () => {
  beforeEach(() => {
    hoisted.submit.mockReset();
    hoisted.generate.mockReset();
  });

  it('continues a selected situation in the premium organizer without asking twice', () => {
    render(
      <FreeStartIntakeShell
        continueHref="/pricing"
        initialCategory="injury"
        locale="en"
        tenantId="tenant_public"
      />
    );

    expect(screen.getByTestId('premium-free-start-organizer')).toHaveAttribute(
      'data-save-behavior',
      'device-recovery'
    );
    expect(
      screen.getByRole('heading', { name: 'Gather the key facts in one place.' })
    ).toBeInTheDocument();
    expect(screen.getByText('You are continuing with:')).toBeInTheDocument();
    expect(screen.getByText('Personal injury')).toBeInTheDocument();
    expect(screen.queryByTestId('free-start-category-injury')).not.toBeInTheDocument();
    expect(screen.getByLabelText('What happened?')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-trust-boundary')).toHaveTextContent(
      'Eligible vehicle or property facts'
    );
  });

  it('keeps the direct-entry category fallback available', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="en" tenantId="tenant_public" />);

    expect(screen.getByTestId('free-start-category-vehicle')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-property')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-injury')).toBeInTheDocument();
  });

  it('keeps the generated-pack CTA aligned with high confidence guidance', () => {
    expect(getContinueLabel(translate, '/pricing', 'high')).toBe(
      'Join Asistenca for a team review'
    );
  });
});
