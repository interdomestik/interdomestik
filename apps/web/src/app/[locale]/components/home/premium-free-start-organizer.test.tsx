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

import { FreeStartIntakeShell, resetAfterRecoveryClear } from './free-start-intake-shell/index';
import {
  ANONYMOUS_DRAFT_KEY,
  getAnonymousDraftStorage,
  removeAnonymousDraft,
} from './free-start-intake-shell/anonymous-draft-recovery';
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
    vi.restoreAllMocks();
    localStorage.clear();
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
      'explicit-only'
    );
    expect(
      screen.getByRole('heading', { name: 'Gather the key facts in one place.' })
    ).toBeInTheDocument();
    expect(screen.getByText('You are continuing with:')).toBeInTheDocument();
    expect(screen.getByText('Personal injury')).toBeInTheDocument();
    expect(screen.queryByTestId('free-start-category-injury')).not.toBeInTheDocument();
    expect(screen.getByLabelText('What happened?')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-trust-boundary')).toHaveTextContent(
      'nothing saves automatically'
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

  it.each(['accessor denial', 'remove failure'])(
    'does not start another draft after %s',
    failure => {
      localStorage.setItem(ANONYMOUS_DRAFT_KEY, 'eligible-notes');
      const available = localStorage;
      if (failure === 'accessor denial') {
        vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
          throw new DOMException('blocked');
        });
      } else {
        // prettier-ignore
        vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue({ getItem: available.getItem.bind(available), removeItem: () => { throw new DOMException('blocked'); }, setItem: available.setItem.bind(available) } as unknown as Storage);
      }
      const startAnother = vi.fn();
      const clear = () => {
        const result = removeAnonymousDraft(getAnonymousDraftStorage());
        return result.status === 'none' || result.status === 'removed';
      };
      expect(resetAfterRecoveryClear(clear, startAnother)).toBe(false);
      expect(startAnother).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe('eligible-notes');
    }
  );
});
